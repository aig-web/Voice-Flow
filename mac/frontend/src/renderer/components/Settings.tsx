import React, { useEffect, useState, useCallback } from 'react'
import clsx from 'clsx'
import { AlertDialog } from './AlertDialog'
import { useTheme } from '../contexts/ThemeContext'
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type Language } from '../i18n/languages'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Detect platform
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

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
  const [recordHotkey, setRecordHotkey] = useState(isMac ? 'Meta+Alt' : 'Control+Alt')
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
      setRecordHotkey(data.record_hotkey || (isMac ? 'Meta+Alt' : 'Control+Alt'))
      setLanguage(data.language || DEFAULT_LANGUAGE)
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  // Hotkey recording handler - allow modifier-only combinations
  useEffect(() => {
    if (!isRecordingHotkey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Control')
      if (e.metaKey) parts.push('Meta')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      // Allow modifier-only combinations (like Ctrl+Alt)
      if (parts.length >= 2) {
        const isModifierKey = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)

        if (!isModifierKey) {
          const key = e.key
          if (key.length === 1) {
            parts.push(key.toUpperCase())
          } else if (['Enter', 'Space', 'Backspace', 'Delete', 'Tab'].includes(key)) {
            parts.push(key)
          } else if (key.startsWith('F') && key.length <= 3) {
            parts.push(key)
          }
        }

        setRecordHotkey(parts.join('+'))
        setIsRecordingHotkey(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRecordingHotkey])

  // Format hotkey for display
  const formatHotkeyDisplay = (hotkey: string): string => {
    return hotkey
      .replace('Control', isMac ? '⌃' : 'Ctrl')
      .replace('Meta', isMac ? '⌘' : 'Win')
      .replace('Alt', isMac ? '⌥' : 'Alt')
      .replace('Shift', isMac ? '⇧' : 'Shift')
      .replace(/\+/g, ' + ')
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
        // Dispatch event to notify other components (like sidebar) that settings changed
        window.dispatchEvent(new CustomEvent('settings-updated'))

        // Notify Electron main process to update the hotkey
        console.log('[Settings] window.voiceFlow:', window.voiceFlow)
        if (window.voiceFlow?.updateHotkey) {
          console.log('[Settings] Calling updateHotkey IPC...')
          const ipcResult = await window.voiceFlow.updateHotkey(recordHotkey)
          console.log('[Settings] IPC result:', ipcResult)
          if (ipcResult.ok) {
            setAlert({ title: 'Settings Saved', message: `Hotkey updated to ${formatHotkeyDisplay(recordHotkey)}` })
          } else {
            setAlert({ title: 'Warning', message: `Settings saved but hotkey registration failed: ${ipcResult.error}` })
          }
        } else {
          console.log('[Settings] voiceFlow.updateHotkey not available')
          setAlert({ title: 'Settings Saved', message: 'Your preferences have been saved successfully!' })
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
      description: 'Professional, structured language',
      icon: 'business_center',
      color: 'blue'
    },
    {
      value: 'casual',
      label: 'Casual',
      description: 'Conversational, relaxed tone',
      icon: 'chat_bubble',
      color: 'green'
    },
    {
      value: 'technical',
      label: 'Technical',
      description: 'Technical precision and jargon',
      icon: 'code',
      color: 'purple'
    }
  ]

  const getColorClasses = (color: string, isActive: boolean) => {
    const colors: Record<string, { bg: string; icon: string; activeBg: string; ring: string }> = {
      blue: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        icon: 'text-blue-600 dark:text-blue-400',
        activeBg: 'bg-blue-50 dark:bg-blue-900/20',
        ring: 'ring-blue-500/30'
      },
      green: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        icon: 'text-green-600 dark:text-green-400',
        activeBg: 'bg-green-50 dark:bg-green-900/20',
        ring: 'ring-green-500/30'
      },
      purple: {
        bg: 'bg-purple-100 dark:bg-purple-900/30',
        icon: 'text-purple-600 dark:text-purple-400',
        activeBg: 'bg-purple-50 dark:bg-purple-900/20',
        ring: 'ring-purple-500/30'
      },
      orange: {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        icon: 'text-orange-600 dark:text-orange-400',
        activeBg: 'bg-orange-50 dark:bg-orange-900/20',
        ring: 'ring-orange-500/30'
      },
      pink: {
        bg: 'bg-pink-100 dark:bg-pink-900/30',
        icon: 'text-pink-600 dark:text-pink-400',
        activeBg: 'bg-pink-50 dark:bg-pink-900/20',
        ring: 'ring-pink-500/30'
      }
    }
    return colors[color] || colors.blue
  }

  return (
    <div className="min-h-screen flex flex-col animate-fade-in-up bg-background-light">
      {/* Fixed Header with Save Button */}
      <div className="sticky top-0 z-10 bg-background-light/95 backdrop-blur-sm border-b border-border-light px-8 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-main">Settings</h1>
            <p className="text-text-muted text-sm">Customize your Stop Typing experience</p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-xl shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">save</span>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto space-y-5">

        {/* Recording Hotkey Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-primary-dark">keyboard</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">Recording Hotkey</h3>
              <p className="text-text-muted text-sm">
                Hold this shortcut anywhere to start recording
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              onClick={() => setIsRecordingHotkey(true)}
              className={clsx(
                'flex-1 p-4 rounded-xl border cursor-pointer transition-all text-center',
                isRecordingHotkey
                  ? 'bg-primary/20 border-primary ring-2 ring-primary/50'
                  : 'bg-surface-hover border-border-light hover:border-primary/50'
              )}
            >
              {isRecordingHotkey ? (
                <span className="text-primary-dark font-medium">Press your shortcut...</span>
              ) : (
                <span className="text-text-main font-mono text-xl font-bold">{formatHotkeyDisplay(recordHotkey)}</span>
              )}
            </div>
            <button
              onClick={() => {
                setRecordHotkey(isMac ? 'Meta+Alt' : 'Control+Alt')
                setIsRecordingHotkey(false)
              }}
              className="px-4 py-3 text-text-muted hover:text-text-main border border-border-light hover:border-text-muted rounded-xl transition-all hover:bg-surface-hover"
            >
              Reset
            </button>
          </div>
          <p className="text-xs text-text-muted mt-3">
            Click the box and hold 2+ modifier keys (Ctrl, Alt, Shift, {isMac ? 'Cmd' : 'Win'})
          </p>
        </div>

        {/* Microphone Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-pink-600 dark:text-pink-400">mic</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">Microphone</h3>
              <p className="text-text-muted text-sm">
                Select which microphone to use for recording
              </p>
            </div>
          </div>

          <div className="relative">
            <select
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              className="w-full px-4 py-3 pr-10 rounded-xl border border-border-light bg-surface-hover text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary cursor-pointer appearance-none"
            >
              <option value="default">System Default</option>
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              expand_more
            </span>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-orange-600 dark:text-orange-400">palette</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">Appearance</h3>
              <p className="text-text-muted text-sm">
                Choose your preferred color theme
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light', label: 'Light', icon: 'light_mode', color: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400' },
              { value: 'dark', label: 'Dark', icon: 'dark_mode', color: 'bg-slate-200 dark:bg-slate-700', iconColor: 'text-slate-700 dark:text-slate-300' },
              { value: 'system', label: 'System', icon: 'settings_suggest', color: 'bg-cyan-100 dark:bg-cyan-900/30', iconColor: 'text-cyan-600 dark:text-cyan-400' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value as 'light' | 'dark' | 'system')}
                className={clsx(
                  'p-4 rounded-xl border transition-all flex flex-col items-center gap-2',
                  theme === option.value
                    ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
                    : 'border-border-light hover:bg-surface-hover hover:border-primary/30'
                )}
              >
                <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', option.color)}>
                  <span className={clsx('material-symbols-outlined text-xl', option.iconColor)}>
                    {option.icon}
                  </span>
                </div>
                <span className={clsx(
                  'text-sm font-medium',
                  theme === option.value ? 'text-primary-content' : 'text-text-main'
                )}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Language Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-blue-600 dark:text-blue-400">translate</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">Language</h3>
              <p className="text-text-muted text-sm">
                Select the language for speech recognition
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {SUPPORTED_LANGUAGES.slice(0, 6).map((lang) => (
              <button
                key={lang.code}
                onClick={() => lang.supported && setLanguage(lang.code)}
                disabled={!lang.supported}
                className={clsx(
                  'p-3 rounded-xl border transition-all flex items-center gap-3 text-left',
                  language === lang.code
                    ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
                    : lang.supported
                      ? 'border-border-light hover:bg-surface-hover hover:border-primary/30'
                      : 'border-border-light opacity-50 cursor-not-allowed'
                )}
              >
                <span className="text-2xl">{lang.flag}</span>
                <div>
                  <p className={clsx(
                    'font-medium text-sm',
                    language === lang.code ? 'text-primary-content' : 'text-text-main'
                  )}>
                    {lang.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {lang.supported ? lang.nativeName : 'Coming soon'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Tone Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-green-600 dark:text-green-400">edit_note</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">Transcription Tone</h3>
              <p className="text-text-muted text-sm">
                Choose how your transcriptions are polished
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {toneOptions.map((option) => {
              const colorClasses = getColorClasses(option.color, tone === option.value)
              return (
                <button
                  key={option.value}
                  onClick={() => setTone(option.value as typeof tone)}
                  className={clsx(
                    'w-full flex items-center gap-4 p-4 rounded-xl transition-all border text-left',
                    tone === option.value
                      ? `${colorClasses.activeBg} border-${option.color}-500/50 ring-2 ${colorClasses.ring}`
                      : 'border-border-light hover:bg-surface-hover hover:border-primary/30'
                  )}
                >
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', colorClasses.bg)}>
                    <span className={clsx('material-symbols-outlined text-xl', colorClasses.icon)}>{option.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-text-main">{option.label}</p>
                    <p className="text-sm text-text-muted">{option.description}</p>
                  </div>
                  <div
                    className={clsx(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                      tone === option.value
                        ? 'bg-primary border-primary'
                        : 'border-border-light'
                    )}
                  >
                    {tone === option.value && (
                      <div className="w-2 h-2 rounded-full bg-primary-content" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* About Section */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-purple-600 dark:text-purple-400">info</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">About Stop Typing</h3>
              <p className="text-text-muted text-sm">
                Version 1.0.0
              </p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-text-muted">
            <p>
              Stop Typing uses NVIDIA's Parakeet TDT 0.6B model for local speech-to-text transcription.
              Your audio never leaves your device.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <a href="#" className="text-primary-dark hover:text-primary font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-base">description</span>
                Documentation
              </a>
              <a href="#" className="text-primary-dark hover:text-primary font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-base">bug_report</span>
                Report Issue
              </a>
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
