/**
 * Platform-agnostic Text Injection Router
 * Routes text injection to the appropriate platform-specific implementation
 * Primary: Direct keyboard simulation like Wispr Flow
 * Fallback: Clipboard if direct injection fails
 */

import { clipboard } from 'electron'
import { injectTextWindows, InjectResult } from './injectWindows'
import { injectTextMacOS } from './injectMacOS'
import { injectTextLinux } from './injectLinux'

export type { InjectResult }

/**
 * Injects text into the currently focused application
 * Uses direct keyboard simulation first, falls back to clipboard if needed
 * Works in Slack, Discord, Gmail, VS Code, terminals, etc.
 */
export async function injectText(text: string): Promise<InjectResult> {
  const platform = process.platform

  console.log(`[VF] injectText called, platform: ${platform}, text length: ${text?.length}`)

  if (!text || text.trim().length === 0) {
    return { ok: false, error: 'No text to inject' }
  }

  let result: InjectResult

  switch (platform) {
    case 'win32':
      result = await injectTextWindows(text)
      break

    case 'darwin':
      result = await injectTextMacOS(text)
      break

    case 'linux':
      result = await injectTextLinux(text)
      break

    default:
      result = { ok: false, error: `Unsupported platform: ${platform}` }
      break
  }

  // If direct injection failed, fallback to clipboard
  if (!result.ok) {
    console.warn(`[VF] Direct injection failed: ${result.error}, using clipboard fallback`)
    try {
      clipboard.writeText(text)
      return {
        ok: true,
        method: 'clipboard-fallback',
        error: `Direct injection failed. Text copied to clipboard - press Ctrl+V to paste.`
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
