/**
 * Windows Text Injection Module
 *
 * WISPR FLOW STYLE: Clipboard + Paste (NO character-by-character typing)
 *
 * This module NEVER types characters individually.
 * It sets the clipboard and sends Ctrl+V - completely Caps Lock independent.
 */

import { spawn } from 'child_process'

export interface InjectResult {
  ok: boolean
  error?: string
  method?: 'direct' | 'clipboard-fallback'
}

/**
 * Safely encodes text for PowerShell by using Base64 encoding.
 * This prevents command injection attacks that could occur with string escaping.
 */
function encodeForPowerShell(text: string): string {
  // Convert to UTF-16LE (what PowerShell uses internally) then Base64
  const buffer = Buffer.from(text, 'utf16le')
  return buffer.toString('base64')
}

/**
 * Injects text into the currently focused Windows application.
 *
 * METHOD: Set-Clipboard -> Ctrl+V (single paste operation)
 *
 * ZERO character loops. ZERO SendKeys per character.
 * Completely independent of Caps Lock state.
 *
 * SECURITY: Uses Base64 encoding to prevent PowerShell command injection.
 */
export async function injectTextWindows(text: string): Promise<InjectResult> {
  return new Promise((resolve) => {
    // Validate input
    if (!text || text.length === 0) {
      resolve({ ok: false, error: 'No text to inject' })
      return
    }

    console.log('[VF-INJECT] Starting clipboard injection, text length:', text.length)

    // Wait longer for user to fully release hotkey (Ctrl+Alt) before we send Ctrl+V
    // This prevents key collision where user's held Ctrl interferes with our paste
    setTimeout(() => {
      // SECURITY FIX: Use Base64 encoding to prevent command injection
      // Previously used string escaping which was vulnerable to injection attacks
      const encodedText = encodeForPowerShell(text)

      // PowerShell command using WScript.Shell for simple, reliable paste
      const command = `
$text = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedText}'))
Set-Clipboard -Value $text
Start-Sleep -Milliseconds 200
$wsh = New-Object -ComObject WScript.Shell
$wsh.SendKeys('^v')
`

      console.log('[VF-INJECT] Executing: Set-Clipboard + Ctrl+V (Base64 encoded)')

      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', command
      ])

      let stderrOutput = ''
      let hasResolved = false

      ps.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString()
      })

      ps.on('error', (err) => {
        if (hasResolved) return
        hasResolved = true
        console.error('[VF-INJECT] PowerShell spawn failed:', err.message)
        resolve({ ok: false, error: `PowerShell error: ${err.message}` })
      })

      ps.on('close', (exitCode) => {
        if (hasResolved) return
        hasResolved = true

        if (exitCode === 0) {
          console.log('[VF-INJECT] SUCCESS - Text pasted via clipboard')
          resolve({ ok: true, method: 'clipboard-fallback' })
        } else {
          console.error('[VF-INJECT] FAILED - Exit code:', exitCode, 'stderr:', stderrOutput)
          resolve({ ok: false, error: stderrOutput || `Exit code ${exitCode}` })
        }
      })

      // Safety timeout
      setTimeout(() => {
        if (hasResolved) return
        hasResolved = true
        try { ps.kill() } catch {}
        console.error('[VF-INJECT] TIMEOUT after 10s')
        resolve({ ok: false, error: 'Injection timed out' })
      }, 10000)

    }, 600) // 600ms delay - wait for user to fully release Ctrl+Alt hotkey
  })
}
