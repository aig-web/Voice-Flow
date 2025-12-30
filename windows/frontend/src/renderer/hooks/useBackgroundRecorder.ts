/**
 * useBackgroundRecorder Hook
 *
 * NOTE: Audio recording and WebSocket connection are now handled by the main process (main.ts).
 * This hook is DISABLED to prevent duplicate WebSocket connections and double text injection.
 *
 * The main process handles:
 * - FFmpeg audio capture
 * - WebSocket connection to backend
 * - Text injection after transcription
 * - Live transcription updates to toast
 *
 * This hook is kept for backwards compatibility but does nothing.
 */

import { useEffect } from 'react'

export function useBackgroundRecorder() {
  // Main process handles all recording now - this hook is a no-op
  useEffect(() => {
    console.log('[Recorder] Hook initialized - main process handles all recording')
  }, [])
}

export default useBackgroundRecorder
