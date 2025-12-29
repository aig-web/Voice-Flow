/**
 * App Context Detection for Windows
 * Detects the active application and determines appropriate tone/context
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export type AppContextType = 'email' | 'chat' | 'code' | 'document' | 'browser' | 'general'

export interface ActiveWindowInfo {
  processName: string
  windowTitle: string
  appContext: AppContextType
  suggestedTone: 'formal' | 'casual' | 'technical'
}

// App classification rules
const APP_CLASSIFICATIONS: Record<string, { context: AppContextType; tone: 'formal' | 'casual' | 'technical' }> = {
  // Email clients
  'outlook': { context: 'email', tone: 'formal' },
  'thunderbird': { context: 'email', tone: 'formal' },

  // Chat apps
  'slack': { context: 'chat', tone: 'casual' },
  'discord': { context: 'chat', tone: 'casual' },
  'teams': { context: 'chat', tone: 'formal' },
  'telegram': { context: 'chat', tone: 'casual' },
  'whatsapp': { context: 'chat', tone: 'casual' },

  // Code editors/IDEs
  'code': { context: 'code', tone: 'technical' },  // VS Code
  'cursor': { context: 'code', tone: 'technical' },
  'windsurf': { context: 'code', tone: 'technical' },
  'idea': { context: 'code', tone: 'technical' },
  'pycharm': { context: 'code', tone: 'technical' },
  'webstorm': { context: 'code', tone: 'technical' },
  'sublime': { context: 'code', tone: 'technical' },
  'notepad++': { context: 'code', tone: 'technical' },
  'windowsterminal': { context: 'code', tone: 'technical' },
  'powershell': { context: 'code', tone: 'technical' },
  'cmd': { context: 'code', tone: 'technical' },

  // Document editors
  'word': { context: 'document', tone: 'formal' },
  'winword': { context: 'document', tone: 'formal' },
  'notion': { context: 'document', tone: 'formal' },
  'obsidian': { context: 'document', tone: 'formal' },
  'onenote': { context: 'document', tone: 'formal' },

  // Browsers
  'chrome': { context: 'browser', tone: 'formal' },
  'firefox': { context: 'browser', tone: 'formal' },
  'edge': { context: 'browser', tone: 'formal' },
  'brave': { context: 'browser', tone: 'formal' },
}

// Browser URL patterns for more specific context
const BROWSER_URL_PATTERNS: Record<string, { context: AppContextType; tone: 'formal' | 'casual' | 'technical' }> = {
  'gmail': { context: 'email', tone: 'formal' },
  'mail.google': { context: 'email', tone: 'formal' },
  'outlook.live': { context: 'email', tone: 'formal' },
  'slack.com': { context: 'chat', tone: 'casual' },
  'discord.com': { context: 'chat', tone: 'casual' },
  'teams.microsoft': { context: 'chat', tone: 'formal' },
  'github.com': { context: 'code', tone: 'technical' },
  'stackoverflow': { context: 'code', tone: 'technical' },
  'docs.google': { context: 'document', tone: 'formal' },
  'notion.so': { context: 'document', tone: 'formal' },
  'linkedin': { context: 'document', tone: 'formal' },
  'twitter': { context: 'chat', tone: 'casual' },
  'x.com': { context: 'chat', tone: 'casual' },
}

/**
 * Get the currently active window information on Windows
 */
export async function getActiveWindow(): Promise<ActiveWindowInfo> {
  try {
    // PowerShell script to get active window info
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();

          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

          [DllImport("user32.dll")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }
"@
      $hwnd = [Win32]::GetForegroundWindow()
      $title = New-Object System.Text.StringBuilder 256
      [Win32]::GetWindowText($hwnd, $title, 256) | Out-Null
      $processId = 0
      [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

      @{
        ProcessName = if ($process) { $process.ProcessName } else { "unknown" }
        WindowTitle = $title.ToString()
      } | ConvertTo-Json
    `

    const { stdout } = await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { timeout: 2000 }
    )

    const result = JSON.parse(stdout.trim())
    const processName = (result.ProcessName || 'unknown').toLowerCase()
    const windowTitle = result.WindowTitle || ''

    // Determine context and tone
    const classification = classifyApp(processName, windowTitle)

    return {
      processName,
      windowTitle,
      appContext: classification.context,
      suggestedTone: classification.tone
    }

  } catch (error) {
    console.error('[AppContext] Failed to get active window:', error)
    return {
      processName: 'unknown',
      windowTitle: '',
      appContext: 'general',
      suggestedTone: 'formal'
    }
  }
}

/**
 * Classify an app based on process name and window title
 */
function classifyApp(
  processName: string,
  windowTitle: string
): { context: AppContextType; tone: 'formal' | 'casual' | 'technical' } {
  // Check direct app classification
  for (const [appKey, classification] of Object.entries(APP_CLASSIFICATIONS)) {
    if (processName.includes(appKey)) {
      // If it's a browser, check the URL in the title
      if (classification.context === 'browser') {
        const browserContext = classifyBrowserContent(windowTitle)
        if (browserContext) {
          return browserContext
        }
      }
      return classification
    }
  }

  // Check window title for browser content patterns
  const browserContext = classifyBrowserContent(windowTitle)
  if (browserContext) {
    return browserContext
  }

  // Default
  return { context: 'general', tone: 'formal' }
}

/**
 * Classify browser content based on window title
 */
function classifyBrowserContent(
  windowTitle: string
): { context: AppContextType; tone: 'formal' | 'casual' | 'technical' } | null {
  const titleLower = windowTitle.toLowerCase()

  for (const [pattern, classification] of Object.entries(BROWSER_URL_PATTERNS)) {
    if (titleLower.includes(pattern)) {
      return classification
    }
  }

  return null
}

// Cache for performance
let cachedContext: ActiveWindowInfo | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 500 // 500ms cache

export async function getActiveWindowCached(): Promise<ActiveWindowInfo> {
  const now = Date.now()
  if (cachedContext && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedContext
  }

  cachedContext = await getActiveWindow()
  cacheTimestamp = now
  return cachedContext
}
