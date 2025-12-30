/**
 * BackgroundRecorder Service
 * Handles audio recording triggered by global hotkey from Electron main process
 * Streams audio to backend via WebSocket for real-time transcription
 */

import { transcribeAudio } from '../utils/api'

// Use environment variable for API URL, fallback to localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws')

let mediaRecorder: MediaRecorder | null = null
let audioContext: AudioContext | null = null
let scriptProcessor: ScriptProcessorNode | null = null
let mediaStream: MediaStream | null = null
let websocket: WebSocket | null = null
let isRecording = false
let useStreaming = true // Enable streaming mode

// Callback for partial transcriptions (live words)
let onPartialTranscription: ((partial: string, confirmed: string) => void) | null = null

/**
 * Set callback for partial transcriptions
 */
export function setPartialTranscriptionCallback(callback: (partial: string, confirmed: string) => void) {
  onPartialTranscription = callback
}

/**
 * Initialize the background recorder listeners
 * Call this once when the app starts
 */
export function initBackgroundRecorder() {
  console.log('[BackgroundRecorder] Initializing with streaming support...')

  // Listen for start recording command from main process
  if (window.voiceFlow?.onStartRecording) {
    window.voiceFlow.onStartRecording(() => {
      console.log('[BackgroundRecorder] Start recording command received')
      startRecording()
    })
  }

  // Listen for stop recording command from main process
  if (window.voiceFlow?.onStopRecording) {
    window.voiceFlow.onStopRecording(() => {
      console.log('[BackgroundRecorder] Stop recording command received')
      stopRecording()
    })
  }

  // Listen for cancel recording command from main process
  if (window.voiceFlow?.onCancelRecording) {
    window.voiceFlow.onCancelRecording(() => {
      console.log('[BackgroundRecorder] Cancel recording command received')
      cancelRecording()
    })
  }

  console.log('[BackgroundRecorder] Initialized')
}

/**
 * Start recording audio with WebSocket streaming
 */
async function startRecording() {
  if (isRecording) {
    console.log('[BackgroundRecorder] Already recording, ignoring start')
    return
  }

  try {
    console.log('[BackgroundRecorder] Requesting microphone access...')
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }
    })

    isRecording = true

    if (useStreaming) {
      // Streaming mode: Use WebSocket
      await startStreamingRecording()
    } else {
      // Batch mode: Use MediaRecorder
      await startBatchRecording()
    }

    console.log('[BackgroundRecorder] Recording started')
  } catch (error) {
    console.error('[BackgroundRecorder] Failed to start recording:', error)
    window.voiceFlow?.sendRecordingError(
      error instanceof Error ? error.message : 'Failed to access microphone'
    )
    isRecording = false
  }
}

/**
 * Start streaming recording via WebSocket
 */
async function startStreamingRecording() {
  if (!mediaStream) return

  try {
    // Get WebSocket auth token from backend
    const tokenResponse = await fetch(`${API_BASE_URL}/api/ws-token`)
    if (!tokenResponse.ok) {
      throw new Error('Failed to get WebSocket token')
    }
    const { token } = await tokenResponse.json()

    // Connect to WebSocket
    websocket = new WebSocket(`${WS_BASE_URL}/ws/transcribe`)

    websocket.onopen = () => {
      console.log('[BackgroundRecorder] WebSocket connected, authenticating...')
      // Send authentication token as first message
      websocket?.send(JSON.stringify({ type: 'auth', token }))
    }

  websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'partial') {
        console.log('[BackgroundRecorder] Partial:', data.partial?.substring(0, 50))
        if (onPartialTranscription) {
          onPartialTranscription(data.partial || '', data.confirmed || '')
        }
        // Send live transcription to toast window
        if (window.voiceFlow?.sendLiveTranscription) {
          window.voiceFlow.sendLiveTranscription(data.partial || '', data.confirmed || '')
        }
      } else if (data.type === 'final') {
        // Final transcription received - inject text
        console.log('[BackgroundRecorder] === FINAL TRANSCRIPTION RECEIVED (STREAMING) ===')
        const text = data.text || data.raw || ''
        console.log('[BackgroundRecorder] Final text:', text ? `"${text.substring(0, 50)}..."` : '(empty)')
        console.log('[BackgroundRecorder] Text length:', text?.length || 0)

        // Always call sendRecordingComplete to finish the flow (even with empty text)
        console.log('[BackgroundRecorder] >>> Calling sendRecordingComplete <<<')
        if (window.voiceFlow?.sendRecordingComplete) {
          window.voiceFlow.sendRecordingComplete(text)
          console.log('[BackgroundRecorder] sendRecordingComplete called successfully')
        } else {
          console.error('[BackgroundRecorder] window.voiceFlow.sendRecordingComplete is not available!')
        }
        window.dispatchEvent(new Event('transcription-saved'))

        // Close WebSocket after receiving final
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          websocket.close()
        }
        websocket = null
        console.log('[BackgroundRecorder] === FINAL TRANSCRIPTION DONE ===')
      }
    } catch (e) {
      console.error('[BackgroundRecorder] Failed to parse WebSocket message:', e)
    }
  }

  websocket.onerror = (error) => {
    console.error('[BackgroundRecorder] WebSocket error:', error)
    // Fallback to batch mode only if we're still recording
    if (isRecording) {
      console.log('[BackgroundRecorder] Falling back to batch mode')
      useStreaming = false
      websocket = null
      startBatchRecording()
    }
  }

  websocket.onclose = () => {
    console.log('[BackgroundRecorder] WebSocket closed')
    websocket = null
  }

  // Create AudioContext for raw PCM streaming
  audioContext = new AudioContext({ sampleRate: 16000 })
  const source = audioContext.createMediaStreamSource(mediaStream)

  // Use ScriptProcessorNode to get raw PCM data
  // Note: ScriptProcessorNode is deprecated but AudioWorklet requires more setup
  const bufferSize = 4096
  scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1)

  scriptProcessor.onaudioprocess = (event) => {
    if (!isRecording || !websocket || websocket.readyState !== WebSocket.OPEN) {
      return
    }

    const inputData = event.inputBuffer.getChannelData(0)

    // Convert float32 to int16 for transmission
    const int16Data = new Int16Array(inputData.length)
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]))
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }

    // Send PCM data to server
    websocket.send(int16Data.buffer)
  }

  source.connect(scriptProcessor)
  scriptProcessor.connect(audioContext.destination)
  } catch (error) {
    console.error('[BackgroundRecorder] Failed to start streaming:', error)
    // Fallback to batch mode
    useStreaming = false
    await startBatchRecording()
  }
}

/**
 * Start batch recording using MediaRecorder (fallback)
 */
async function startBatchRecording() {
  if (!mediaStream) return

  const audioChunks: Blob[] = []

  mediaRecorder = new MediaRecorder(mediaStream, {
    mimeType: 'audio/webm;codecs=opus',
  })

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data)
    }
  }

  mediaRecorder.onstop = async () => {
    console.log('[BackgroundRecorder] MediaRecorder stopped, processing audio...')

    // Stop all tracks
    mediaStream?.getTracks().forEach((track) => track.stop())

    if (audioChunks.length === 0) {
      console.log('[BackgroundRecorder] No audio recorded')
      window.voiceFlow?.sendRecordingError('No audio recorded')
      return
    }

    // Create audio blob
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
    console.log('[BackgroundRecorder] Audio blob created, size:', audioBlob.size)

    // Send to backend for transcription
    await processAudio(audioBlob)
  }

  mediaRecorder.onerror = (event) => {
    console.error('[BackgroundRecorder] MediaRecorder error:', event)
    window.voiceFlow?.sendRecordingError('Recording error')
    isRecording = false
  }

  mediaRecorder.start(100)
}

/**
 * Stop recording and process the audio
 */
function stopRecording() {
  if (!isRecording) {
    console.log('[BackgroundRecorder] Not recording, ignoring stop')
    return
  }

  console.log('[BackgroundRecorder] Stopping recording...')
  isRecording = false

  if (useStreaming && websocket) {
    // Streaming mode: Send stop command and wait for final transcription
    if (scriptProcessor) {
      scriptProcessor.disconnect()
      scriptProcessor = null
    }
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }

    // Stop media stream
    mediaStream?.getTracks().forEach((track) => track.stop())
    mediaStream = null

    // Send stop command to server - it will respond with final transcription
    if (websocket.readyState === WebSocket.OPEN) {
      console.log('[BackgroundRecorder] Sending stop command to server')
      websocket.send('stop')
      // Don't close websocket here - wait for final message handler to close it
    }
  } else if (mediaRecorder) {
    // Batch mode
    mediaRecorder.stop()
  }
}

/**
 * Cancel recording without processing
 */
function cancelRecording() {
  if (!isRecording) {
    console.log('[BackgroundRecorder] Not recording, ignoring cancel')
    return
  }

  console.log('[BackgroundRecorder] Canceling recording...')
  isRecording = false

  // Clean up streaming resources
  if (scriptProcessor) {
    scriptProcessor.disconnect()
    scriptProcessor = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  if (websocket) {
    websocket.close()
    websocket = null
  }

  // Stop media stream
  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null

  // Clean up batch resources
  if (mediaRecorder) {
    mediaRecorder = null
  }
}

/**
 * Send audio to backend for transcription and polish (batch mode)
 */
async function processAudio(audioBlob: Blob) {
  console.log('[BackgroundRecorder] === PROCESSING AUDIO (BATCH MODE) ===')
  try {
    console.log('[BackgroundRecorder] Sending audio to backend, size:', audioBlob.size)

    const result = await transcribeAudio(audioBlob)
    console.log('[BackgroundRecorder] API response:', JSON.stringify(result))

    if (result.status === 'success') {
      const text = result.polished_text || result.transcription || ''
      console.log('[BackgroundRecorder] Transcription result:', text ? `"${text.substring(0, 50)}..."` : '(empty)')
      console.log('[BackgroundRecorder] Text length:', text?.length || 0)

      // ALWAYS call sendRecordingComplete - even with empty text
      // Main process will handle showing "No speech detected"
      console.log('[BackgroundRecorder] >>> Calling sendRecordingComplete <<<')
      if (window.voiceFlow?.sendRecordingComplete) {
        window.voiceFlow.sendRecordingComplete(text)
        console.log('[BackgroundRecorder] sendRecordingComplete called successfully')
      } else {
        console.error('[BackgroundRecorder] window.voiceFlow.sendRecordingComplete is not available!')
      }

      // Dispatch event so History component refreshes
      window.dispatchEvent(new Event('transcription-saved'))
    } else {
      console.error('[BackgroundRecorder] Transcription failed:', result.error)
      console.log('[BackgroundRecorder] >>> Calling sendRecordingError <<<')
      window.voiceFlow?.sendRecordingError(result.error || 'Transcription failed')
    }
  } catch (error) {
    console.error('[BackgroundRecorder] API error:', error)
    console.log('[BackgroundRecorder] >>> Calling sendRecordingError due to exception <<<')
    window.voiceFlow?.sendRecordingError(
      error instanceof Error ? error.message : 'Failed to transcribe'
    )
  }
  console.log('[BackgroundRecorder] === PROCESSING AUDIO DONE ===')
}

/**
 * Check if currently recording
 */
export function getIsRecording() {
  return isRecording
}

/**
 * Toggle streaming mode
 */
export function setStreamingMode(enabled: boolean) {
  useStreaming = enabled
  console.log('[BackgroundRecorder] Streaming mode:', enabled ? 'enabled' : 'disabled')
}
