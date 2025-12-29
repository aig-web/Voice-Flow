/**
 * Linux Text Injection Module
 *
 * Uses xdotool for text injection on Linux (X11).
 * For Wayland, falls back to clipboard + notification.
 *
 * Prerequisites:
 * - xdotool: sudo apt install xdotool
 * - xclip (for clipboard fallback): sudo apt install xclip
 */

import { spawn } from 'child_process'
import { clipboard } from 'electron'

export interface InjectResult {
  ok: boolean
  error?: string
  method?: 'direct' | 'clipboard-fallback'
}

/**
 * Check if xdotool is available
 */
async function hasXdotool(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', ['xdotool'])
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Check if running on Wayland
 */
function isWayland(): boolean {
  return process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY
}

/**
 * Injects text into the currently focused Linux application.
 *
 * On X11: Uses xdotool to type the text directly
 * On Wayland: Falls back to clipboard (xdotool doesn't work on Wayland)
 */
export async function injectTextLinux(text: string): Promise<InjectResult> {
  return new Promise(async (resolve) => {
    // Validate input
    if (!text || text.length === 0) {
      resolve({ ok: false, error: 'No text to inject' })
      return
    }

    console.log('[VF-INJECT-LINUX] Starting injection, text length:', text.length)

    // Check for Wayland - xdotool doesn't work there
    if (isWayland()) {
      console.log('[VF-INJECT-LINUX] Wayland detected, using clipboard fallback')
      clipboard.writeText(text)
      resolve({
        ok: true,
        method: 'clipboard-fallback',
        error: 'Wayland detected. Text copied to clipboard - press Ctrl+V to paste.'
      })
      return
    }

    // Check if xdotool is available
    const hasXdo = await hasXdotool()
    if (!hasXdo) {
      console.log('[VF-INJECT-LINUX] xdotool not found, using clipboard fallback')
      clipboard.writeText(text)
      resolve({
        ok: true,
        method: 'clipboard-fallback',
        error: 'xdotool not installed. Text copied to clipboard - press Ctrl+V to paste. Install with: sudo apt install xdotool'
      })
      return
    }

    // Wait for focus to return to target app
    setTimeout(() => {
      // Use xdotool to type the text
      // --clearmodifiers ensures Ctrl/Alt aren't held down
      const proc = spawn('xdotool', ['type', '--clearmodifiers', '--delay', '0', '--', text])

      let stderr = ''
      let hasResolved = false

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('error', (err) => {
        if (hasResolved) return
        hasResolved = true
        console.error('[VF-INJECT-LINUX] xdotool spawn failed:', err.message)
        // Fallback to clipboard
        clipboard.writeText(text)
        resolve({
          ok: true,
          method: 'clipboard-fallback',
          error: `xdotool failed: ${err.message}. Text copied to clipboard.`
        })
      })

      proc.on('close', (exitCode) => {
        if (hasResolved) return
        hasResolved = true

        if (exitCode === 0) {
          console.log('[VF-INJECT-LINUX] SUCCESS - Text typed via xdotool')
          resolve({ ok: true, method: 'direct' })
        } else {
          console.error('[VF-INJECT-LINUX] FAILED - Exit code:', exitCode, 'stderr:', stderr)
          // Fallback to clipboard
          clipboard.writeText(text)
          resolve({
            ok: true,
            method: 'clipboard-fallback',
            error: stderr || `xdotool exit code ${exitCode}. Text copied to clipboard.`
          })
        }
      })

      // Safety timeout
      setTimeout(() => {
        if (hasResolved) return
        hasResolved = true
        try { proc.kill() } catch {}
        console.error('[VF-INJECT-LINUX] TIMEOUT after 10s')
        clipboard.writeText(text)
        resolve({
          ok: true,
          method: 'clipboard-fallback',
          error: 'xdotool timed out. Text copied to clipboard.'
        })
      }, 10000)

    }, 300) // 300ms delay for focus
  })
}
