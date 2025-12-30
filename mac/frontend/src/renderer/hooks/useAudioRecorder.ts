import { useState, useRef, useEffect, useCallback } from 'react'

interface UseAudioRecorderResult {
  isRecording: boolean
  hasPermission: boolean
  timer: number
  error: string | null
  requestPermission: () => Promise<void>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  resetTimer: () => void
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [timer, setTimer] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerIntervalRef = useRef<number | null>(null)

  // Request microphone permission
  const requestPermission = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })
      streamRef.current = stream
      setHasPermission(true)

      // Stop the stream immediately - we'll request it again when recording starts
      stream.getTracks().forEach(track => track.stop())
      streamRef.current = null
    } catch (err) {
      console.error('Microphone permission error:', err)
      setError('Microphone access denied. Please grant permission to record audio.')
      setHasPermission(false)
    }
  }, [])

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null)
      audioChunksRef.current = []

      // Get fresh media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })
      streamRef.current = stream

      // Create MediaRecorder with appropriate mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)

      // Start timer
      setTimer(0)
      timerIntervalRef.current = window.setInterval(() => {
        setTimer(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error('Recording start error:', err)
      setError('Failed to start recording. Please check microphone permissions.')
      setIsRecording(false)
    }
  }, [])

  // Stop recording
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current

      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null)
        return
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })

        // Clean up
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }

        mediaRecorderRef.current = null
        setIsRecording(false)

        // Stop timer
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
        }

        resolve(audioBlob)
      }

      mediaRecorder.stop()
    })
  }, [])

  // Reset timer
  const resetTimer = useCallback(() => {
    setTimer(0)
  }, [])

  // Request permission on mount
  useEffect(() => {
    requestPermission()
  }, [requestPermission])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

  return {
    isRecording,
    hasPermission,
    timer,
    error,
    requestPermission,
    startRecording,
    stopRecording,
    resetTimer,
  }
}
