/**
 * Voice-Flow Main Process
 *
 * Architecture:
 * - Main process handles: hotkeys, audio recording (FFmpeg), WebSocket, transcription
 * - Renderer handles: UI display (toast, settings, dashboard)
 * - Audio captured via FFmpeg subprocess for reliability
 *
 * Flow:
 * 1. Hotkey DOWN → Start FFmpeg audio capture + WebSocket connection
 * 2. Audio streams from FFmpeg → WebSocket (in main process)
 * 3. Hotkey UP → Stop FFmpeg, send 'stop' to WebSocket, wait for final
 * 4. Receive final transcription → Inject text → Refresh dashboard
 */

import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  net,
  screen,
} from 'electron'
import path from 'path'
import { existsSync } from 'fs'
import { spawn, ChildProcess, execSync } from 'child_process'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { injectText } from './platform/injectText'
import { captureFullContext, CapturedContext } from './platform/contextCapture'
import WebSocket from 'ws'
// import Database from 'better-sqlite3'  // Temporarily disabled for dev - works in production .exe build

// ============== CONFIG ==============
const DEV_URL = 'http://localhost:5173'
const API_BASE_URL = process.env.VITE_API_URL || 'https://ilona-decipherable-stupidly.ngrok-free.dev'
const WS_URL = API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')
const SAMPLE_RATE = 16000

console.log(`[Voice-Flow] Connecting to backend: ${API_BASE_URL}`)
console.log(`[Voice-Flow] WebSocket URL: ${WS_URL}`)

// Default hotkey
let currentHotkey = 'CommandOrControl+Shift+S'

// ============== STATE MACHINE ==============
type RecordingState = 'idle' | 'recording' | 'processing'
let recordingState: RecordingState = 'idle'
let isHotkeyPressed = false
let currentSessionId: string | null = null

// ============== GLOBALS ==============
let mainWindow: BrowserWindow | null = null
let toastWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let backendProcess: ChildProcess | null = null
const isDev = process.env.NODE_ENV === 'development'

// Audio recording globals (main process handles this now!)
let ffmpegProcess: ChildProcess | null = null
let wsConnection: WebSocket | null = null
let wsToken: string | null = null
let audioBuffer: Buffer[] = []  // Buffer audio before WebSocket is ready
let wsReady = false  // Flag to track when WebSocket auth is complete
let finalReceived = false  // Flag to track if we've received final transcription

// FFmpeg pre-warming: Keep FFmpeg running to eliminate startup delay
let ffmpegPrewarmed = false  // Is FFmpeg already running in standby?
let isCapturing = false  // Are we actively capturing audio (vs standby)?
let preWarmBuffer: Buffer[] = []  // Rolling buffer of recent audio for instant start
const PRE_WARM_BUFFER_MS = 1500  // Keep 1.5 seconds of audio in pre-warm buffer
const PRE_WARM_BUFFER_SIZE = Math.floor((16000 * 2 * PRE_WARM_BUFFER_MS) / 1000)  // bytes at 16kHz 16-bit mono

// Context capture globals
let capturedContext: CapturedContext | null = null
let currentModeId: number | null = null  // Active mode ID

// Cached audio device (detected at startup for instant recording)
let cachedAudioDevice: string | null = null

// ============== LOGGING ==============
function log(message: string, ...args: unknown[]) {
  console.log(`[Voice-Flow] ${message}`, ...args)
}

function logError(message: string, ...args: unknown[]) {
  console.error(`[Voice-Flow ERROR] ${message}`, ...args)
}

// ============== CLIENT DATABASE INITIALIZATION ==============

/**
 * Initialize the local client database with required tables
 * This runs on app startup to ensure schema exists
 */
// Temporarily disabled for dev - works in production .exe build
function initClientDatabase() {
  log('Database initialization skipped in dev mode')
  return
  /*
  try {
    const dbPath = path.join(app.getPath('userData'), 'voiceflow.db')
    log(`Initializing client database at: ${dbPath}`)

    const db = new Database(dbPath)

    // Create transcriptions table (with session_id for tracking)
    db.exec(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        raw_text TEXT NOT NULL,
        polished_text TEXT,
        duration REAL,
        mode_id INTEGER,
        app_name TEXT,
        window_title TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Create user_settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        tone TEXT DEFAULT 'balanced',
        personal_dictionary TEXT DEFAULT '{}',
        hotkey TEXT DEFAULT 'CommandOrControl+Alt',
        language TEXT DEFAULT 'en',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (id = 1)
      )
    `)

    // Create modes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS modes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        system_prompt TEXT,
        is_active INTEGER DEFAULT 0,
        app_context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Create snippets table
    db.exec(`
      CREATE TABLE IF NOT EXISTS snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shortcut TEXT NOT NULL UNIQUE,
        expansion TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Create indexes for performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at
      ON transcriptions(created_at DESC)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transcriptions_session_id
      ON transcriptions(session_id)
    `)

    db.close()
    log('Client database initialized successfully')
  } catch (error) {
    logError('Failed to initialize client database:', error)
    throw error
  }
  */
}

// ============== FFmpeg Path Detection ==============
function getFFmpegPath(): string {
  // Check multiple locations
  const possiblePaths = [
    // Project local FFmpeg
    path.join(__dirname, '..', '..', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
    path.join(process.cwd(), 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
    // Resources path (packaged)
    app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe') : '',
    // System PATH
    'ffmpeg',
  ].filter(p => p)

  for (const ffmpegPath of possiblePaths) {
    if (ffmpegPath === 'ffmpeg') {
      // Check if ffmpeg is in PATH
      try {
        execSync('where ffmpeg', { stdio: 'ignore' })
        return 'ffmpeg'
      } catch {
        continue
      }
    }
    if (existsSync(ffmpegPath)) {
      log(`Found FFmpeg at: ${ffmpegPath}`)
      return ffmpegPath
    }
  }

  logError('FFmpeg not found!')
  return 'ffmpeg' // Fallback, will fail if not in PATH
}

// ============== Audio Device Detection (cached at startup) ==============
function detectAudioDevice(): string | null {
  const ffmpegPath = getFFmpegPath()
  try {
    // FFmpeg outputs device list to stderr, so we redirect 2>&1 and capture stdout
    const output = execSync(`"${ffmpegPath}" -list_devices true -f dshow -i dummy 2>&1`, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    })
    // This won't be reached - ffmpeg always exits with error for -i dummy
    const audioMatch = output.match(/"([^"]+)" \(audio\)/i)
    if (audioMatch) {
      return audioMatch[1]
    }
  } catch (err) {
    // execSync throws because ffmpeg exits with error (expected)
    // The actual device list is in the error message or stdout
    const error = err as { message?: string; stdout?: string; stderr?: string }
    const output = error.message || error.stdout || error.stderr || ''
    log(`FFmpeg device list output: ${output.substring(0, 500)}`)
    const audioMatch = output.match(/"([^"]+)" \(audio\)/i)
    if (audioMatch) {
      return audioMatch[1]
    }
  }
  return null
}

function initAudioDevice(): void {
  log('Detecting audio device at startup...')
  cachedAudioDevice = detectAudioDevice()
  if (cachedAudioDevice) {
    log(`Audio device cached: ${cachedAudioDevice}`)
    // Pre-warm FFmpeg so recording starts instantly
    setTimeout(() => {
      preWarmFFmpeg()
    }, 500)  // Small delay to let app finish initializing
  } else {
    logError('No audio device detected at startup!')
  }
}

// ============== WebSocket Token ==============
async function getWsToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request(`${API_BASE_URL}/api/ws-token`)
    let data = ''

    request.on('response', (response) => {
      response.on('data', (chunk) => { data += chunk.toString() })
      response.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.token)
        } catch (e) {
          reject(new Error('Invalid token response'))
        }
      })
    })

    request.on('error', reject)
    request.end()
  })
}

// ============== AUDIO RECORDING (Main Process) ==============

/**
 * Send audio chunk - either buffer it or send directly based on WebSocket state
 */
function sendAudioChunk(chunk: Buffer) {
  if (isCapturing) {
    // Actively recording - send to WebSocket or buffer
    if (wsReady && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(chunk)
    } else {
      audioBuffer.push(chunk)
    }
  } else if (ffmpegPrewarmed) {
    // Pre-warm mode - maintain rolling buffer of recent audio
    preWarmBuffer.push(chunk)
    // Keep buffer size under limit (rolling window)
    let totalSize = preWarmBuffer.reduce((sum, b) => sum + b.length, 0)
    while (totalSize > PRE_WARM_BUFFER_SIZE && preWarmBuffer.length > 0) {
      const removed = preWarmBuffer.shift()
      if (removed) totalSize -= removed.length
    }
  }
}

/**
 * Flush buffered audio to WebSocket once it's ready
 */
function flushAudioBuffer() {
  if (audioBuffer.length > 0 && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    log(`Flushing ${audioBuffer.length} buffered audio chunks`)
    for (const chunk of audioBuffer) {
      wsConnection.send(chunk)
    }
    audioBuffer = []
  }
}

/**
 * Start audio recording using FFmpeg
 * FFmpeg captures from default audio input, outputs raw PCM s16le
 */
async function startAudioCapture(): Promise<boolean> {
  const ffmpegPath = getFFmpegPath()

  log('Starting FFmpeg audio capture...')

  // FFmpeg command to capture from default audio input
  // Output: raw 16-bit signed little-endian PCM at 16kHz mono
  const ffmpegArgs = [
    '-f', 'dshow',                    // DirectShow (Windows)
    '-i', 'audio=@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{00000000-0000-0000-0000-000000000000}', // Default audio device
    '-ar', String(SAMPLE_RATE),       // Sample rate
    '-ac', '1',                        // Mono
    '-f', 's16le',                     // Raw PCM format
    '-acodec', 'pcm_s16le',           // PCM codec
    'pipe:1'                           // Output to stdout
  ]

  // Try alternative device name if default doesn't work
  const altArgs = [
    '-f', 'dshow',
    '-list_devices', 'true',
    '-i', 'dummy'
  ]

  try {
    // First, let's try to find the default microphone
    ffmpegProcess = spawn(ffmpegPath, [
      '-f', 'dshow',
      '-ar', String(SAMPLE_RATE),
      '-ac', '1',
      '-i', 'audio=Microphone (Realtek(R) Audio)',  // Common name
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      'pipe:1'
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // Handle FFmpeg output - send to WebSocket
    ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(chunk)
      }
    })

    ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      // Only log errors, not progress
      if (msg.includes('Error') || msg.includes('error')) {
        logError(`FFmpeg: ${msg}`)
      }
    })

    ffmpegProcess.on('error', (err) => {
      logError('FFmpeg process error:', err)
      ffmpegProcess = null
    })

    ffmpegProcess.on('exit', (code) => {
      log(`FFmpeg exited with code ${code}`)
      ffmpegProcess = null
    })

    return true
  } catch (err) {
    logError('Failed to start FFmpeg:', err)
    return false
  }
}

/**
 * Alternative: Use PowerShell to capture audio (more reliable device detection)
 */
async function startAudioCapturePowerShell(): Promise<boolean> {
  log('Starting audio capture via PowerShell NAudio...')

  // We'll use a simpler approach: spawn a Node child process that uses
  // node-record-lpcm16 or similar
  // For now, let's try FFmpeg with auto-detect

  const ffmpegPath = getFFmpegPath()

  try {
    // Use "default" virtual device or list and pick first
    ffmpegProcess = spawn(ffmpegPath, [
      '-f', 'dshow',
      '-i', 'audio=virtual-audio-capturer', // Try virtual capturer
      '-ar', String(SAMPLE_RATE),
      '-ac', '1',
      '-f', 's16le',
      'pipe:1'
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let hasError = false

    ffmpegProcess.stderr?.once('data', (data: Buffer) => {
      const msg = data.toString()
      if (msg.includes('Could not') || msg.includes('Error')) {
        hasError = true
        logError('FFmpeg device error, trying fallback...')
        ffmpegProcess?.kill()
      }
    })

    // Wait a moment to see if it errors out
    await new Promise(resolve => setTimeout(resolve, 500))

    if (hasError || !ffmpegProcess) {
      // Fallback: try system default
      return await startAudioCaptureDefault()
    }

    // Pipe audio to WebSocket
    ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(chunk)
      }
    })

    return true
  } catch (err) {
    logError('Audio capture failed:', err)
    return false
  }
}

/**
 * Pre-warm FFmpeg - start it in standby mode so recording starts instantly
 * Call this at app startup after detecting audio device
 */
function preWarmFFmpeg(): boolean {
  if (ffmpegPrewarmed && ffmpegProcess) {
    log('FFmpeg already pre-warmed')
    return true
  }

  const ffmpegPath = getFFmpegPath()

  if (!cachedAudioDevice) {
    logError('Cannot pre-warm FFmpeg - no cached audio device')
    return false
  }

  log(`Pre-warming FFmpeg with device: ${cachedAudioDevice}`)

  ffmpegProcess = spawn(ffmpegPath, [
    '-f', 'dshow',
    '-i', `audio=${cachedAudioDevice}`,
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    'pipe:1'
  ], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
    sendAudioChunk(chunk)
  })

  ffmpegProcess.stderr?.on('data', () => {
    // Suppress non-error output
  })

  ffmpegProcess.on('close', () => {
    log('FFmpeg pre-warm process closed')
    ffmpegPrewarmed = false
    ffmpegProcess = null
  })

  ffmpegPrewarmed = true
  preWarmBuffer = []
  log('FFmpeg pre-warmed and ready')
  return true
}

/**
 * Start audio capture using CACHED device (instant start, no device detection delay)
 * If FFmpeg is pre-warmed, just switch to capture mode and use buffered audio
 */
async function startAudioCaptureDefault(): Promise<boolean> {
  // Reset audio buffer for new recording
  audioBuffer = []
  wsReady = false

  // Use cached device for instant start (no execSync delay!)
  if (!cachedAudioDevice) {
    logError('No cached audio device - detecting now...')
    cachedAudioDevice = detectAudioDevice()
    if (!cachedAudioDevice) {
      logError('No audio device found')
      return false
    }
  }

  // If FFmpeg is already pre-warmed, just switch to capture mode
  if (ffmpegPrewarmed && ffmpegProcess) {
    log('Using pre-warmed FFmpeg - instant start!')
    // Copy pre-warm buffer to audio buffer (captures speech from before hotkey press)
    audioBuffer = [...preWarmBuffer]
    preWarmBuffer = []
    isCapturing = true
    log(`Captured ${audioBuffer.length} pre-buffered chunks (${audioBuffer.reduce((s, b) => s + b.length, 0)} bytes)`)
    return true
  }

  // Fallback: start FFmpeg fresh (has ~0.5-1s delay)
  log(`Starting FFmpeg fresh with device: ${cachedAudioDevice}`)
  const ffmpegPath = getFFmpegPath()

  ffmpegProcess = spawn(ffmpegPath, [
    '-f', 'dshow',
    '-i', `audio=${cachedAudioDevice}`,
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    'pipe:1'
  ], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
    sendAudioChunk(chunk)
  })

  ffmpegProcess.stderr?.on('data', () => {
    // Suppress non-error output
  })

  isCapturing = true
  return true
}

function stopAudioCapture() {
  log('Stopping audio capture (keeping FFmpeg pre-warmed)...')
  // Don't kill FFmpeg - switch back to pre-warm mode for instant next recording
  isCapturing = false
  audioBuffer = []
  wsReady = false
  preWarmBuffer = []  // Clear pre-warm buffer, will refill automatically

  // If FFmpeg died for some reason, restart it
  if (!ffmpegProcess) {
    log('FFmpeg not running, restarting pre-warm...')
    preWarmFFmpeg()
  }
}

function killFFmpeg() {
  log('Killing FFmpeg process...')
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM')
    ffmpegProcess = null
  }
  ffmpegPrewarmed = false
  isCapturing = false
  audioBuffer = []
  preWarmBuffer = []
}

// ============== WEBSOCKET CONNECTION (Main Process) ==============

async function connectWebSocket(): Promise<boolean> {
  log('Connecting WebSocket...')

  try {
    // Get auth token
    wsToken = await getWsToken()

    return new Promise((resolve, reject) => {
      wsConnection = new WebSocket(`${WS_URL}/ws/transcribe`)

      wsConnection.on('open', () => {
        log('WebSocket connected, sending auth...')
        wsConnection!.send(JSON.stringify({
          type: 'auth',
          token: wsToken,
          app_context: capturedContext?.appContext || 'general',
          app_name: capturedContext?.appName || null,
          window_title: capturedContext?.windowTitle || null,
          selected_text: capturedContext?.selectedText || null,
          clipboard_text: capturedContext?.clipboardText || null,
          mode_id: currentModeId
        }))
        // Mark WebSocket as ready and flush any buffered audio
        // Wait 150ms on first connection to ensure backend is ready
        setTimeout(() => {
          wsReady = true
          log('WebSocket ready, flushing audio buffer...')
          flushAudioBuffer()
        }, 150)
        resolve(true)
      })

      wsConnection.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())

          if (msg.error) {
            logError('WebSocket error:', msg.error)
            updateToast('error', msg.error)
            return
          }

          // Handle session_start message
          if (msg.type === 'session_start' && msg.session_id) {
            currentSessionId = msg.session_id
            log(`Recording session started: ${currentSessionId}`)
          }

          if (msg.type === 'partial') {
            // Update toast with live transcription
            updateToastLive(msg.partial || '', msg.confirmed || '')
          }

          if (msg.type === 'final') {
            log('Received final transcription:', msg.text?.substring(0, 50))
            finalReceived = true  // Mark that we got the final, so close handler doesn't show error

            // Validate session_id
            if (msg.session_id && msg.session_id !== currentSessionId) {
              logError(`Session ID mismatch! Expected ${currentSessionId}, got ${msg.session_id}`)
            }

            // Handle async but catch errors to ensure state is cleaned up
            handleFinalTranscription(
              msg.text || msg.raw || '',
              msg.session_id,
              msg.duration,
              msg.polished_text
            ).catch(err => {
              logError('handleFinalTranscription error:', err)
              updateToast('error', 'Processing failed')
              recordingState = 'idle'
            })
          }
        } catch (e) {
          logError('WebSocket parse error:', e)
        }
      })

      wsConnection.on('error', (err) => {
        logError('WebSocket error:', err)
        reject(err)
      })

      wsConnection.on('close', () => {
        log('WebSocket closed')
        wsConnection = null
        wsReady = false

        // If we're still processing when WS closes unexpectedly without final message
        // give it a moment for any pending final message handler to complete
        // But only show error if we didn't receive the final transcription
        setTimeout(() => {
          if (recordingState === 'processing' && !finalReceived) {
            log('WebSocket closed while still processing without final - resetting state')
            updateToast('error', 'Connection closed unexpectedly')
            recordingState = 'idle'
          }
        }, 500)
      })

      // Timeout for connection
      setTimeout(() => {
        if (wsConnection?.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'))
        }
      }, 5000)
    })
  } catch (err) {
    logError('WebSocket connection failed:', err)
    return false
  }
}

function disconnectWebSocket() {
  if (wsConnection) {
    if (wsConnection.readyState === WebSocket.OPEN) {
      log('Sending stop command to WebSocket...')
      wsConnection.send('stop')
      // Don't close immediately - wait for final message
    }
  }
}

async function handleFinalTranscription(
  text: string,
  sessionId?: string,
  duration?: number,
  polishedText?: string
) {
  log('Final transcription received:', text?.substring(0, 50))

  // Close WebSocket now
  if (wsConnection) {
    wsConnection.close()
    wsConnection = null
  }

  try {
    if (text && text.trim().length > 0) {
      updateToast('processing', 'Injecting...')

      // Save to local database (temporarily disabled for dev)
      // Database will work in production .exe build
      log('Transcription ready (DB save disabled in dev mode)')

      const result = await injectText(text)

      if (result.ok) {
        log('Text injected successfully')
        updateToast('done', 'Done!')
        // Refresh dashboard after successful transcription
        refreshDashboard()
      } else {
        logError('Injection failed:', result.error)
        updateToast('error', result.error || 'Injection failed')
      }
    } else {
      log('No text to inject')
      updateToast('done', 'No speech detected')
    }
  } catch (err) {
    logError('Error in handleFinalTranscription:', err)
    updateToast('error', 'Processing failed')
  } finally {
    // Reset session tracking
    currentSessionId = null
    // Always reset state to idle when done
    recordingState = 'idle'
    log('Recording state reset to idle')
  }
}

/**
 * Refresh the dashboard/main window to show updated history
 */
function refreshDashboard() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  try {
    // Send refresh event to renderer
    mainWindow.webContents.send('vf:refresh-dashboard')
    log('Dashboard refresh triggered')
  } catch (err) {
    // Ignore errors - dashboard refresh is not critical
    log('Dashboard refresh skipped (window not ready)')
  }
}

// ============== RECORDING STATE MACHINE ==============

async function startRecording() {
  if (recordingState !== 'idle') {
    log(`Cannot start recording: state is ${recordingState}`)
    return
  }

  log('Starting recording...')
  recordingState = 'recording'
  finalReceived = false  // Reset for new recording
  updateToast('recording', 'Listening...')

  try {
    // Start audio capture IMMEDIATELY - don't wait for anything else
    // This ensures we capture speech from the very start
    const audioOk = await startAudioCaptureDefault()
    if (!audioOk) {
      throw new Error('Audio capture failed')
    }

    // Connect WebSocket next (audio is buffering)
    const wsOk = await connectWebSocket()
    if (!wsOk) {
      throw new Error('WebSocket connection failed')
    }

    // Capture context in background - don't block recording
    // Skip selection capture (Ctrl+C is slow and interferes)
    captureFullContext(false, false).then(ctx => {
      capturedContext = ctx
      log('Captured context:', {
        hasSelection: !!ctx.selectedText,
        app: ctx.appName,
        context: ctx.appContext
      })
    }).catch(err => {
      log('Context capture failed (non-blocking):', err)
      capturedContext = {
        selectedText: null,
        clipboardText: null,
        appName: 'unknown',
        windowTitle: '',
        appContext: 'general',
        suggestedTone: 'formal'
      }
    })

    log('Recording started successfully')
  } catch (err) {
    logError('Failed to start recording:', err)
    updateToast('error', String(err))
    recordingState = 'idle'
    capturedContext = null
    stopAudioCapture()
    if (wsConnection) {
      wsConnection.close()
      wsConnection = null
    }
  }
}

function stopRecording() {
  if (recordingState !== 'recording') {
    log(`Cannot stop recording: state is ${recordingState}`)
    return
  }

  log('Stopping recording...')
  recordingState = 'processing'
  updateToast('processing', 'Processing...')

  // Stop audio capture
  stopAudioCapture()

  // Send stop to WebSocket (will trigger final transcription)
  disconnectWebSocket()

  // Safety timeout
  setTimeout(() => {
    if (recordingState === 'processing') {
      log('Processing timeout - resetting')
      updateToast('error', 'Processing timed out')
      recordingState = 'idle'
      if (wsConnection) {
        wsConnection.close()
        wsConnection = null
      }
    }
  }, 30000)
}

function cancelRecording() {
  if (recordingState === 'idle') return

  log('Canceling recording...')
  recordingState = 'idle'

  stopAudioCapture()

  if (wsConnection) {
    wsConnection.close()
    wsConnection = null
  }

  hideToast()
}

// ============== TOAST WINDOW ==============

function createToastWindow() {
  if (toastWindow) return

  toastWindow = new BrowserWindow({
    width: 550,
    height: 170,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev || !app.isPackaged) {
    toastWindow.loadURL(`${DEV_URL}/#/toast`)
  } else {
    const indexPath = path.join(process.resourcesPath, 'app', 'index.html')
    toastWindow.loadFile(indexPath, { hash: '/toast' })
  }

  toastWindow.on('closed', () => {
    toastWindow = null
  })
}

function positionToast() {
  if (!toastWindow) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width } = primaryDisplay.workAreaSize

  toastWindow.setBounds({
    x: Math.round((width - 550) / 2),
    y: 40,
    width: 550,
    height: 170,
  })
}

function updateToast(type: 'recording' | 'processing' | 'done' | 'error', message?: string) {
  if (!toastWindow) {
    createToastWindow()
  }

  positionToast()

  // Send to toast (simple one-way IPC - doesn't matter if it fails)
  try {
    // When starting recording, first clear any previous live text
    if (type === 'recording') {
      toastWindow?.webContents.send('vf:live-transcription', { partial: '', confirmed: '' })
    }
    toastWindow?.webContents.send('vf:show-toast', { type, message, mode: 'hold' })
    toastWindow?.show()
    log('[TOAST] Shown, visible: ' + toastWindow?.isVisible())
  } catch (e) {
    logError('[TOAST] Error: ' + e)
  }

  // Auto-hide on done/error
  if (type === 'done' || type === 'error') {
    setTimeout(() => {
      if (recordingState === 'idle') {
        toastWindow?.hide()
      }
    }, 1500)
  }
}

function updateToastLive(partial: string, confirmed: string) {
  try {
    toastWindow?.webContents.send('vf:live-transcription', { partial, confirmed })
  } catch (e) {
    // Ignore
  }
}

function hideToast() {
  toastWindow?.hide()
}

// ============== MAIN WINDOW ==============

function createWindow(showImmediately = false) {
  log('Creating main window...')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 500,
    center: true,
    backgroundColor: '#0f172a',
    show: false,
    skipTaskbar: !showImmediately,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev || !app.isPackaged) {
    log(`Loading dev URL: ${DEV_URL}`)
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(process.resourcesPath, 'app', 'index.html')
    mainWindow.loadFile(indexPath)
  }

  mainWindow.once('ready-to-show', () => {
    log('Window ready')
    if (showImmediately) {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      mainWindow?.setSkipTaskbar(true)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showWindow() {
  if (!mainWindow) {
    createWindow(true)
    return
  }
  mainWindow.setSkipTaskbar(false)
  mainWindow.show()
  mainWindow.focus()
}

function hideWindow() {
  if (mainWindow) {
    mainWindow.hide()
    mainWindow.setSkipTaskbar(true)
  }
}

// ============== HOTKEY REGISTRATION ==============

// Key codes
const KEY_CODES: Record<string, number> = {
  'Alt': UiohookKey.Alt,
  'Ctrl': UiohookKey.Ctrl,
  'Control': UiohookKey.Ctrl,
  'Shift': UiohookKey.Shift,
  'Space': UiohookKey.Space,
  'S': 31, 'A': 30, 'B': 48, 'C': 46, 'D': 32, 'E': 18, 'F': 33, 'G': 34,
  'H': 35, 'I': 23, 'J': 36, 'K': 37, 'L': 38, 'M': 50, 'N': 49, 'O': 24,
  'P': 25, 'Q': 16, 'R': 19, 'T': 20, 'U': 22, 'V': 47, 'W': 17, 'X': 45,
  'Y': 21, 'Z': 44
}

interface ParsedHotkey {
  ctrl: boolean
  alt: boolean
  shift: boolean
  extraKey: string | null
}

let parsedHotkey: ParsedHotkey = { ctrl: true, alt: false, shift: true, extraKey: 'S' }
let pressedModifiers = { ctrl: false, alt: false, shift: false, extraKey: false }

function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey.split('+').map(p => p.trim().toLowerCase())

  const result: ParsedHotkey = {
    ctrl: parts.includes('ctrl') || parts.includes('control') || parts.includes('commandorcontrol'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    extraKey: null
  }

  const modifiers = ['ctrl', 'control', 'commandorcontrol', 'alt', 'shift']
  const extraKey = parts.find(p => !modifiers.includes(p))
  if (extraKey) {
    result.extraKey = extraKey.toUpperCase()
  }

  return result
}

function checkHotkeyPressed(): boolean {
  if (parsedHotkey.ctrl && !pressedModifiers.ctrl) return false
  if (parsedHotkey.alt && !pressedModifiers.alt) return false
  if (parsedHotkey.shift && !pressedModifiers.shift) return false
  if (parsedHotkey.extraKey && !pressedModifiers.extraKey) return false
  if (!parsedHotkey.ctrl && !parsedHotkey.alt && !parsedHotkey.shift) return false
  return true
}

function getExtraKeycode(key: string): number | null {
  return KEY_CODES[key.toUpperCase()] || null
}

function registerHotkeys() {
  log('Registering hotkeys...')

  parsedHotkey = parseHotkey(currentHotkey)
  log(`Hotkey: ${currentHotkey}`)
  log(`Parsed: ctrl=${parsedHotkey.ctrl}, alt=${parsedHotkey.alt}, shift=${parsedHotkey.shift}, extra=${parsedHotkey.extraKey}`)

  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Ctrl || e.keycode === 29) pressedModifiers.ctrl = true
    if (e.keycode === UiohookKey.Alt || e.keycode === 56) pressedModifiers.alt = true
    if (e.keycode === UiohookKey.Shift || e.keycode === 42 || e.keycode === 54) pressedModifiers.shift = true

    if (parsedHotkey.extraKey) {
      const expectedKeycode = getExtraKeycode(parsedHotkey.extraKey)
      if (expectedKeycode && e.keycode === expectedKeycode) {
        pressedModifiers.extraKey = true
      }
    }

    if (checkHotkeyPressed() && !isHotkeyPressed) {
      isHotkeyPressed = true
      log(`Hotkey DOWN - state: ${recordingState}`)

      if (recordingState === 'idle') {
        startRecording()
      }
    }
  })

  uIOhook.on('keyup', (e) => {
    const wasHotkeyPressed = isHotkeyPressed

    if (e.keycode === UiohookKey.Ctrl || e.keycode === 29) pressedModifiers.ctrl = false
    if (e.keycode === UiohookKey.Alt || e.keycode === 56) pressedModifiers.alt = false
    if (e.keycode === UiohookKey.Shift || e.keycode === 42 || e.keycode === 54) pressedModifiers.shift = false

    if (parsedHotkey.extraKey) {
      const expectedKeycode = getExtraKeycode(parsedHotkey.extraKey)
      if (expectedKeycode && e.keycode === expectedKeycode) {
        pressedModifiers.extraKey = false
      }
    }

    if (wasHotkeyPressed && !checkHotkeyPressed()) {
      isHotkeyPressed = false
      log(`Hotkey UP - state: ${recordingState}`)

      if (recordingState === 'recording') {
        stopRecording()
      }
    }
  })

  uIOhook.start()
  log(`uiohook started - Hold ${currentHotkey} to record`)

  globalShortcut.register('Escape', () => {
    if (recordingState !== 'idle') {
      log('ESC - canceling')
      isHotkeyPressed = false
      pressedModifiers = { ctrl: false, alt: false, shift: false, extraKey: false }
      cancelRecording()
    }
  })
}

// ============== TRAY ==============

function createTray() {
  log('Creating tray...')

  const iconPath = path.join(__dirname, 'icon.png')
  let trayIcon: Electron.NativeImage

  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty()
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip(`Voice-Flow - Hold ${currentHotkey} to record`)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => showWindow())
}

// ============== IPC HANDLERS (Minimal - for settings only) ==============

// Database functions temporarily disabled for dev - works in production .exe build
// function getClientDB() {
//   const dbPath = path.join(app.getPath('userData'), 'voiceflow.db')
//   return new Database(dbPath)
// }

function setupIpcHandlers() {
  log('Setting up IPC handlers...')

  // Get settings from local DB (temporarily disabled for dev)
  ipcMain.handle('vf:get-settings', async () => {
    // Database disabled for dev - return defaults with current hotkey
    return {
      ok: true,
      data: {
        tone: 'balanced',
        personal_dictionary: '{}',
        record_hotkey: currentHotkey,
        language: 'en'
      }
    }
  })

  // Save settings to local DB (temporarily disabled for dev)
  ipcMain.handle('vf:save-settings', async (_event, settings: any) => {
    // Database disabled for dev - update hotkey if provided
    log('Settings update requested (DB disabled in dev):', settings)

    if (settings.record_hotkey && settings.record_hotkey !== currentHotkey) {
      log(`Updating hotkey from ${currentHotkey} to ${settings.record_hotkey}`)
      currentHotkey = settings.record_hotkey
      parsedHotkey = parseHotkey(currentHotkey)
      tray?.setToolTip(`Voice-Flow - Hold ${currentHotkey} to record`)
    }

    return { ok: true }
  })

  ipcMain.handle('vf:get-history', async (_event, limit?: number) => {
    try {
      const endpoint = limit ? `/api/transcriptions?limit=${limit}` : '/api/transcriptions'
      const data = await fetchFromBackend(endpoint)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('vf:update-hotkey', async (_event, hotkey: string) => {
    currentHotkey = hotkey
    parsedHotkey = parseHotkey(hotkey)
    tray?.setToolTip(`Voice-Flow - Hold ${hotkey} to record`)
    return { ok: true }
  })

  // Mode management
  ipcMain.handle('vf:set-active-mode', async (_event, modeId: number | null) => {
    currentModeId = modeId
    log(`Active mode set to: ${modeId}`)
    return { ok: true }
  })

  ipcMain.handle('vf:get-modes', async () => {
    try {
      const data = await fetchFromBackend('/api/modes')
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('vf:get-active-mode', async (_event, appName?: string) => {
    try {
      const endpoint = appName ? `/api/modes/active?app_name=${encodeURIComponent(appName)}` : '/api/modes/active'
      const data = await fetchFromBackend(endpoint)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Get stats from local DB (temporarily disabled for dev)
  ipcMain.handle('vf:get-stats', async () => {
    // Database disabled for dev - return empty stats
    return { total_transcriptions: 0, total_duration: 0, avg_duration: 0, wordsCaptured: 0, timeSavedMinutes: 0 }
  })

  // Toast controls
  ipcMain.on('vf:cancel-recording-request', () => cancelRecording())
  ipcMain.on('vf:stop-recording-request', () => stopRecording())

  // Local database queries (temporarily disabled for dev)
  // Get transcriptions from local DB
  ipcMain.handle('vf:get-transcriptions', async (_event, limit = 50) => {
    // Database disabled for dev - return empty array
    return []
  })

  // Delete transcription from local DB
  ipcMain.handle('vf:delete-transcription', async (_event, id: number) => {
    try {
      await fetchFromBackend(`/api/transcriptions/${id}`, { method: 'DELETE' })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Dictionary operations
  ipcMain.handle('vf:add-dictionary-entry', async (_event, mishearing: string, correction: string) => {
    try {
      const data = await fetchFromBackend('/api/settings/dictionary/add', {
        method: 'POST',
        body: { mishearing, correction }
      })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('vf:remove-dictionary-entry', async (_event, mishearing: string) => {
    try {
      await fetchFromBackend(`/api/settings/dictionary/${encodeURIComponent(mishearing)}`, {
        method: 'DELETE'
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Snippets operations
  ipcMain.handle('vf:get-snippets', async () => {
    try {
      const data = await fetchFromBackend('/api/snippets')
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('vf:add-snippet', async (_event, trigger: string, content: string) => {
    try {
      const data = await fetchFromBackend('/api/snippets', {
        method: 'POST',
        body: { trigger, content }
      })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('vf:delete-snippet', async (_event, id: number) => {
    try {
      await fetchFromBackend(`/api/snippets/${id}`, { method: 'DELETE' })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  // Export operations
  ipcMain.handle('vf:export-transcriptions', async (_event, format: string, transcriptionIds: number[]) => {
    try {
      const data = await fetchFromBackend('/api/transcriptions/export', {
        method: 'POST',
        body: { format, transcription_ids: transcriptionIds }
      })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  log('IPC handlers registered')
}

// ============== API HELPER ==============

async function fetchFromBackend(endpoint: string, options?: { method?: string; body?: unknown }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE_URL}${endpoint}`
    const method = options?.method || 'GET'

    const request = net.request({ method, url })

    if (options?.body) {
      request.setHeader('Content-Type', 'application/json')
    }

    let responseData = ''

    request.on('response', (response) => {
      response.on('data', (chunk) => { responseData += chunk.toString() })
      response.on('end', () => {
        try {
          resolve(JSON.parse(responseData))
        } catch {
          resolve(responseData)
        }
      })
    })

    request.on('error', reject)

    if (options?.body) {
      request.write(JSON.stringify(options.body))
    }

    request.end()
  })
}

// ============== LOAD SETTINGS ==============

async function loadSavedHotkey(): Promise<void> {
  try {
    const settings = await fetchFromBackend('/api/settings') as { record_hotkey?: string }
    if (settings?.record_hotkey) {
      currentHotkey = settings.record_hotkey
      log(`Loaded hotkey: ${currentHotkey}`)
    }
  } catch {
    log(`Using default hotkey: ${currentHotkey}`)
  }
}

// ============== APP LIFECYCLE ==============

app.whenReady().then(async () => {
  log('App ready')
  log(`Platform: ${process.platform}`)
  log(`Dev mode: ${isDev}`)
  log('Voice-Flow starting...')

  // Initialize client database FIRST
  // initClientDatabase()  // Temporarily disabled for dev - works in production .exe build

  // Cache audio device at startup for instant recording
  initAudioDevice()

  setupIpcHandlers()
  createWindow(true)
  createToastWindow()
  createTray()

  await loadSavedHotkey()
  registerHotkeys()

  log(`Ready! Hold ${currentHotkey} to record.`)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    createWindow(false)
  }
})

app.on('will-quit', () => {
  log('Quitting...')
  uIOhook.stop()
  globalShortcut.unregisterAll()
  killFFmpeg()  // Kill FFmpeg on app quit
  if (wsConnection) wsConnection.close()
})

app.on('before-quit', () => {
  isQuitting = true
})

// Error handling
process.on('uncaughtException', (error) => {
  logError('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection:', reason)
})
