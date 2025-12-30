/**
 * macOS Text Injection Router
 * Routes text injection to the macOS implementation
 */

import { clipboard } from 'electron'
import { injectTextMacOS, InjectResult } from './injectMacOS'

export type { InjectResult }

/**
 * Injects text into the currently focused application
 * Uses direct keyboard simulation first, falls back to clipboard if needed
 * Works in Slack, Discord, Gmail, VS Code, terminals, etc.
 */
export async function injectText(text: string): Promise<InjectResult> {
  console.log(`[VF] injectText called, platform: darwin, text length: ${text?.length}`)

  if (!text || text.trim().length === 0) {
    return { ok: false, error: 'No text to inject' }
  }

  // Use macOS AppleScript injection
  const result = await injectTextMacOS(text)

  // If direct injection failed, fallback to clipboard
  if (!result.ok) {
    console.warn(`[VF] Direct injection failed: ${result.error}, using clipboard fallback`)
    try {
      clipboard.writeText(text)
      return {
        ok: true,
        method: 'clipboard-fallback',
        error: `Direct injection failed. Text copied to clipboard - press Cmd+V to paste.`
      }
    } catch (clipboardError) {
      console.error('[VF] Clipboard fallback also failed:', clipboardError)
      return {
        ok: false,
        error: `Both direct injection and clipboard failed: ${result.error}`
      }
    }
  }

  return { ...result, method: 'direct' }
}
