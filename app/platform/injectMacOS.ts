/**
 * macOS Text Injection Module
 * Uses AppleScript keystroke command to type text directly
 * NO CLIPBOARD - Direct keyboard simulation like Wispr Flow
 */

import { spawn } from 'child_process'

export interface InjectResult {
  ok: boolean
  error?: string
  method?: 'direct' | 'clipboard-fallback'
}

/**
 * Escapes text for use in AppleScript string literals
 */
function escapeAppleScriptString(text: string): string {
  // Escape backslashes first, then quotes
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

/**
 * Injects text into the currently focused macOS application
 * Uses AppleScript keystroke command - no clipboard used
 */
export async function injectTextMacOS(text: string): Promise<InjectResult> {
  return new Promise((resolve) => {
    if (!text || text.length === 0) {
      resolve({ ok: false, error: 'No text to inject' })
      return
    }

    // Wait 300ms for target app to regain focus after Voice-Flow hides
    setTimeout(() => {
      // Escape the text for AppleScript
      const escapedText = escapeAppleScriptString(text)

      // AppleScript to type the text
      const appleScript = `
tell application "System Events"
  keystroke "${escapedText}"
end tell
`

      console.log('[VF] Injecting text via AppleScript, length:', text.length)

      const osascript = spawn('osascript', ['-e', appleScript])

      let stderr = ''

      osascript.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      osascript.on('error', (err) => {
        console.error('[VF] osascript spawn error:', err)
        resolve({ ok: false, error: `Failed to spawn osascript: ${err.message}` })
      })

      osascript.on('close', (code) => {
        if (code === 0) {
          console.log('[VF] Text injected successfully on macOS')
          resolve({ ok: true })
        } else {
          console.error('[VF] AppleScript injection failed with code:', code, stderr)
          resolve({
            ok: false,
            error: stderr || `osascript exit code ${code}`,
          })
        }
      })

      // Timeout after 30 seconds (for very long text)
      setTimeout(() => {
        osascript.kill()
        resolve({ ok: false, error: 'Injection timed out' })
      }, 30000)
    }, 300)
  })
}
