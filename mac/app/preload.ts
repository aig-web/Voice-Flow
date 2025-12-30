import { contextBridge, ipcRenderer } from 'electron'

// ============== TYPE DEFINITIONS ==============
interface InjectResult {
  ok: boolean
  error?: string
}

interface StatusResult {
  ok: boolean
  version?: string
  isRecording?: boolean
}

interface ApiResult<T = any> {
  ok: boolean
  data?: T
  error?: string
}

interface Settings {
  id?: number
  user_id?: string
  tone: 'formal' | 'casual' | 'technical'
  personal_dictionary?: Record<string, string>
}

interface Stats {
  totalTranscriptions: number
  wordsCaptured: number
  timeSavedMinutes: number
}

interface Transcription {
  id: number
  raw_text: string
  polished_text: string
  created_at: string
  duration?: number
  mode_id?: number
  mode_name?: string
  has_audio?: boolean
}

interface Mode {
  id: number
  name: string
  description?: string
  system_prompt: string
  tone: 'formal' | 'casual' | 'technical'
  use_ai_polish: boolean
  use_cleanup: boolean
  use_dictionary: boolean
  use_snippets: boolean
  ai_model: string
  auto_switch_apps: string[]
  shortcut?: string
  is_default: boolean
}

type ToastType = 'recording' | 'processing' | 'done' | 'error'
type RecordingMode = 'hold' | 'lock'

interface VoiceFlowAPI {
  getStatus: () => Promise<StatusResult>
  toggleWindow: () => Promise<{ ok: boolean }>
  hideWindow: () => Promise<{ ok: boolean }>
  showWindow: () => Promise<{ ok: boolean }>
  injectText: (text: string) => Promise<InjectResult>
  getSettings: () => Promise<ApiResult<Settings>>
  saveSettings: (settings: Settings) => Promise<ApiResult<void>>
  getHistory: (limit?: number) => Promise<ApiResult<Transcription[]>>
  getStats: () => Promise<ApiResult<Stats>>
  updateHotkey: (hotkey: string) => Promise<{ ok: boolean; error?: string }>
  getModes: () => Promise<ApiResult<Mode[]>>
  getActiveMode: (appName?: string) => Promise<ApiResult<Mode>>
  setActiveMode: (modeId: number | null) => Promise<{ ok: boolean }>
  sendRecordingComplete: (text: string) => void
  sendRecordingError: (error: string) => void
  sendInjectionDone: () => void
  sendInjectionFailed: (error: string) => void
  sendLiveTranscription: (data: { partial: string; confirmed: string }) => void
  showToast: (type: ToastType, message?: string) => void
  hideToast: () => void
  cancelRecording: () => void
  stopRecording: () => void
  onStartRecording: (callback: (data?: { appContext?: string }) => void) => void
  onStopRecording: (callback: () => void) => void
  onCancelRecording: (callback: () => void) => void
  removeAllListeners: () => void
  onShowToast: (callback: (data: { type: ToastType; message?: string; mode?: RecordingMode }) => void) => void
  onLiveTranscription: (callback: (data: { partial: string; confirmed: string }) => void) => void
  onRefreshDashboard: (callback: () => void) => void
  platform: NodeJS.Platform
}

// ============== EXPOSE API TO RENDERER ==============
const voiceFlowAPI: VoiceFlowAPI = {
  getStatus: () => ipcRenderer.invoke('vf:get-status'),
  toggleWindow: () => ipcRenderer.invoke('vf:toggle-window'),
  hideWindow: () => ipcRenderer.invoke('vf:hide-window'),
  showWindow: () => ipcRenderer.invoke('vf:show-window'),
  injectText: (text: string) => ipcRenderer.invoke('vf:inject-text', { text }),
  getSettings: () => ipcRenderer.invoke('vf:get-settings'),
  saveSettings: (settings: Settings) => ipcRenderer.invoke('vf:save-settings', settings),
  getHistory: (limit?: number) => ipcRenderer.invoke('vf:get-history', limit),
  getStats: () => ipcRenderer.invoke('vf:get-stats'),
  updateHotkey: (hotkey: string) => ipcRenderer.invoke('vf:update-hotkey', hotkey),
  getModes: () => ipcRenderer.invoke('vf:get-modes'),
  getActiveMode: (appName?: string) => ipcRenderer.invoke('vf:get-active-mode', appName),
  setActiveMode: (modeId: number | null) => ipcRenderer.invoke('vf:set-active-mode', modeId),

  sendRecordingComplete: (text: string) => {
    ipcRenderer.send('vf:recording-complete', { text })
  },

  sendRecordingError: (error: string) => {
    ipcRenderer.send('vf:recording-error', error)
  },

  sendInjectionDone: () => {
    ipcRenderer.send('vf:injection-done')
  },

  sendInjectionFailed: (error: string) => {
    ipcRenderer.send('vf:injection-failed', error)
  },

  sendLiveTranscription: (data: { partial: string; confirmed: string }) => {
    ipcRenderer.send('vf:live-transcription-update', data)
  },

  showToast: (type: ToastType, message?: string) => {
    ipcRenderer.send('vf:show-toast', { type, message })
  },

  hideToast: () => {
    ipcRenderer.send('vf:hide-toast')
  },

  cancelRecording: () => {
    ipcRenderer.send('vf:cancel-recording-request')
  },

  stopRecording: () => {
    ipcRenderer.send('vf:stop-recording-request')
  },

  onStartRecording: (callback: (data?: { appContext?: string }) => void) => {
    ipcRenderer.on('vf:start-recording', (_event, data) => callback(data))
  },

  onStopRecording: (callback: () => void) => {
    ipcRenderer.on('vf:stop-recording', () => callback())
  },

  onCancelRecording: (callback: () => void) => {
    ipcRenderer.on('vf:cancel-recording', () => callback())
  },

  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('vf:start-recording')
    ipcRenderer.removeAllListeners('vf:stop-recording')
    ipcRenderer.removeAllListeners('vf:cancel-recording')
    ipcRenderer.removeAllListeners('vf:show-toast')
    ipcRenderer.removeAllListeners('vf:live-transcription')
    ipcRenderer.removeAllListeners('vf:refresh-dashboard')
  },

  onShowToast: (callback: (data: { type: ToastType; message?: string }) => void) => {
    ipcRenderer.on('vf:show-toast', (_event, data) => callback(data))
  },

  onLiveTranscription: (callback: (data: { partial: string; confirmed: string }) => void) => {
    ipcRenderer.on('vf:live-transcription', (_event, data) => callback(data))
  },

  onRefreshDashboard: (callback: () => void) => {
    ipcRenderer.on('vf:refresh-dashboard', () => callback())
  },

  platform: process.platform,
}

contextBridge.exposeInMainWorld('voiceFlow', voiceFlowAPI)

console.log('[Voice-Flow Preload] API exposed to renderer (macOS)')

// ============== GLOBAL TYPE AUGMENTATION ==============
declare global {
  interface Window {
    voiceFlow: VoiceFlowAPI
  }
}
