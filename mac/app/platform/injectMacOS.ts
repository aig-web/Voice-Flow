/**
 * macOS Text Injection Module
 *
 * WISPR FLOW STYLE: Clipboard + Paste (NO character-by-character typing)
 *
 * This module NEVER types characters individually.
 * It sets the clipboard and sends Cmd+V - instant paste.
 */

import { spawn, execSync } from 'child_process'
import { clipboard } from 'electron'

export interface InjectResult {
  ok: boolean
  error?: string
  method?: 'direct' | 'clipboard-fallback'
}

/**
 * Injects text into the currently focused macOS application.
 *
 * METHOD: Set clipboard -> Cmd+V (single paste operation)
 *
 * ZERO character loops. Completely instant.
 */
export async function injectTextMacOS(text: string): Promise<InjectResult> {
  return new Promise((resolve) => {
    if (!text || text.length === 0) {
      resolve({ ok: false, error: 'No text to inject' })
      return
    }

    console.log('[VF-INJECT] Starting clipboard injection, text length:', text.length)

    // Save current clipboard content to restore later (optional)
    let previousClipboard: string | null = null
    try {
      previousClipboard = clipboard.readText()
    } catch (e) {
      // Ignore - clipboard might be empty or contain non-text
    }

    // Set our text to clipboard
    try {
      clipboard.writeText(text)
    } catch (e) {
      console.error('[VF-INJECT] Failed to write to clipboard:', e)
      resolve({ ok: false, error: 'Failed to write to clipboard' })
      return
    }

    // Small delay to ensure clipboard is set
    setTimeout(() => {
      // AppleScript to send Cmd+V (paste)
      const appleScript = `
tell application "System Events"
  keystroke "v" using command down
end tell
`

      console.log('[VF-INJECT] Executing: Clipboard + Cmd+V paste')

      const osascript = spawn('osascript', ['-e', appleScript])

      let stderr = ''
      let hasResolved = false

      osascript.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      osascript.on('error', (err) => {
        if (hasResolved) return
        hasResolved = true
        console.error('[VF-INJECT] osascript spawn error:', err)
        resolve({ ok: false, error: `Failed to spawn osascript: ${err.message}` })
      })

      osascript.on('close', (code) => {
        if (hasResolved) return
        hasResolved = true

        if (code === 0) {
          console.log('[VF-INJECT] SUCCESS - Text pasted via clipboard')

          // Optionally restore previous clipboard after a delay
          if (previousClipboard !== null) {
            setTimeout(() => {
              try {
                clipboard.writeText(previousClipboard!)
              } catch (e) {
                // Ignore restore errors
              }
            }, 500)
          }

          resolve({ ok: true, method: 'clipboard-fallback' })
        } else {
          console.error('[VF-INJECT] FAILED - Exit code:', code, 'stderr:', stderr)
          resolve({
            ok: false,
            error: stderr || `osascript exit code ${code}`,
          })
        }
      })

      // Safety timeout
      setTimeout(() => {
        if (hasResolved) return
        hasResolved = true
        try { osascript.kill() } catch {}
        console.error('[VF-INJECT] TIMEOUT after 10s')
        resolve({ ok: false, error: 'Injection timed out' })
      }, 10000)

    }, 30) // 30ms delay for clipboard to be set
  })
}
