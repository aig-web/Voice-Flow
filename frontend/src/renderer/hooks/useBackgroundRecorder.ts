/**
 * useBackgroundRecorder Hook - Simple Streaming Mode
 *
 * Uses the legacy /ws/transcribe endpoint for real-time streaming.
 * Sends raw PCM audio continuously, receives partial + final transcription.
 */

import { useEffect, useRef, useCallback } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_URL = API_BASE_URL.replace('http', 'ws')

const SAMPLE_RATE = 16000

export function useBackgroundRecorder() {
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const isRecordingRef = useRef(false)
  const appContextRef = useRef<string>('general')
  const totalTranscriptionRef = useRef<string>('')

  // Send live transcription updates to main process for Toast display
  const sendLiveUpdate = useCallback((partial: string, confirmed: string) => {
    if (window.voiceFlow?.sendLiveTranscription) {
      window.voiceFlow.sendLiveTranscription({ partial, confirmed })
    }
  }, [])

  useEffect(() => {
    console.log('[Recorder] Initializing simple streaming mode...')

    // Get WebSocket token from backend
    const getWsToken = async (): Promise<string> => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/ws-token`)
        const data = await response.json()
        return data.token
      } catch (error) {
        console.error('[Recorder] Failed to get WS token:', error)
        throw error
      }
    }

    // Start audio capture
    const startAudioCapture = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: SAMPLE_RATE,
        },
      })

      streamRef.current = stream

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return

        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN) return

        const inputData = e.inputBuffer.getChannelData(0)

        // Convert float32 to int16 for transmission
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Send PCM data to server
        ws.send(int16Data.buffer)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      isRecordingRef.current = true
      console.log('[Recorder] Audio capture started')
    }

    // Stop audio capture
    const stopAudioCapture = () => {
      if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current = null
      }

      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }

    // Start recording with WebSocket connection
    const handleStartRecording = async (data?: { appContext?: string }) => {
      if (isRecordingRef.current) {
        console.log('[Recorder] Already recording, ignoring start')
        return
      }

      appContextRef.current = data?.appContext || 'general'
      console.log('[Recorder] Starting with context:', appContextRef.current)

      // Reset state
      totalTranscriptionRef.current = ''

      try {
        const token = await getWsToken()

        // Use the simple /ws/transcribe endpoint
        const ws = new WebSocket(`${WS_URL}/ws/transcribe`)
        wsRef.current = ws

        ws.onopen = async () => {
          console.log('[Recorder] WebSocket connected, authenticating...')

          // Send auth message with app context
          ws.send(JSON.stringify({
            type: 'auth',
            token: token,
            app_context: appContextRef.current
          }))

          try {
            await startAudioCapture()
            console.log('[Recorder] Recording started - streaming audio')
          } catch (err) {
            console.error('[Recorder] Audio capture failed:', err)
            ws.close()
            dispatchError('Microphone access denied')
          }
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            if (data.error) {
              console.error('[Recorder] Server error:', data.error)
              dispatchError(data.error)
              return
            }

            // Handle partial transcription (live updates)
            if (data.type === 'partial') {
              console.log('[Recorder] Partial:', data.partial?.substring(0, 30))
              sendLiveUpdate(data.partial || '', data.confirmed || '')
            }

            // Handle final transcription
            if (data.type === 'final') {
              const text = data.text || data.raw || ''
              console.log('[Recorder] Final text:', text?.substring(0, 60))

              totalTranscriptionRef.current = text

              // Send to main process for injection
              if (window.voiceFlow?.sendRecordingComplete) {
                window.voiceFlow.sendRecordingComplete(text)
              }

              // Update toast with final transcription
              sendLiveUpdate('', text)

              dispatchSuccess()
              window.dispatchEvent(new Event('transcription-saved'))

              // Close WebSocket after receiving final
              ws.close()
            }
          } catch (e) {
            console.error('[Recorder] Parse error:', e)
          }
        }

        ws.onerror = (error) => {
          console.error('[Recorder] WebSocket error:', error)
          dispatchError('Connection error')
          cleanup()
        }

        ws.onclose = () => {
          console.log('[Recorder] WebSocket closed')
          wsRef.current = null
        }

      } catch (error) {
        console.error('[Recorder] Failed to start:', error)
        const message = error instanceof Error ? error.message : 'Failed to start recording'
        dispatchError(message)
      }
    }

    // Stop recording - send stop command and wait for final
    const handleStopRecording = async () => {
      if (!isRecordingRef.current) {
        console.log('[Recorder] Not recording, ignoring stop')
        return
      }

      console.log('[Recorder] Stopping recording...')
      isRecordingRef.current = false

      // Stop audio capture first
      stopAudioCapture()

      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Send stop command - server will respond with final transcription
        console.log('[Recorder] Sending stop command')
        ws.send('stop')
        // Don't close WebSocket - wait for final message
      } else {
        console.error('[Recorder] WebSocket not ready for stop')
        dispatchError('Connection not ready')
        cleanup()
      }
    }

    // Cancel recording
    const handleCancelRecording = () => {
      if (!isRecordingRef.current) {
        console.log('[Recorder] Not recording, ignoring cancel')
        return
      }

      console.log('[Recorder] Canceling...')
      isRecordingRef.current = false
      cleanup()
    }

    // Full cleanup
    const cleanup = () => {
      isRecordingRef.current = false
      stopAudioCapture()

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }

    // Helper dispatchers
    const dispatchSuccess = () => {
      window.dispatchEvent(new CustomEvent('vf:injection-done'))
      if (window.voiceFlow?.sendInjectionDone) {
        window.voiceFlow.sendInjectionDone()
      }
    }

    const dispatchError = (error: string) => {
      window.dispatchEvent(new CustomEvent('vf:injection-failed', { detail: error }))
      if (window.voiceFlow?.sendRecordingError) {
        window.voiceFlow.sendRecordingError(error)
      }
    }

    // Register listeners via IPC
    if (window.voiceFlow) {
      window.voiceFlow.onStartRecording(handleStartRecording)
      window.voiceFlow.onStopRecording(handleStopRecording)
      window.voiceFlow.onCancelRecording(handleCancelRecording)
    }

    // Also listen for CustomEvent fallback (when IPC fails during HMR)
    const handleStartEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      console.log('[Recorder] CustomEvent fallback: start-recording', detail)
      handleStartRecording(detail)
    }
    const handleStopEvent = () => {
      console.log('[Recorder] CustomEvent fallback: stop-recording')
      handleStopRecording()
    }
    const handleCancelEvent = () => {
      console.log('[Recorder] CustomEvent fallback: cancel-recording')
      handleCancelRecording()
    }

    window.addEventListener('vf:start-recording', handleStartEvent)
    window.addEventListener('vf:stop-recording', handleStopEvent)
    window.addEventListener('vf:cancel-recording', handleCancelEvent)

    console.log('[Recorder] Initialized - ready for streaming recording')

    // Cleanup on unmount
    return () => {
      console.log('[Recorder] Cleaning up...')
      cleanup()

      window.removeEventListener('vf:start-recording', handleStartEvent)
      window.removeEventListener('vf:stop-recording', handleStopEvent)
      window.removeEventListener('vf:cancel-recording', handleCancelEvent)

      if (window.voiceFlow?.removeAllListeners) {
        window.voiceFlow.removeAllListeners()
      }
    }
  }, [sendLiveUpdate])
}

export default useBackgroundRecorder
