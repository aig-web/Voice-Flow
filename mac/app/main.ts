/**
 * Voice-Flow Main Process - macOS
 *
 * Architecture:
 * - Main process handles: hotkeys, audio recording (FFmpeg), WebSocket, transcription
 * - Renderer handles: UI display (toast, settings, dashboard)
 * - Audio captured via FFmpeg subprocess using AVFoundation (macOS)
 *
 * Flow:
 * 1. Hotkey DOWN -> Start FFmpeg audio capture + WebSocket connection
 * 2. Audio streams from FFmpeg -> WebSocket (in main process)
 * 3. Hotkey UP -> Stop FFmpeg, send 'stop' to WebSocket, wait for final
 * 4. Receive final transcription -> Inject text -> Refresh dashboard
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
  systemPreferences,
  dialog,
  session,
} from 'electron'
import path from 'path'
import { existsSync } from 'fs'
import { spawn, ChildProcess, execSync } from 'child_process'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { injectText } from './platform/injectText'
import { captureFullContext, CapturedContext } from './platform/contextCapture'
import WebSocket from 'ws'

// ============== CONFIG ==============
const DEV_URL = 'http://localhost:5173'
const API_BASE_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001'
const WS_URL = API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')
const SAMPLE_RATE = 16000

console.log(`[Voice-Flow] Connecting to backend: ${API_BASE_URL}`)
console.log(`[Voice-Flow] WebSocket URL: ${WS_URL}`)

// Default hotkey - macOS uses Command key
let currentHotkey = 'Command+Shift+S'

// ============== STATE MACHINE ==============
type RecordingState = 'idle' | 'recording' | 'processing'
let recordingState: RecordingState = 'idle'
let isHotkeyPressed = false

// ============== GLOBALS ==============
let mainWindow: BrowserWindow | null = null
let toastWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let backendProcess: ChildProcess | null = null
const isDev = process.env.NODE_ENV === 'development'

// Audio recording globals
let ffmpegProcess: ChildProcess | null = null
let wsConnection: WebSocket | null = null
let wsToken: string | null = null
let audioBuffer: Buffer[] = []
let wsReady = false
let finalReceived = false

// Audio chunking: Accumulate small FFmpeg chunks into larger ones (like Windows)
// Math: 16kHz sample rate * 2 bytes (16-bit) * 0.5 seconds = 16000 bytes per chunk
// This gives ~2 chunks/second like Windows (40 chunks for 20 seconds)
const TARGET_CHUNK_BYTES = 16000  // 500ms of audio
let audioAccumulator = Buffer.alloc(0)  // Single buffer to accumulate audio

// FFmpeg pre-warming: Keep FFmpeg running to eliminate startup delay
let ffmpegPrewarmed = false  // Is FFmpeg already running in standby?
let isCapturing = false  // Are we actively capturing audio (vs standby)?
let preWarmBuffer: Buffer[] = []  // Rolling buffer of recent audio for instant start
const PRE_WARM_BUFFER_MS = 1500  // Keep 1.5 seconds of audio in pre-warm buffer
const PRE_WARM_BUFFER_SIZE = Math.floor((16000 * 2 * PRE_WARM_BUFFER_MS) / 1000)  // bytes at 16kHz 16-bit mono

// Context capture globals
let capturedContext: CapturedContext | null = null
let currentModeId: number | null = null

// Cached audio device
let cachedAudioDevice: string | null = null

// Pre-cached WebSocket token
let cachedWsToken: string | null = null

// ============== LOGGING ==============
function log(message: string, ...args: unknown[]) {
  console.log(`[Voice-Flow] ${message}`, ...args)
}

function logError(message: string, ...args: unknown[]) {
  console.error(`[Voice-Flow ERROR] ${message}`, ...args)
}

// ============== FFmpeg Path Detection (macOS) ==============
function getFFmpegPath(): string {
  const possiblePaths = [
    // Homebrew paths
    '/opt/homebrew/bin/ffmpeg',     // Apple Silicon
    '/usr/local/bin/ffmpeg',         // Intel Mac
    // Resources path (packaged)
    app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg') : '',
    // System PATH
    'ffmpeg',
  ].filter(p => p)

  for (const ffmpegPath of possiblePaths) {
    if (ffmpegPath === 'ffmpeg') {
      try {
        execSync('which ffmpeg', { stdio: 'ignore' })
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

  logError('FFmpeg not found! Install with: brew install ffmpeg')
  return 'ffmpeg'
}

// ============== Audio Device Detection (macOS - AVFoundation) ==============
function detectAudioDevice(): string | null {
  const ffmpegPath = getFFmpegPath()
  try {
    // macOS uses avfoundation to list devices
    const output = execSync(`"${ffmpegPath}" -f avfoundation -list_devices true -i "" 2>&1`, {
      encoding: 'utf8',
      timeout: 5000
    })
    return null // Won't reach here
  } catch (err) {
    const error = err as { message?: string; stdout?: string; stderr?: string }
    const output = error.message || error.stdout || error.stderr || ''
    log(`FFmpeg device list: ${output.substring(0, 500)}`)

    // Parse macOS audio device - look for audio input devices
    // Format: [AVFoundation indev @ ...] [0] Built-in Microphone
    const audioMatch = output.match(/\[(\d+)\]\s+([^\n]+(?:Microphone|Audio|Input)[^\n]*)/i)
    if (audioMatch) {
      return audioMatch[1]  // Return device index
    }

    // Default to device 0 (usually default microphone)
    return '0'
  }
  return '0'
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
    '-f', 'avfoundation',
    '-i', `:${cachedAudioDevice}`,
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    'pipe:1'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
    sendAudioData(chunk)
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

// ============== WebSocket Token ==============
async function fetchWsToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request(`${API_BASE_URL}/api/ws-token`)

    // Add headers to bypass ngrok warning page
    request.setHeader('User-Agent', 'Voice-Flow/2.0')
    request.setHeader('ngrok-skip-browser-warning', 'true')

    let data = ''

    request.on('response', (response) => {
      response.on('data', (chunk) => { data += chunk.toString() })
      response.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.token)
        } catch (e) {
          logError(`Failed to parse token response: ${data.substring(0, 200)}`)
          reject(new Error('Invalid token response'))
        }
      })
    })

    request.on('error', reject)
    request.end()
  })
}

async function getWsToken(): Promise<string> {
  if (cachedWsToken) {
    const token = cachedWsToken
    fetchWsToken().then(t => { cachedWsToken = t }).catch(() => {})
    return token
  }
  cachedWsToken = await fetchWsToken()
  return cachedWsToken
}

function preCacheWsToken(): void {
  fetchWsToken()
    .then(token => {
      cachedWsToken = token
      log('WebSocket token pre-cached')
    })
    .catch(err => {
      log('Failed to pre-cache WS token:', err.message)
    })
}

// ============== AUDIO RECORDING (macOS - AVFoundation) ==============

/**
 * Send audio data - routes to either pre-warm buffer or WebSocket based on state
 * Accumulates into TARGET_CHUNK_BYTES chunks before sending
 * This reduces chunk count from 2000+ to ~40 for 20 seconds (like Windows)
 */
function sendAudioData(data: Buffer) {
  // Accumulate data
  audioAccumulator = Buffer.concat([audioAccumulator, data])

  // Send complete chunks
  while (audioAccumulator.length >= TARGET_CHUNK_BYTES) {
    const chunk = audioAccumulator.subarray(0, TARGET_CHUNK_BYTES)
    audioAccumulator = audioAccumulator.subarray(TARGET_CHUNK_BYTES)

    if (isCapturing) {
      // Actively recording - send to WebSocket or buffer
      if (wsReady && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(chunk)
      } else {
        audioBuffer.push(Buffer.from(chunk))
      }
    } else if (ffmpegPrewarmed) {
      // Pre-warm mode - maintain rolling buffer of recent audio
      preWarmBuffer.push(Buffer.from(chunk))
      // Keep buffer size under limit (rolling window)
      let totalSize = preWarmBuffer.reduce((sum, b) => sum + b.length, 0)
      while (totalSize > PRE_WARM_BUFFER_SIZE && preWarmBuffer.length > 0) {
        const removed = preWarmBuffer.shift()
        if (removed) totalSize -= removed.length
      }
    }
  }
}

/**
 * Flush any remaining audio in accumulator
 */
function flushRemainingAudio() {
  if (audioAccumulator.length > 0) {
    if (wsReady && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(audioAccumulator)
    } else {
      audioBuffer.push(Buffer.from(audioAccumulator))
    }
    audioAccumulator = Buffer.alloc(0)
  }
}

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
 * Start audio capture using CACHED device (instant start, no device detection delay)
 * If FFmpeg is pre-warmed, just switch to capture mode and use buffered audio
 */
async function startAudioCaptureDefault(): Promise<boolean> {
  // Reset audio buffer for new recording
  audioBuffer = []
  audioAccumulator = Buffer.alloc(0)
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
    '-f', 'avfoundation',
    '-i', `:${cachedAudioDevice}`,
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    'pipe:1'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
    sendAudioData(chunk)
  })

  ffmpegProcess.stderr?.on('data', () => {
    // Suppress non-error output
  })

  isCapturing = true
  return true
}

function stopAudioCapture() {
  log('Stopping audio capture (keeping FFmpeg pre-warmed)...')
  // Flush remaining audio before stopping
  flushRemainingAudio()

  // Don't kill FFmpeg - switch back to pre-warm mode for instant next recording
  isCapturing = false
  audioBuffer = []
  audioAccumulator = Buffer.alloc(0)
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
  audioAccumulator = Buffer.alloc(0)
  preWarmBuffer = []
}

// ============== WEBSOCKET CONNECTION ==============

async function connectWebSocket(): Promise<boolean> {
  log('Connecting WebSocket...')

  try {
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

          if (msg.type === 'partial') {
            updateToastLive(msg.partial || '', msg.confirmed || '')
          }

          if (msg.type === 'final') {
            log('Received final transcription:', msg.text?.substring(0, 50))
            finalReceived = true
            handleFinalTranscription(msg.text || msg.raw || '').catch(err => {
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

        setTimeout(() => {
          if (recordingState === 'processing' && !finalReceived) {
            log('WebSocket closed while still processing without final')
            updateToast('error', 'Connection closed unexpectedly')
            recordingState = 'idle'
          }
        }, 500)
      })

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
    }
  }
}

async function handleFinalTranscription(text: string) {
  log('Final transcription received:', text?.substring(0, 50))

  if (wsConnection) {
    wsConnection.close()
    wsConnection = null
  }

  try {
    if (text && text.trim().length > 0) {
      // Hide ALL Voice-Flow windows BEFORE injection so target app gets focus
      hideToast()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide()
      }

      // Small delay to let macOS return focus to previous app
      await new Promise(resolve => setTimeout(resolve, 100))

      const result = await injectText(text)

      if (result.ok) {
        log('Text injected successfully')
        updateToast('done', 'Done!')
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
    recordingState = 'idle'
    log('Recording state reset to idle')
  }
}

function refreshDashboard() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  try {
    mainWindow.webContents.send('vf:refresh-dashboard')
    log('Dashboard refresh triggered')
  } catch (err) {
    log('Dashboard refresh skipped (window not ready)')
  }
}

// ============== RECORDING STATE MACHINE ==============

async function startRecording() {
  if (recordingState !== 'idle') {
    log(`Cannot start recording: state is ${recordingState}`)
    return
  }

  const startTime = Date.now()
  log('Starting recording...')
  recordingState = 'recording'
  finalReceived = false
  updateToast('recording', 'Listening...')

  try {
    const [audioOk, wsOk] = await Promise.all([
      startAudioCaptureDefault(),
      connectWebSocket()
    ])

    const elapsed = Date.now() - startTime
    log(`Recording ready in ${elapsed}ms`)

    if (!audioOk) {
      throw new Error('Audio capture failed')
    }
    if (!wsOk) {
      throw new Error('WebSocket connection failed')
    }

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

  stopAudioCapture()

  // Wait for audio to be fully transmitted before sending stop
  setTimeout(() => {
    disconnectWebSocket()
  }, 300)

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
    focusable: false,           // Don't take focus
    show: false,
    hasShadow: false,           // No shadow to avoid visual focus cue
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // macOS: Set window level to floating (above normal windows) and show on all workspaces
  toastWindow.setAlwaysOnTop(true, 'floating')
  toastWindow.setVisibleOnAllWorkspaces(true)

  if (app.isPackaged) {
    const indexPath = path.join(process.resourcesPath, 'app', 'index.html')
    toastWindow.loadFile(indexPath, { hash: '/toast' })
  } else if (isDev) {
    toastWindow.loadURL(`${DEV_URL}/#/toast`)
  } else {
    const localDistPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html')
    if (existsSync(localDistPath)) {
      toastWindow.loadFile(localDistPath, { hash: '/toast' })
    } else {
      toastWindow.loadURL(`${DEV_URL}/#/toast`)
    }
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

  try {
    if (type === 'recording') {
      toastWindow?.webContents.send('vf:live-transcription', { partial: '', confirmed: '' })
    }
    toastWindow?.webContents.send('vf:show-toast', { type, message, mode: 'hold' })
    // Use showInactive to avoid stealing focus from target app
    toastWindow?.showInactive()
  } catch (e) {
    // Ignore
  }

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
    backgroundColor: '#ffffff',
    show: false,
    skipTaskbar: !showImmediately,
    titleBarStyle: 'hiddenInset',  // macOS native title bar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (app.isPackaged) {
    // Production: load from resources
    const indexPath = path.join(process.resourcesPath, 'app', 'index.html')
    mainWindow.loadFile(indexPath)
  } else if (isDev) {
    // Dev mode with hot reload
    log(`Loading dev URL: ${DEV_URL}`)
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Local testing: load from built frontend
    const localDistPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html')
    log(`Loading local build: ${localDistPath}`)
    if (existsSync(localDistPath)) {
      mainWindow.loadFile(localDistPath)
    } else {
      log(`ERROR: Frontend not built. Run 'cd frontend && npm run build'`)
      mainWindow.loadURL(DEV_URL) // Fallback to dev server
    }
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
  mainWindow.show()
  mainWindow.focus()
}

function hideWindow() {
  if (mainWindow) {
    mainWindow.hide()
  }
}

// ============== HOTKEY REGISTRATION (macOS) ==============

// macOS key codes - Command key
const KEY_CODES: Record<string, number> = {
  'Meta': UiohookKey.Meta,      // Command key on macOS
  'Command': UiohookKey.Meta,
  'Alt': UiohookKey.Alt,
  'Option': UiohookKey.Alt,     // Option is Alt on macOS
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
  meta: boolean   // Command on macOS
  ctrl: boolean
  alt: boolean
  shift: boolean
  extraKey: string | null
}

let parsedHotkey: ParsedHotkey = { meta: true, ctrl: false, alt: false, shift: true, extraKey: 'S' }
let pressedModifiers = { meta: false, ctrl: false, alt: false, shift: false, extraKey: false }

function parseHotkey(hotkey: string): ParsedHotkey {
  const parts = hotkey.split('+').map(p => p.trim().toLowerCase())

  const result: ParsedHotkey = {
    meta: parts.includes('command') || parts.includes('meta') || parts.includes('cmd'),
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    alt: parts.includes('alt') || parts.includes('option'),
    shift: parts.includes('shift'),
    extraKey: null
  }

  const modifiers = ['command', 'meta', 'cmd', 'ctrl', 'control', 'alt', 'option', 'shift']
  const extraKey = parts.find(p => !modifiers.includes(p))
  if (extraKey) {
    result.extraKey = extraKey.toUpperCase()
  }

  return result
}

function checkHotkeyPressed(): boolean {
  if (parsedHotkey.meta && !pressedModifiers.meta) return false
  if (parsedHotkey.ctrl && !pressedModifiers.ctrl) return false
  if (parsedHotkey.alt && !pressedModifiers.alt) return false
  if (parsedHotkey.shift && !pressedModifiers.shift) return false
  if (parsedHotkey.extraKey && !pressedModifiers.extraKey) return false
  if (!parsedHotkey.meta && !parsedHotkey.ctrl && !parsedHotkey.alt && !parsedHotkey.shift) return false
  return true
}

function getExtraKeycode(key: string): number | null {
  return KEY_CODES[key.toUpperCase()] || null
}

function registerHotkeys() {
  log('Registering hotkeys...')

  parsedHotkey = parseHotkey(currentHotkey)
  log(`Hotkey: ${currentHotkey}`)
  log(`Parsed: meta=${parsedHotkey.meta}, ctrl=${parsedHotkey.ctrl}, alt=${parsedHotkey.alt}, shift=${parsedHotkey.shift}, extra=${parsedHotkey.extraKey}`)

  uIOhook.on('keydown', (e) => {
    // macOS Command/Meta key
    if (e.keycode === UiohookKey.Meta || e.keycode === 55 || e.keycode === 3675) pressedModifiers.meta = true
    if (e.keycode === UiohookKey.Ctrl || e.keycode === 29 || e.keycode === 59) pressedModifiers.ctrl = true
    if (e.keycode === UiohookKey.Alt || e.keycode === 56 || e.keycode === 58) pressedModifiers.alt = true
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

    if (e.keycode === UiohookKey.Meta || e.keycode === 55 || e.keycode === 3675) pressedModifiers.meta = false
    if (e.keycode === UiohookKey.Ctrl || e.keycode === 29 || e.keycode === 59) pressedModifiers.ctrl = false
    if (e.keycode === UiohookKey.Alt || e.keycode === 56 || e.keycode === 58) pressedModifiers.alt = false
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
      pressedModifiers = { meta: false, ctrl: false, alt: false, shift: false, extraKey: false }
      cancelRecording()
    }
  })
}

// ============== TRAY (macOS Menu Bar) ==============

function createTray() {
  log('Creating tray...')

  const iconPath = path.join(__dirname, 'icon.png')
  let trayIcon: Electron.NativeImage

  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty()
    // macOS tray icons should be template images
    trayIcon.setTemplateImage(true)
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

// ============== IPC HANDLERS ==============

function setupIpcHandlers() {
  log('Setting up IPC handlers...')

  ipcMain.handle('vf:get-settings', async () => {
    try {
      const data = await fetchFromBackend('/api/settings')
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.handle('vf:save-settings', async (_event, settings: unknown) => {
    try {
      const data = await fetchFromBackend('/api/settings', { method: 'POST', body: settings })
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
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

  ipcMain.handle('vf:get-stats', async () => {
    try {
      const transcriptions = await fetchFromBackend('/api/transcriptions') as Array<{
        polished_text?: string
        raw_text?: string
      }>

      if (!Array.isArray(transcriptions)) {
        return { ok: true, data: { totalTranscriptions: 0, wordsCaptured: 0, timeSavedMinutes: 0 } }
      }

      const totalTranscriptions = transcriptions.length
      const wordsCaptured = transcriptions.reduce((acc: number, t) => {
        const text = t.polished_text || t.raw_text || ''
        return acc + text.split(/\s+/).filter((w: string) => w.length > 0).length
      }, 0)
      const timeSavedMinutes = Math.round(wordsCaptured / 40)

      return { ok: true, data: { totalTranscriptions, wordsCaptured, timeSavedMinutes } }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  })

  ipcMain.on('vf:cancel-recording-request', () => cancelRecording())
  ipcMain.on('vf:stop-recording-request', () => stopRecording())

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

// ============== APP LIFECYCLE (macOS) ==============

app.whenReady().then(async () => {
  log('App ready')
  log(`Platform: ${process.platform}`)
  log(`Dev mode: ${isDev}`)
  log('Voice-Flow starting...')

  // macOS permissions
  if (process.platform === 'darwin') {
    // 1. Check and request Accessibility permission (required for hotkeys and text injection)
    const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
    log(`Accessibility permission: ${isTrusted ? 'granted' : 'not granted'}`)

    if (!isTrusted) {
      log('Requesting Accessibility permission...')
      // This will show the system prompt to grant accessibility permission
      const promptResult = systemPreferences.isTrustedAccessibilityClient(true)

      if (!promptResult) {
        // Show a dialog explaining why the permission is needed
        dialog.showMessageBox({
          type: 'warning',
          title: 'Accessibility Permission Required',
          message: 'Voice-Flow needs Accessibility permission to detect hotkeys and inject text.',
          detail: 'Please go to System Preferences > Security & Privacy > Privacy > Accessibility and enable Voice-Flow.\n\nThe app will continue to run, but hotkeys may not work until permission is granted.',
          buttons: ['Open System Preferences', 'Continue Anyway'],
          defaultId: 0,
        }).then((result) => {
          if (result.response === 0) {
            // Open System Preferences to Accessibility
            require('child_process').exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')
          }
        })
      }
    }

    // 2. Request Microphone permission (required for audio recording)
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    log(`Microphone permission: ${micStatus}`)

    if (micStatus !== 'granted') {
      log('Requesting Microphone permission...')
      systemPreferences.askForMediaAccess('microphone').then((granted) => {
        log(`Microphone permission ${granted ? 'granted' : 'denied'}`)
        if (!granted) {
          dialog.showMessageBox({
            type: 'warning',
            title: 'Microphone Permission Required',
            message: 'Voice-Flow needs Microphone access to record your voice.',
            detail: 'Please go to System Preferences > Security & Privacy > Privacy > Microphone and enable Voice-Flow.',
            buttons: ['OK'],
          })
        }
      })
    }
  }

  // Set up permission handlers for renderer process (getUserMedia, etc.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    log(`Permission request: ${permission}`)
    // Allow media permissions (includes microphone)
    const allowedPermissions = ['media', 'notifications']
    if (allowedPermissions.includes(permission) || permission.includes('media')) {
      callback(true)
    } else {
      callback(true) // Allow all permissions for now since this is a desktop app
    }
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    log(`Permission check: ${permission}`)
    // Allow all permissions for desktop app
    return true
  })

  initAudioDevice()
  setTimeout(() => preCacheWsToken(), 1000)

  setupIpcHandlers()
  createWindow(false)  // Don't show main window at startup - tray app behavior
  createToastWindow()
  createTray()

  await loadSavedHotkey()
  registerHotkeys()

  log(`Ready! Hold ${currentHotkey} to record.`)
})

// macOS: Keep running when all windows closed (dock/tray behavior)
app.on('window-all-closed', () => {
  // Don't quit on macOS - app stays in dock/menu bar
})

app.on('activate', () => {
  // macOS: Re-create window when clicking dock icon
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(true)
  } else {
    showWindow()
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
