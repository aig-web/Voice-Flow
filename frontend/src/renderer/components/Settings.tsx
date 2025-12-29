import React, { useEffect, useState, useCallback } from 'react'
import clsx from 'clsx'
import { AlertDialog } from './AlertDialog'
import { useTheme } from '../contexts/ThemeContext'
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type Language } from '../i18n/languages'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface UserSettings {
  id: number
  user_id: string
  tone: 'formal' | 'casual' | 'technical'
  record_hotkey: string
  microphone_id?: string
  language?: string
}

interface AudioDevice {
  deviceId: string
  label: string
}

export function Settings() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [tone, setTone] = useState<'formal' | 'casual' | 'technical'>('formal')
  const [recordHotkey, setRecordHotkey] = useState('Ctrl+Alt')
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null)
  const [microphones, setMicrophones] = useState<AudioDevice[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('default')
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    fetchSettings()
    fetchMicrophones()
  }, [])

  const fetchMicrophones = async () => {
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })

      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`
        }))

      setMicrophones(audioInputs)
    } catch (error) {
      console.error('Error fetching microphones:', error)
      setMicrophones([{ deviceId: 'default', label: 'Default Microphone' }])
    }
  }

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings`)
      const data = await response.json()
      setSettings(data)
      setTone(data.tone || 'formal')
      setRecordHotkey(data.record_hotkey || 'Ctrl+Alt')
      setLanguage(data.language || DEFAULT_LANGUAGE)
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  // Convert keyboard event to Electron accelerator format
  const keyEventToAccelerator = useCallback((e: KeyboardEvent): string => {
    const parts: string[] = []

    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')

    // Get the key
    const key = e.key
    if (key.length === 1) {
      parts.push(key.toUpperCase())
    } else if (key === 'Enter') {
      parts.push('Enter')
    } else if (key === 'Space') {
      parts.push('Space')
    } else if (key === 'Backspace') {
      parts.push('Backspace')
    } else if (key === 'Delete') {
      parts.push('Delete')
    } else if (key === 'Tab') {
      parts.push('Tab')
    } else if (key.startsWith('F') && key.length <= 3) {
      parts.push(key) // F1-F12
    } else if (key === 'ArrowUp') {
      parts.push('Up')
    } else if (key === 'ArrowDown') {
      parts.push('Down')
    } else if (key === 'ArrowLeft') {
      parts.push('Left')
    } else if (key === 'ArrowRight') {
      parts.push('Right')
    }

    return parts.join('+')
  }, [])

  // Hotkey recording handler
  useEffect(() => {
    if (!isRecordingHotkey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore modifier-only presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return
      }

      const accelerator = keyEventToAccelerator(e)
      if (accelerator && accelerator.includes('+')) {
        // Must have at least one modifier
        setRecordHotkey(accelerator)
        setIsRecordingHotkey(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRecordingHotkey, keyEventToAccelerator])

  // Format hotkey for display
  const formatHotkeyDisplay = (hotkey: string): string => {
    return hotkey
      .replace('CommandOrControl', 'Ctrl')
      .replace('Control', 'Ctrl')
      .replace('Meta', 'Cmd')
  }

  const handleSaveSettings = async () => {
    console.log('[Settings] Save clicked, hotkey:', recordHotkey)
    try {
      setIsSaving(true)
      // Get current dictionary to preserve it
      const currentResponse = await fetch(`${API_BASE_URL}/api/settings`)
      const currentData = await currentResponse.json()
      console.log('[Settings] Current data:', currentData)

      const payload = {
        tone,
        personal_dictionary: currentData.personal_dictionary || {},
        record_hotkey: recordHotkey,
        language
      }
      console.log('[Settings] Saving payload:', payload)

      const response = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()
      console.log('[Settings] Save response:', result)

      if (response.ok && !result.error) {
        // Notify Electron main process to update the hotkey
        console.log('[Settings] window.voiceFlow:', window.voiceFlow)
        if (window.voiceFlow?.updateHotkey) {
          console.log('[Settings] Calling updateHotkey IPC...')
          const ipcResult = await window.voiceFlow.updateHotkey(recordHotkey)
          console.log('[Settings] IPC result:', ipcResult)
          if (ipcResult.ok) {
            setAlert({ title: 'Success', message: `Settings saved! Hotkey updated to ${formatHotkeyDisplay(recordHotkey)}` })
          } else {
            setAlert({ title: 'Warning', message: `Settings saved but hotkey registration failed: ${ipcResult.error}` })
          }
        } else {
          console.log('[Settings] voiceFlow.updateHotkey not available')
          setAlert({ title: 'Success', message: 'Settings saved successfully!' })
        }
      } else {
        console.log('[Settings] Save failed:', result)
        setAlert({ title: 'Error', message: result.error || 'Failed to save settings' })
      }
    } catch (error) {
      console.error('[Settings] Error saving settings:', error)
      setAlert({ title: 'Error', message: 'Error saving settings' })
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted">Loading settings...</span>
        </div>
      </div>
    )
  }

  const toneOptions = [
    {
      value: 'formal',
      label: 'Formal',
      description: 'Professional, structured language for documents and emails',
      icon: 'business_center'
    },
    {
      value: 'casual',
      label: 'Casual',
      description: 'Conversational, relaxed tone for chats and messages',
      icon: 'chat_bubble'
    },
    {
      value: 'technical',
      label: 'Technical',
      description: 'Technical jargon and precision for code and documentation',
      icon: 'code'
    }
  ]

  return (
    <div className="min-h-screen flex flex-col animate-fade-in-up bg-background-light">
      {/* Fixed Header with Save Button */}
      <div className="sticky top-0 z-10 bg-background-light/95 backdrop-blur-sm border-b border-border-light px-8 py-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Settings</h1>
            <p className="text-text-muted text-sm">Customize Voice-Flow transcription</p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-full shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">save</span>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto space-y-6">

        {/* Microphone Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-8 space-y-6 shadow-card">
          <div>
            <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-content">mic</span>
              Microphone
            </h3>
            <p className="text-text-muted text-sm mt-1">
              Select which microphone to use for recording
            </p>
          </div>

          <div className="space-y-3">
            <select
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              className="w-full p-4 rounded-xl border border-border-light bg-surface-hover text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary cursor-pointer"
            >
              <option value="default">System Default</option>
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted">
              Changes take effect on next recording
            </p>
          </div>
        </div>

        {/* Theme Section */}
        <div className="bg-surface-light dark:bg-dark-surface border border-border-light dark:border-dark-border rounded-2xl p-8 space-y-6 shadow-card">
          <div>
            <h3 className="text-lg font-bold text-text-main dark:text-dark-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-content">palette</span>
              Appearance
            </h3>
            <p className="text-text-muted dark:text-dark-text-muted text-sm mt-1">
              Choose your preferred color theme
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light', label: 'Light', icon: 'light_mode' },
              { value: 'dark', label: 'Dark', icon: 'dark_mode' },
              { value: 'system', label: 'System', icon: 'settings_suggest' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value as 'light' | 'dark' | 'system')}
                className={clsx(
                  'p-4 rounded-xl border transition-all flex flex-col items-center gap-2',
                  theme === option.value
                    ? 'bg-primary/20 border-primary ring-2 ring-primary/30'
                    : 'border-border-light dark:border-dark-border hover:bg-surface-hover dark:hover:bg-dark-surface-hover'
                )}
              >
                <span className={clsx(
                  'material-symbols-outlined text-2xl',
                  theme === option.value ? 'text-primary-content' : 'text-text-muted dark:text-dark-text-muted'
                )}>
                  {option.icon}
                </span>
                <span className={clsx(
                  'text-sm font-medium',
                  theme === option.value ? 'text-primary-content' : 'text-text-main dark:text-dark-text-main'
                )}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Language Section */}
        <div className="bg-surface-light dark:bg-dark-surface border border-border-light dark:border-dark-border rounded-2xl p-8 space-y-6 shadow-card">
          <div>
            <h3 className="text-lg font-bold text-text-main dark:text-dark-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-content">translate</span>
              Language
            </h3>
            <p className="text-text-muted dark:text-dark-text-muted text-sm mt-1">
              Select the language for speech recognition
            </p>
          </div>

          <div className="space-y-3">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full p-4 rounded-xl border border-border-light dark:border-dark-border bg-surface-hover dark:bg-dark-surface-hover text-text-main dark:text-dark-text-main focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                  disabled={!lang.supported}
                >
                  {lang.flag} {lang.name} ({lang.nativeName}) {!lang.supported && '- Coming Soon'}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted dark:text-dark-text-muted">
              Currently using Parakeet TDT 0.6B which supports English. More languages coming soon.
            </p>
          </div>
        </div>

        {/* Hotkey Section */}
        <div className="bg-surface-light dark:bg-dark-surface border border-border-light dark:border-dark-border rounded-2xl p-8 space-y-6 shadow-card">
          <div>
            <h3 className="text-lg font-bold text-text-main dark:text-dark-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-content">keyboard</span>
              Recording Hotkey
            </h3>
            <p className="text-text-muted dark:text-dark-text-muted text-sm mt-1">
              Set the global keyboard shortcut to start/stop recording
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div
                onClick={() => setIsRecordingHotkey(true)}
                className={clsx(
                  'p-4 rounded-xl border cursor-pointer transition-all text-center',
                  isRecordingHotkey
                    ? 'bg-primary/20 border-primary ring-2 ring-primary/50 animate-pulse'
                    : 'bg-surface-hover dark:bg-dark-surface-hover border-border-light dark:border-dark-border hover:border-text-muted'
                )}
              >
                {isRecordingHotkey ? (
                  <span className="text-primary-content font-medium">Press your shortcut...</span>
                ) : (
                  <span className="text-text-main dark:text-dark-text-main font-mono text-lg font-bold">{formatHotkeyDisplay(recordHotkey)}</span>
                )}
              </div>
              <p className="text-xs text-text-muted dark:text-dark-text-muted mt-2">
                Click above and press your desired key combination (must include Ctrl, Alt, or Shift)
              </p>
            </div>
            <button
              onClick={() => {
                setRecordHotkey('Ctrl+Alt')
                setIsRecordingHotkey(false)
              }}
              className="px-4 py-2 text-sm text-text-muted dark:text-dark-text-muted hover:text-text-main dark:hover:text-dark-text-main border border-border-light dark:border-dark-border hover:border-text-muted rounded-full transition-all hover:bg-surface-hover dark:hover:bg-dark-surface-hover"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Tone Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-8 space-y-6 shadow-card">
          <div>
            <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-content">edit_note</span>
              Transcription Tone
            </h3>
            <p className="text-text-muted text-sm mt-1">
              Choose how your transcriptions should be formatted
            </p>
          </div>

          <div className="space-y-3">
            {toneOptions.map((option) => (
              <label
                key={option.value}
                onClick={() => setTone(option.value as typeof tone)}
                className={clsx(
                  'flex items-center gap-4 cursor-pointer p-5 rounded-xl transition-all border',
                  tone === option.value
                    ? 'bg-primary/10 border-primary/50 ring-2 ring-primary/30'
                    : 'border-border-light hover:bg-surface-hover hover:border-text-muted/30'
                )}
              >
                <div
                  className={clsx(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                    tone === option.value
                      ? 'bg-primary border-primary shadow-sm'
                      : 'border-border-light bg-background-light'
                  )}
                >
                  {tone === option.value && (
                    <div className="w-2 h-2 rounded-full bg-primary-content" />
                  )}
                </div>
                <div className="w-10 h-10 bg-surface-hover rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl text-primary-content">{option.icon}</span>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-text-main">{option.label}</p>
                  <p className="text-sm text-text-muted mt-0.5">{option.description}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="pt-6 border-t border-border-light">
            <p className="text-xs text-text-muted mb-4">
              Tone affects how OpenRouter polishes your transcribed text
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={fetchSettings}
                className="px-6 py-3 text-text-muted hover:text-text-main border border-border-light hover:border-text-muted rounded-full transition-all hover:bg-surface-hover"
              >
                Reset
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-full shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">save</span>
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Alert Dialog */}
      <AlertDialog
        isOpen={!!alert}
        title={alert?.title || ''}
        message={alert?.message || ''}
        onClose={() => setAlert(null)}
      />
    </div>
  )
}
