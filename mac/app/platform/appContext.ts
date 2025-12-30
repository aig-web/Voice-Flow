/**
 * App Context Detection for macOS
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

// App classification rules (macOS app names)
const APP_CLASSIFICATIONS: Record<string, { context: AppContextType; tone: 'formal' | 'casual' | 'technical' }> = {
  // Email clients
  'mail': { context: 'email', tone: 'formal' },
  'outlook': { context: 'email', tone: 'formal' },
  'thunderbird': { context: 'email', tone: 'formal' },
  'spark': { context: 'email', tone: 'formal' },
  'airmail': { context: 'email', tone: 'formal' },

  // Chat apps
  'slack': { context: 'chat', tone: 'casual' },
  'discord': { context: 'chat', tone: 'casual' },
  'teams': { context: 'chat', tone: 'formal' },
  'telegram': { context: 'chat', tone: 'casual' },
  'whatsapp': { context: 'chat', tone: 'casual' },
  'messages': { context: 'chat', tone: 'casual' },

  // Code editors/IDEs
  'code': { context: 'code', tone: 'technical' },  // VS Code
  'visual studio code': { context: 'code', tone: 'technical' },
  'cursor': { context: 'code', tone: 'technical' },
  'windsurf': { context: 'code', tone: 'technical' },
  'intellij': { context: 'code', tone: 'technical' },
  'pycharm': { context: 'code', tone: 'technical' },
  'webstorm': { context: 'code', tone: 'technical' },
  'sublime text': { context: 'code', tone: 'technical' },
  'textmate': { context: 'code', tone: 'technical' },
  'bbedit': { context: 'code', tone: 'technical' },
  'xcode': { context: 'code', tone: 'technical' },
  'terminal': { context: 'code', tone: 'technical' },
  'iterm': { context: 'code', tone: 'technical' },
  'iterm2': { context: 'code', tone: 'technical' },
  'warp': { context: 'code', tone: 'technical' },
  'alacritty': { context: 'code', tone: 'technical' },
  'kitty': { context: 'code', tone: 'technical' },

  // Document editors
  'word': { context: 'document', tone: 'formal' },
  'microsoft word': { context: 'document', tone: 'formal' },
  'pages': { context: 'document', tone: 'formal' },
  'notion': { context: 'document', tone: 'formal' },
  'obsidian': { context: 'document', tone: 'formal' },
  'notes': { context: 'document', tone: 'formal' },
  'bear': { context: 'document', tone: 'formal' },
  'ulysses': { context: 'document', tone: 'formal' },
  'scrivener': { context: 'document', tone: 'formal' },
  'textedit': { context: 'document', tone: 'formal' },

  // Browsers
  'safari': { context: 'browser', tone: 'formal' },
  'google chrome': { context: 'browser', tone: 'formal' },
  'chrome': { context: 'browser', tone: 'formal' },
  'firefox': { context: 'browser', tone: 'formal' },
  'microsoft edge': { context: 'browser', tone: 'formal' },
  'brave browser': { context: 'browser', tone: 'formal' },
  'arc': { context: 'browser', tone: 'formal' },
  'orion': { context: 'browser', tone: 'formal' },
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
 * Get the currently active window information on macOS
 * Uses AppleScript to get frontmost application info
 */
export async function getActiveWindow(): Promise<ActiveWindowInfo> {
  try {
    // AppleScript to get active app and window title
    const appleScript = `
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  set frontWindow to ""
  try
    tell process frontApp
      set frontWindow to name of front window
    end tell
  on error
    set frontWindow to ""
  end try
end tell
return frontApp & "|||" & frontWindow
`

    const { stdout } = await execAsync(
      `osascript -e '${appleScript.replace(/'/g, "'\\''")}'`,
      { timeout: 3000 }
    )

    const parts = stdout.trim().split('|||')
    const processName = (parts[0] || 'unknown').toLowerCase()
    const windowTitle = parts[1] || ''

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
