import { clipboard } from 'electron'
import { getActiveWindowCached } from './appContext'

export type CapturedContext = {
  selectedText: string | null
  clipboardText: string | null
  appName: string | null
  windowTitle: string | null
  appContext: string
  suggestedTone: 'formal' | 'casual' | 'technical'
}

/**
 * Capture the current application context and optional clipboard/selection.
 * This is a lightweight, safe implementation that avoids sending keypresses.
 */
export async function captureFullContext(skipSelection: boolean, includeClipboard: boolean): Promise<CapturedContext> {
  const active = await getActiveWindowCached()

  let clipboardText: string | null = null
  if (includeClipboard) {
    try {
      const text = clipboard.readText()
      clipboardText = text && text.length > 0 ? text : null
    } catch (e) {
      clipboardText = null
    }
  }

  // For safety we don't attempt to programmatically copy the current selection
  // (doing so can interfere with the user's clipboard). Consumers can opt-in
  // to selection capture later with an explicit implementation.
  const selectedText = skipSelection ? null : null

  return {
    selectedText,
    clipboardText,
    appName: active.processName || null,
    windowTitle: active.windowTitle || null,
    appContext: active.appContext || 'general',
    suggestedTone: active.suggestedTone || 'formal'
  }
}
