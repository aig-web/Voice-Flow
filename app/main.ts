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
import WebSocket from 'ws'

// ============== CONFIG ==============
const DEV_URL = 'http://localhost:5173'
const API_BASE_URL = 'http://127.0.0.1:8000'  // Use IPv4 explicitly to avoid ::1 issues
const WS_URL = 'ws://127.0.0.1:8000'
const SAMPLE_RATE = 16000

// Default hotkey
let currentHotkey = 'CommandOrControl+Shift+S'

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

// Audio recording globals (main process handles this now!)
let ffmpegProcess: ChildProcess | null = null
let wsConnection: WebSocket | null = null
let wsToken: string | null = null

// ============== LOGGING ==============
function log(message: string, ...args: unknown[]) {
  console.log(`[Voice-Flow] ${message}`, ...args)
}

function logError(message: string, ...args: unknown[]) {
  console.error(`[Voice-Flow ERROR] ${message}`, ...args)
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
 * Fallback: Use first available audio device
 */
async function startAudioCaptureDefault(): Promise<boolean> {
  const ffmpegPath = getFFmpegPath()

  log('Trying default audio device...')

  // Get list of devices first
  try {
    const listOutput = execSync(`"${ffmpegPath}" -list_devices true -f dshow -i dummy 2>&1`, {
      encoding: 'utf8',
      windowsHide: true
    }).toString()

    // Parse for audio devices
    const audioMatch = listOutput.match(/"([^"]+)" \(audio\)/)
    if (audioMatch) {
      const deviceName = audioMatch[1]
      log(`Found audio device: ${deviceName}`)

      ffmpegProcess = spawn(ffmpegPath, [
        '-f', 'dshow',
        '-i', `audio=${deviceName}`,
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
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(chunk)
        }
      })

      ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        // Suppress non-error output
      })

      return true
    }
  } catch (err) {
    // execSync throws if ffmpeg exits with error (expected for -list_devices)
    const output = (err as { stdout?: string }).stdout || ''
    const audioMatch = output.match(/"([^"]+)" \(audio\)/i)
    if (audioMatch) {
      const deviceName = audioMatch[1]
      log(`Found audio device from error output: ${deviceName}`)

      ffmpegProcess = spawn(ffmpegPath, [
        '-f', 'dshow',
        '-i', `audio=${deviceName}`,
        '-ar', String(SAMPLE_RATE),
        '-ac', '1',
        '-f', 's16le',
        'pipe:1'
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(chunk)
        }
      })

      return true
    }
  }

  logError('No audio device found')
  return false
}

function stopAudioCapture() {
  if (ffmpegProcess) {
    log('Stopping FFmpeg...')
    ffmpegProcess.kill('SIGTERM')
    ffmpegProcess = null
  }
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
          app_context: 'general'
        }))
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
            // Update toast with live transcription
            updateToastLive(msg.partial || '', msg.confirmed || '')
          }

          if (msg.type === 'final') {
            log('Received final transcription:', msg.text?.substring(0, 50))
            handleFinalTranscription(msg.text || msg.raw || '')
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

async function handleFinalTranscription(text: string) {
  log('Final transcription received:', text?.substring(0, 50))

  // Close WebSocket now
  if (wsConnection) {
    wsConnection.close()
    wsConnection = null
  }

  if (text && text.trim().length > 0) {
    updateToast('processing', 'Injecting...')

    const result = await injectText(text)

    if (result.ok) {
      log('Text injected successfully')
      updateToast('done', 'Done!')
      recordingState = 'idle'
      // Refresh dashboard after successful transcription
      refreshDashboard()
    } else {
      logError('Injection failed:', result.error)
      updateToast('error', result.error || 'Injection failed')
      recordingState = 'idle'
    }
  } else {
    log('No text to inject')
    updateToast('done', 'No speech detected')
    recordingState = 'idle'
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
  updateToast('recording', 'Listening...')

  try {
    // Connect WebSocket first
    const wsOk = await connectWebSocket()
    if (!wsOk) {
      throw new Error('WebSocket connection failed')
    }

    // Start audio capture
    const audioOk = await startAudioCaptureDefault()
    if (!audioOk) {
      throw new Error('Audio capture failed')
    }

    log('Recording started successfully')
  } catch (err) {
    logError('Failed to start recording:', err)
    updateToast('error', String(err))
    recordingState = 'idle'
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

  // Send to toast (simple one-way IPC - doesn't matter if it fails)
  try {
    toastWindow?.webContents.send('vf:show-toast', { type, message, mode: 'hold' })
    toastWindow?.show()
  } catch (e) {
    // Ignore - toast is just UI feedback
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

function setupIpcHandlers() {
  log('Setting up IPC handlers...')

  // API proxy for settings
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

  // Toast controls
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

// ============== APP LIFECYCLE ==============

app.whenReady().then(async () => {
  log('App ready')
  log(`Platform: ${process.platform}`)
  log(`Dev mode: ${isDev}`)
  log('Voice-Flow starting...')

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
