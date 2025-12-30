/**
 * useElectronAPI Hook
 *
 * Provides type-safe access to Electron IPC methods exposed via preload.
 * Handles loading/error states for async operations.
 */

import { useState, useCallback } from 'react'

// ============== TYPE DEFINITIONS ==============
export interface Settings {
  id?: number
  user_id?: string
  tone: 'formal' | 'casual' | 'technical'
  personal_dictionary?: Record<string, string>
}

export interface Stats {
  totalTranscriptions: number
  wordsCaptured: number
  timeSavedMinutes: number
}

export interface Transcription {
  id: number
  raw_text: string
  polished_text: string
  created_at: string
  duration?: number
}

export interface InjectResult {
  ok: boolean
  error?: string
  method?: 'direct' | 'clipboard-fallback'
}

interface ApiResult<T = any> {
  ok: boolean
  data?: T
  error?: string
}

// ============== HOOK IMPLEMENTATION ==============
export function useElectronAPI() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && !!window.voiceFlow

  // ============== SETTINGS ==============
  const fetchSettings = useCallback(async (): Promise<Settings | null> => {
    if (!isElectron) {
      console.warn('[useElectronAPI] Not running in Electron')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const result: ApiResult<Settings> = await window.voiceFlow.getSettings()
      if (result.ok && result.data) {
        return result.data
      } else {
        setError(result.error || 'Failed to fetch settings')
        return null
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [isElectron])

  const saveSettings = useCallback(async (settings: Settings): Promise<boolean> => {
    if (!isElectron) {
      console.warn('[useElectronAPI] Not running in Electron')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const result: ApiResult<void> = await window.voiceFlow.saveSettings(settings)
      if (result.ok) {
        return true
      } else {
        setError(result.error || 'Failed to save settings')
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return false
    } finally {
      setLoading(false)
    }
  }, [isElectron])

  // ============== STATS ==============
  const fetchStats = useCallback(async (): Promise<Stats | null> => {
    if (!isElectron) {
      console.warn('[useElectronAPI] Not running in Electron')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const result: ApiResult<Stats> = await window.voiceFlow.getStats()
      if (result.ok && result.data) {
        return result.data
      } else {
        setError(result.error || 'Failed to fetch stats')
        return null
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [isElectron])

  // ============== HISTORY ==============
  const fetchHistory = useCallback(async (limit?: number): Promise<Transcription[]> => {
    if (!isElectron) {
      console.warn('[useElectronAPI] Not running in Electron')
      return []
    }

    setLoading(true)
    setError(null)

    try {
      const result: ApiResult<Transcription[]> = await window.voiceFlow.getHistory(limit)
      if (result.ok && result.data) {
        return result.data
      } else {
        setError(result.error || 'Failed to fetch history')
        return []
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return []
    } finally {
      setLoading(false)
    }
  }, [isElectron])

  // ============== TEXT INJECTION ==============
  const injectText = useCallback(async (text: string): Promise<InjectResult> => {
    if (!isElectron) {
      console.warn('[useElectronAPI] Not running in Electron')
      return { ok: false, error: 'Not running in Electron' }
    }

    try {
      const result = await window.voiceFlow.injectText(text)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { ok: false, error: message }
    }
  }, [isElectron])

  // ============== WINDOW CONTROLS ==============
  const toggleWindow = useCallback(async () => {
    if (!isElectron) return
    await window.voiceFlow.toggleWindow()
  }, [isElectron])

  const hideWindow = useCallback(async () => {
    if (!isElectron) return
    await window.voiceFlow.hideWindow()
  }, [isElectron])

  const showWindow = useCallback(async () => {
    if (!isElectron) return
    await window.voiceFlow.showWindow()
  }, [isElectron])

  // ============== STATUS ==============
  const getStatus = useCallback(async () => {
    if (!isElectron) return null
    return await window.voiceFlow.getStatus()
  }, [isElectron])

  return {
    // State
    loading,
    error,
    isElectron,

    // Settings
    fetchSettings,
    saveSettings,

    // Stats
    fetchStats,

    // History
    fetchHistory,

    // Text injection
    injectText,

    // Window controls
    toggleWindow,
    hideWindow,
    showWindow,

    // Status
    getStatus,
  }
}

export default useElectronAPI
