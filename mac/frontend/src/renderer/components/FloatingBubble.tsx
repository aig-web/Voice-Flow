import React, { useEffect, useState } from 'react'

type BubbleStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error'

/**
 * FloatingBubble - Minimal whisper-style recording indicator
 * Small pill in bottom-right corner during recording/processing
 */
export function FloatingBubble() {
  const [status, setStatus] = useState<BubbleStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleStartRecording = () => {
      setStatus('recording')
      setVisible(true)
      setErrorMessage('')
    }

    const handleStopRecording = () => {
      setStatus('processing')
    }

    const handleCancelRecording = () => {
      setVisible(false)
      setStatus('idle')
    }

    const handleInjectionDone = () => {
      setStatus('done')
      setTimeout(() => {
        setVisible(false)
        setStatus('idle')
      }, 1500)
    }

    const handleInjectionFailed = (error: string) => {
      setStatus('error')
      setErrorMessage(error)
      setTimeout(() => {
        setVisible(false)
        setStatus('idle')
        setErrorMessage('')
      }, 2500)
    }

    // Register IPC listeners (from Electron main process)
    if (window.voiceFlow) {
      window.voiceFlow.onStartRecording(handleStartRecording)
      window.voiceFlow.onStopRecording(handleStopRecording)
      window.voiceFlow.onCancelRecording(handleCancelRecording)
    }

    // Register window event listeners (from other components)
    const injectionDoneHandler = () => handleInjectionDone()
    const injectionFailedHandler = (e: CustomEvent) => handleInjectionFailed(e.detail)

    window.addEventListener('vf:injection-done', injectionDoneHandler)
    window.addEventListener('vf:injection-failed', injectionFailedHandler as EventListener)

    // Cleanup on unmount
    return () => {
      // Remove window event listeners
      window.removeEventListener('vf:injection-done', injectionDoneHandler)
      window.removeEventListener('vf:injection-failed', injectionFailedHandler as EventListener)

      // Note: IPC listeners are cleaned up by useBackgroundRecorder's removeAllListeners
      // to avoid duplicate cleanup which could cause issues
    }
  }, [])

  if (!visible || status === 'idle') {
    return null
  }

  const handleCancel = () => {
    if (window.voiceFlow?.cancelRecording) {
      window.voiceFlow.cancelRecording()
    }
    setVisible(false)
    setStatus('idle')
  }

  const handleStop = () => {
    if (window.voiceFlow?.stopRecording) {
      window.voiceFlow.stopRecording()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 animate-fade-in">
      {/* Recording Status Pill - Yellow accent like your theme */}
      {status === 'recording' && (
        <>
          {/* Status pill with mic icon */}
          <div className="bg-primary rounded-full pl-2 pr-3 py-1.5 shadow-glow flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-primary-content">mic</span>
            <span className="text-xs font-bold text-primary-content">Recording...</span>
          </div>

          {/* Controls pill */}
          <div className="bg-surface-light border border-border-light rounded-full px-1.5 py-1 shadow-card flex items-center gap-0.5">
            {/* Cancel button */}
            <button
              onClick={handleCancel}
              className="w-5 h-5 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
              title="Cancel"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>

            {/* Waveform bars */}
            <div className="flex items-center gap-px px-1">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-text-muted rounded-full"
                  style={{
                    height: `${6 + (i % 3) * 4}px`,
                    animation: 'pulse 0.6s ease-in-out infinite',
                    animationDelay: `${i * 80}ms`
                  }}
                />
              ))}
            </div>

            {/* Stop button */}
            <button
              onClick={handleStop}
              className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
              title="Stop"
            >
              <div className="w-1.5 h-1.5 bg-white rounded-sm" />
            </button>
          </div>
        </>
      )}

      {/* Processing */}
      {status === 'processing' && (
        <div className="bg-surface-light border border-border-light rounded-full px-3 py-1.5 shadow-card flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-primary-content animate-spin">progress_activity</span>
          <span className="text-xs font-medium text-text-main">Processing...</span>
        </div>
      )}

      {/* Done */}
      {status === 'done' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 shadow-card flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
          <span className="text-xs font-bold text-emerald-600">Done!</span>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-full px-3 py-1.5 shadow-card flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-red-500">error</span>
          <span className="text-xs font-medium text-red-500">{errorMessage || 'Error'}</span>
        </div>
      )}
    </div>
  )
}

export default FloatingBubble
