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
  /** Check app status and recording state */
  getStatus: () => Promise<StatusResult>

  /** Toggle settings/history window visibility */
  toggleWindow: () => Promise<{ ok: boolean }>

  /** Hide the window */
  hideWindow: () => Promise<{ ok: boolean }>

  /** Show the window */
  showWindow: () => Promise<{ ok: boolean }>

  /** Inject text into the currently focused app */
  injectText: (text: string) => Promise<InjectResult>

  /** Get user settings from backend */
  getSettings: () => Promise<ApiResult<Settings>>

  /** Save user settings to backend */
  saveSettings: (settings: Settings) => Promise<ApiResult<void>>

  /** Get transcription history */
  getHistory: (limit?: number) => Promise<ApiResult<Transcription[]>>

  /** Get computed stats */
  getStats: () => Promise<ApiResult<Stats>>

  /** Update the global recording hotkey */
  updateHotkey: (hotkey: string) => Promise<{ ok: boolean; error?: string }>

  /** Get all modes */
  getModes: () => Promise<ApiResult<Mode[]>>

  /** Get active mode (optionally based on app) */
  getActiveMode: (appName?: string) => Promise<ApiResult<Mode>>

  /** Set active mode by ID */
  setActiveMode: (modeId: number | null) => Promise<{ ok: boolean }>

  /** Delete a transcription by ID */
  deleteTranscription: (id: number) => Promise<{ ok: boolean; error?: string }>

  /** Add dictionary entry */
  addDictionaryEntry: (mishearing: string, correction: string) => Promise<ApiResult<any>>

  /** Remove dictionary entry */
  removeDictionaryEntry: (mishearing: string) => Promise<{ ok: boolean; error?: string }>

  /** Get all snippets */
  getSnippets: () => Promise<ApiResult<any>>

  /** Add a snippet */
  addSnippet: (trigger: string, content: string) => Promise<ApiResult<any>>

  /** Delete a snippet by ID */
  deleteSnippet: (id: number) => Promise<{ ok: boolean; error?: string }>

  /** Export transcriptions */
  exportTranscriptions: (format: string, transcriptionIds: number[]) => Promise<ApiResult<any>>

  /** Send recording completion to main process */
  sendRecordingComplete: (text: string) => void

  /** Send recording error to main process */
  sendRecordingError: (error: string) => void

  /** Notify main that injection succeeded */
  sendInjectionDone: () => void

  /** Notify main that injection failed */
  sendInjectionFailed: (error: string) => void

  /** Send live transcription update to toast */
  sendLiveTranscription: (data: { partial: string; confirmed: string }) => void

  /** Show toast notification */
  showToast: (type: ToastType, message?: string) => void

  /** Hide toast notification */
  hideToast: () => void

  /** Cancel recording - don't transcribe (X button) */
  cancelRecording: () => void

  /** Stop recording - finish and transcribe (Stop button) */
  stopRecording: () => void

  /** Listen for start recording command from main */
  onStartRecording: (callback: (data?: { appContext?: string }) => void) => void

  /** Listen for stop recording command from main */
  onStopRecording: (callback: () => void) => void

  /** Listen for cancel recording command from main */
  onCancelRecording: (callback: () => void) => void

  /** Remove all IPC listeners (for cleanup) */
  removeAllListeners: () => void

  /** Listen for toast messages (for toast window) */
  onShowToast: (callback: (data: { type: ToastType; message?: string; mode?: RecordingMode }) => void) => void

  /** Listen for live transcription updates */
  onLiveTranscription: (callback: (data: { partial: string; confirmed: string }) => void) => void

  /** Listen for dashboard refresh command */
  onRefreshDashboard: (callback: () => void) => void

  /** Platform info */
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

  deleteTranscription: (id: number) => ipcRenderer.invoke('vf:delete-transcription', id),

  addDictionaryEntry: (mishearing: string, correction: string) =>
    ipcRenderer.invoke('vf:add-dictionary-entry', mishearing, correction),

  removeDictionaryEntry: (mishearing: string) =>
    ipcRenderer.invoke('vf:remove-dictionary-entry', mishearing),

  getSnippets: () => ipcRenderer.invoke('vf:get-snippets'),

  addSnippet: (trigger: string, content: string) =>
    ipcRenderer.invoke('vf:add-snippet', trigger, content),

  deleteSnippet: (id: number) => ipcRenderer.invoke('vf:delete-snippet', id),

  exportTranscriptions: (format: string, transcriptionIds: number[]) =>
    ipcRenderer.invoke('vf:export-transcriptions', format, transcriptionIds),

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

// Expose to renderer via contextBridge (secure)
contextBridge.exposeInMainWorld('voiceFlow', voiceFlowAPI)

console.log('[Voice-Flow Preload] API exposed to renderer (Wispr Flow mode)')

// ============== GLOBAL TYPE AUGMENTATION ==============
declare global {
  interface Window {
    voiceFlow: VoiceFlowAPI
  }
}
