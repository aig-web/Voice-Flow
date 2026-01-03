// Voice Flow API types
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
  record_hotkey?: string
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
  deleteTranscription: (id: number) => Promise<{ ok: boolean; error?: string }>
  addDictionaryEntry: (mishearing: string, correction: string) => Promise<ApiResult<any>>
  removeDictionaryEntry: (mishearing: string) => Promise<{ ok: boolean; error?: string }>
  getSnippets: () => Promise<ApiResult<any>>
  addSnippet: (trigger: string, content: string) => Promise<ApiResult<any>>
  deleteSnippet: (id: number) => Promise<{ ok: boolean; error?: string }>
  exportTranscriptions: (format: string, transcriptionIds: number[]) => Promise<ApiResult<any>>
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

declare global {
  interface Window {
    voiceFlow: VoiceFlowAPI
  }
}

export {}
