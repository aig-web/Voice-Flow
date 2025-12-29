import React, { useEffect, useState, useRef } from 'react'

type ToastType = 'recording' | 'processing' | 'done' | 'error'
type RecordingMode = 'hold' | 'lock'

/**
 * Toast component - Whisper Flow style with live transcription
 *
 * Hold mode: Shows waveform + live words (release hotkey to transcribe)
 * Lock mode: Shows X and Stop buttons + live words
 *
 * Position: Top center of screen
 *
 * State Management:
 * - 'recording': Visible until stopped, NO auto-hide
 * - 'processing': Visible until done/error, has 15s safety timeout
 * - 'done'/'error': Auto-hide after 1.5s
 */
export function ToastWindow() {
  const [visible, setVisible] = useState(false)
  const [type, setType] = useState<ToastType>('recording')
  const [message, setMessage] = useState<string | undefined>()
  const [mode, setMode] = useState<RecordingMode>('hold')
  const [liveText, setLiveText] = useState<string>('')
  const [confirmedText, setConfirmedText] = useState<string>('')

  // Refs for timeout management
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clear all timeouts
  const clearAllTimeouts = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
      processingTimeoutRef.current = null
    }
  }

  useEffect(() => {
    if (window.voiceFlow?.onShowToast) {
      window.voiceFlow.onShowToast((data) => {
        // Clear any existing timeouts when state changes
        clearAllTimeouts()

        setType(data.type)
        setMessage(data.message)
        setMode(data.mode || 'hold')
        setVisible(true)

        // Reset live text when starting new recording
        if (data.type === 'recording') {
          setLiveText('')
          setConfirmedText('')
        }

        // Auto-hide for done/error states
        if (data.type === 'done' || data.type === 'error') {
          hideTimeoutRef.current = setTimeout(() => {
            setVisible(false)
            setLiveText('')
            setConfirmedText('')
          }, 1500)
        }

        // Safety timeout for processing state (15 seconds max)
        if (data.type === 'processing') {
          processingTimeoutRef.current = setTimeout(() => {
            console.warn('[Toast] Processing timeout - forcing hide')
            setType('error')
            setMessage('Processing timed out')
            hideTimeoutRef.current = setTimeout(() => {
              setVisible(false)
              setLiveText('')
              setConfirmedText('')
            }, 1500)
          }, 15000)
        }
      })
    }

    // Listen for live transcription updates
    if (window.voiceFlow?.onLiveTranscription) {
      window.voiceFlow.onLiveTranscription((data) => {
        setLiveText(data.partial || '')
        setConfirmedText(data.confirmed || '')
      })
    }

    // Cleanup on unmount
    return () => {
      clearAllTimeouts()
    }
  }, [])

  // X button - Cancel recording, don't transcribe (only in lock mode)
  const handleCancel = () => {
    clearAllTimeouts()
    if (window.voiceFlow?.cancelRecording) {
      window.voiceFlow.cancelRecording()
    }
    setVisible(false)
    setLiveText('')
    setConfirmedText('')
  }

  // Stop button - Finish speaking and transcribe (only in lock mode)
  const handleStop = () => {
    // Don't clear timeouts here - let processing flow handle it
    if (window.voiceFlow?.stopRecording) {
      window.voiceFlow.stopRecording()
    }
  }

  if (!visible) return null

  return (
    <div className="w-full h-full flex items-center justify-center">
      {/* Recording - Different UI for hold vs lock mode */}
      {type === 'recording' && (
        <div className="flex flex-col items-center gap-2">
          {/* Live transcription text */}
          {(liveText || confirmedText) && (
            <div
              className="px-4 py-2 rounded-xl max-w-md text-center"
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e5e0'
              }}
            >
              <span style={{ fontSize: '14px', color: '#1c1c0d', fontWeight: 500 }}>
                {confirmedText}
              </span>
              {liveText && (
                <span style={{ fontSize: '14px', color: '#666', fontWeight: 400 }}>
                  {confirmedText ? ' ' : ''}{liveText}
                </span>
              )}
            </div>
          )}

          {/* Recording pill */}
          <div
            className="flex items-center gap-1 px-2 py-1.5 rounded-full"
            style={{
              background: '#f9f506',
              boxShadow: '0 4px 20px rgba(249, 245, 6, 0.4)'
            }}
          >
            {/* Lock mode: Show cancel X button */}
            {mode === 'lock' && (
              <button
                onClick={handleCancel}
                title="Cancel (don't transcribe)"
                className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(28, 28, 13, 0.1)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(28, 28, 13, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(28, 28, 13, 0.1)'}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="#1c1c0d" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}

            {/* Waveform bars - always show */}
            <div className="flex items-center gap-0.5 px-2">
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: '3px',
                    height: '14px',
                    background: '#1c1c0d',
                    animation: 'waveform 0.8s ease-in-out infinite',
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </div>

            {/* Lock mode: Show stop button */}
            {mode === 'lock' && (
              <button
                onClick={handleStop}
                title="Finish speaking (transcribe)"
                className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                style={{ background: '#1c1c0d' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a1a'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#1c1c0d'}
              >
                <div style={{ width: '8px', height: '8px', background: '#f9f506', borderRadius: '2px' }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Processing - White pill with spinner */}
      {type === 'processing' && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            background: '#ffffff',
            border: '1px solid #e5e5e0',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
        >
          <svg className="w-4 h-4 animate-spin" style={{ color: '#1c1c0d' }} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#1c1c0d' }}>Processing...</span>
        </div>
      )}

      {/* Done - Yellow pill */}
      {type === 'done' && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            background: '#f9f506',
            boxShadow: '0 4px 20px rgba(249, 245, 6, 0.4)'
          }}
        >
          <svg className="w-4 h-4" style={{ color: '#1c1c0d' }} viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#1c1c0d' }}>{message || 'Done!'}</span>
        </div>
      )}

      {/* Error - White pill with red text */}
      {type === 'error' && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            background: '#ffffff',
            border: '1px solid #fecaca',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
        >
          <svg className="w-4 h-4" style={{ color: '#ef4444' }} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 7v6M12 16v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#ef4444' }}>{message || 'Error'}</span>
        </div>
      )}

      <style>{`
        @keyframes waveform {
          0%, 100% {
            transform: scaleY(0.3);
            opacity: 0.5;
          }
          50% {
            transform: scaleY(1);
            opacity: 1;
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  )
}

export function useToast() {
  const show = (type: ToastType, message?: string) => {
    if (window.voiceFlow?.showToast) {
      window.voiceFlow.showToast(type, message)
    }
  }

  const hide = () => {
    if (window.voiceFlow?.hideToast) {
      window.voiceFlow.hideToast()
    }
  }

  return { show, hide }
}

export default ToastWindow
