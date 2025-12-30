import React, { useState, useEffect } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { transcribeAudio } from '../utils/api'
import clsx from 'clsx'

function Recorder() {
  const {
    isRecording,
    hasPermission,
    timer,
    error: permissionError,
    startRecording,
    stopRecording,
    resetTimer,
  } = useAudioRecorder()

  const [transcription, setTranscription] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isInjecting, setIsInjecting] = useState(false)
  const [error, setError] = useState('')

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleRecordClick = async () => {
    if (!isRecording) {
      setTranscription('')
      setError('')
      await startRecording()
    } else {
      const audioBlob = await stopRecording()
      if (audioBlob) {
        await processAudio(audioBlob)
      }
    }
  }

  const processAudio = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true)
      const result = await transcribeAudio(audioBlob)

      if (result.status === 'success') {
        setTranscription(result.polished_text || result.transcription)
        setError('')
      } else {
        setError(result.error || 'Transcription failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe')
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusColor = () => {
    if (error || permissionError) return 'text-red-400'
    if (isProcessing) return 'text-amber-400'
    if (isRecording) return 'text-red-400'
    if (transcription) return 'text-emerald-400'
    return 'text-slate-400'
  }

  const getStatusText = () => {
    if (error) return `Error: ${error}`
    if (permissionError) return `Error: ${permissionError}`
    if (isProcessing) return 'Processing...'
    if (isRecording) return 'Recording...'
    if (transcription) return 'Transcription Complete'
    return 'Ready to Record'
  }

  const handleNewRecording = () => {
    setTranscription('')
    setError('')
    resetTimer()
  }

  const handleInjectText = async () => {
    if (!transcription || isInjecting) return

    try {
      setIsInjecting(true)
      setError('')

      // Check if we're running in Electron
      if (window.voiceFlow && window.voiceFlow.injectText) {
        const result = await window.voiceFlow.injectText(transcription)
        if (!result.ok) {
          setError(result.error || 'Failed to inject text')
        }
      } else {
        // Fallback for browser - just copy to clipboard
        await navigator.clipboard.writeText(transcription)
        setError('Text copied to clipboard (injection only works in desktop app)')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inject text')
    } finally {
      setIsInjecting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent mb-2">
            VOICE-FLOW
          </h1>
          <p className="text-slate-400">AI-Powered Voice Transcription</p>
        </div>

        {/* Glass Container */}
        <div className="glass p-12 space-y-8">
          {/* Status Section */}
          <div className="text-center">
            <p className={clsx('text-sm font-semibold uppercase tracking-wider mb-4', getStatusColor())}>
              {getStatusText()}
            </p>
          </div>

          {/* Timer */}
          <div className="text-center">
            <div className={clsx(
              'text-7xl font-mono font-bold transition-all duration-200',
              isRecording ? 'text-red-400' : 'text-slate-300'
            )}>
              {formatTime(timer)}
            </div>
          </div>

          {/* Record Button */}
          <div className="flex justify-center">
            <button
              onClick={handleRecordClick}
              disabled={!hasPermission || isProcessing}
              className={clsx(
                'relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
                isRecording
                  ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/50 animate-pulse'
                  : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/50 hover:shadow-blue-500/75'
              )}
            >
              {isProcessing ? (
                <svg className="w-16 h-16 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span className="text-5xl">🎤</span>
              )}
            </button>
          </div>

          {/* Instructions */}
          <div className="text-center text-slate-400 text-sm">
            {!hasPermission && <p className="text-red-400">Microphone access required</p>}
            {hasPermission && !isRecording && !transcription && (
              <p>Click the microphone to start recording</p>
            )}
            {isRecording && <p>Speak clearly... Click again to stop</p>}
            {isProcessing && <p>Analyzing your voice...</p>}
          </div>

          {/* Transcription Display */}
          {transcription && (
            <div className="glass-sm p-6 space-y-4 mt-8">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Transcription</p>
              <div className="space-y-3">
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-slate-300 text-sm leading-relaxed">{transcription}</p>
                </div>
              </div>
              <div className="flex gap-3 justify-center pt-4 flex-wrap">
                <button
                  onClick={handleInjectText}
                  disabled={isInjecting}
                  className={clsx(
                    'px-4 py-2 glass-sm text-sm font-medium border transition-all',
                    isInjecting
                      ? 'text-slate-500 border-slate-600 cursor-not-allowed'
                      : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30'
                  )}
                >
                  {isInjecting ? '⏳ Inserting...' : '⌨️ Insert into App'}
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(transcription)}
                  className="px-4 py-2 glass-sm text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/30"
                >
                  📋 Copy
                </button>
                <button
                  onClick={handleNewRecording}
                  className="px-4 py-2 glass-sm text-sm font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-500/10"
                >
                  🔄 New Recording
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-500 text-xs">
          Your transcriptions are saved automatically • Powered by Whisper AI
        </div>
      </div>
    </div>
  )
}

export default Recorder
