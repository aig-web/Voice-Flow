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
const API_BASE_URL = 'http://127.0.0.1:8000'
const WS_URL = 'ws://127.0.0.1:8000'
const SAMPLE_RATE = 16000

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
  } else {
    logError('No audio device detected at startup!')
  }
}

// ============== WebSocket Token ==============
async function fetchWsToken(): Promise<string> {
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

function sendAudioChunk(chunk: Buffer) {
  if (wsReady && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(chunk)
  } else {
    audioBuffer.push(chunk)
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
 * Start audio capture using FFmpeg with AVFoundation (macOS)
 */
async function startAudioCaptureDefault(): Promise<boolean> {
  const ffmpegPath = getFFmpegPath()

  audioBuffer = []
  wsReady = false

  if (!cachedAudioDevice) {
    logError('No cached audio device - detecting now...')
    cachedAudioDevice = detectAudioDevice()
    if (!cachedAudioDevice) {
      logError('No audio device found')
      return false
    }
  }

  log(`Starting audio with device: ${cachedAudioDevice}`)

  // macOS uses avfoundation for audio capture
  // :0 = default audio input, or :N for specific device
  ffmpegProcess = spawn(ffmpegPath, [
    '-f', 'avfoundation',           // macOS audio framework
    '-i', `:${cachedAudioDevice}`,  // Audio device (colon prefix means audio-only)
    '-ar', String(SAMPLE_RATE),      // Sample rate
    '-ac', '1',                       // Mono
    '-f', 's16le',                    // Raw PCM format
    '-acodec', 'pcm_s16le',          // PCM codec
    'pipe:1'                          // Output to stdout
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
    sendAudioChunk(chunk)
  })

  ffmpegProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    if (msg.includes('error') || msg.includes('Error')) {
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
}

function stopAudioCapture() {
  if (ffmpegProcess) {
    log('Stopping FFmpeg...')
    ffmpegProcess.kill('SIGTERM')
    ffmpegProcess = null
  }
  audioBuffer = []
  wsReady = false
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
        setTimeout(() => {
          wsReady = true
          log('WebSocket ready, flushing audio buffer...')
          flushAudioBuffer()
        }, 50)
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
      updateToast('processing', 'Injecting...')

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
  disconnectWebSocket()

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
    width: 500,
    height: 120,
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
    x: Math.round((width - 500) / 2),
    y: 40,
    width: 500,
    height: 120,
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
    toastWindow?.show()
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
    backgroundColor: '#0f172a',
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

  initAudioDevice()
  setTimeout(() => preCacheWsToken(), 1000)

  setupIpcHandlers()
  createWindow(true)
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
  stopAudioCapture()
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
