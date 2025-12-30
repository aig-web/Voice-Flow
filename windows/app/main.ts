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
let audioBuffer: Buffer[] = []  // Buffer audio before WebSocket is ready
let wsReady = false  // Flag to track when WebSocket auth is complete
let finalReceived = false  // Flag to track if we've received final transcription

// Context capture globals
let capturedContext: CapturedContext | null = null
let currentModeId: number | null = null  // Active mode ID

// Cached audio device (detected at startup for instant recording)
let cachedAudioDevice: string | null = null

// Pre-cached WebSocket token (refreshed periodically for instant connection)
let cachedWsToken: string | null = null

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
  // Use cached token if available (instant), refresh in background
  if (cachedWsToken) {
    const token = cachedWsToken
    // Refresh token in background for next use
    fetchWsToken().then(t => { cachedWsToken = t }).catch(() => {})
    return token
  }
  // No cached token, fetch synchronously
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
      log('Failed to pre-cache WS token (will retry on recording):', err.message)
    })
}

// ============== AUDIO RECORDING (Main Process) ==============

/**
 * Send audio chunk - either buffer it or send directly based on WebSocket state
 */
function sendAudioChunk(chunk: Buffer) {
  if (wsReady && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(chunk)
  } else {
    audioBuffer.push(chunk)
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
    '-f', 'dshow',
    '-rtbufsize', '64k',           // Smaller buffer for lower latency
    '-probesize', '32',            // Minimal probing
    '-analyzeduration', '0',       // Skip analysis for instant start                    // DirectShow (Windows)
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
    '-rtbufsize', '64k',           // Smaller buffer for lower latency
    '-probesize', '32',            // Minimal probing
    '-analyzeduration', '0',       // Skip analysis for instant start
    '-list_devices', 'true',
    '-i', 'dummy'
  ]

  try {
    // First, let's try to find the default microphone
    ffmpegProcess = spawn(ffmpegPath, [
      '-f', 'dshow',
    '-rtbufsize', '64k',           // Smaller buffer for lower latency
    '-probesize', '32',            // Minimal probing
    '-analyzeduration', '0',       // Skip analysis for instant start
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
      sendAudioChunk(chunk)  // Use buffering to capture early audio
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
    '-rtbufsize', '64k',           // Smaller buffer for lower latency
    '-probesize', '32',            // Minimal probing
    '-analyzeduration', '0',       // Skip analysis for instant start
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
    await new Promise(resolve => setTimeout(resolve, 300))

    if (hasError || !ffmpegProcess) {
      // Fallback: try system default
      return await startAudioCaptureDefault()
    }

    // Pipe audio to WebSocket
    ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
      sendAudioChunk(chunk)  // Use buffering to capture early audio
    })

    return true
  } catch (err) {
    logError('Audio capture failed:', err)
    return false
  }
}

/**
 * Start audio capture using CACHED device (instant start, no device detection delay)
 */
async function startAudioCaptureDefault(): Promise<boolean> {
  const ffmpegPath = getFFmpegPath()

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

  log(`Starting audio with cached device: ${cachedAudioDevice}`)

  ffmpegProcess = spawn(ffmpegPath, [
    '-f', 'dshow',
    '-rtbufsize', '64k',           // Smaller buffer for lower latency
    '-probesize', '32',            // Minimal probing
    '-analyzeduration', '0',       // Skip analysis for instant start
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
        // Mark WebSocket as ready and flush any buffered audio immediately
        wsReady = true
        log('WebSocket ready, flushing audio buffer...')
        flushAudioBuffer()
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
            finalReceived = true  // Mark that we got the final, so close handler doesn't show error
            // Handle async but catch errors to ensure state is cleaned up
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

        // If we're still processing when WS closes unexpectedly without final message
        // give it a moment for any pending final message handler to complete
        // But only show error if we didn't receive the final transcription
