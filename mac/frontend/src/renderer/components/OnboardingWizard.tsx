import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../i18n/languages'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface OnboardingWizardProps {
  onComplete: () => void
}

type Step = 'welcome' | 'profile' | 'microphone' | 'language' | 'hotkey' | 'complete'

interface UserProfile {
  name: string
  email: string
  avatar: string
}

// Detect platform
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome')
  const [microphones, setMicrophones] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('default')
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE)
  // Default hotkey: Ctrl+Alt on Windows, Cmd+Option on Mac
  const [hotkey, setHotkey] = useState<string>(isMac ? 'Meta+Alt' : 'Control+Alt')
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [micPermissionGranted, setMicPermissionGranted] = useState(false)
  const [micPermissionDenied, setMicPermissionDenied] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    email: '',
    avatar: 'default'
  })
  const [emailError, setEmailError] = useState<string>('')

  const steps: Step[] = ['welcome', 'profile', 'microphone', 'language', 'hotkey', 'complete']
  const currentIndex = steps.indexOf(currentStep)

  // Request microphone permission when on that step
  useEffect(() => {
    if (currentStep === 'microphone' && !micPermissionGranted && !micPermissionDenied) {
      requestMicPermission()
    }
  }, [currentStep])

  const requestMicPermission = async () => {
    // Check if running in Electron (main process handles mic via FFmpeg, not browser API)
    const isElectron = !!(window as any).voiceFlow || !!(window as any).electron

    if (isElectron) {
      // In Electron, skip browser getUserMedia - main process handles audio via FFmpeg
      // System permission is already requested by main process via systemPreferences.askForMediaAccess
      console.log('Running in Electron - skipping browser getUserMedia, using FFmpeg for audio')
      setMicPermissionGranted(true)
      setMicPermissionDenied(false)

      // Try to enumerate devices (may fail on file:// but that's OK)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices
          .filter(device => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`
          }))
        if (audioInputs.length > 0) {
          setMicrophones(audioInputs)
        }
      } catch (e) {
        console.log('Could not enumerate devices (expected on file:// protocol)')
      }
      return
    }

    // Browser mode - use standard getUserMedia
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop())

      setMicPermissionGranted(true)
      setMicPermissionDenied(false)

      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`
        }))
      setMicrophones(audioInputs)
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setMicPermissionGranted(false)
      setMicPermissionDenied(true)
    }
  }

  // Hotkey recording - allow modifier-only combinations
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
        // Check if it's just modifiers (no other key pressed)
        const isModifierKey = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)

        if (!isModifierKey) {
          // A regular key was pressed along with modifiers
          const key = e.key
          if (key.length === 1) {
            parts.push(key.toUpperCase())
          } else if (['Enter', 'Space', 'Backspace', 'Delete', 'Tab'].includes(key)) {
            parts.push(key)
          } else if (key.startsWith('F') && key.length <= 3) {
            parts.push(key)
          }
        }

        setHotkey(parts.join('+'))
        setIsRecordingHotkey(false)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // On key up, if we have at least 2 modifiers, accept that combo
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Control')
      if (e.metaKey) parts.push('Meta')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      // If user releases a modifier and we still have 2+, keep recording
      // If they release and have less than 2, and they had pressed some, save what they had
      if (isRecordingHotkey && hotkey.split('+').length >= 2) {
        // Already set a valid hotkey
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isRecordingHotkey, hotkey])

  const formatHotkey = (hk: string) => {
    return hk
      .replace('Control', isMac ? '⌃' : 'Ctrl')
      .replace('Meta', isMac ? '⌘' : 'Win')
      .replace('Alt', isMac ? '⌥' : 'Alt')
      .replace('Shift', isMac ? '⇧' : 'Shift')
      .replace(/\+/g, ' + ')
  }

  const handleNext = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex])
    }
  }

  const handleBack = () => {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex])
    }
  }

  const getInitials = (name: string) => {
    if (!name) return 'U'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name[0].toUpperCase()
  }

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      // Save user profile to localStorage
      localStorage.setItem('st-user-profile', JSON.stringify(profile))

      // Save settings
      await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tone: 'formal',
          personal_dictionary: {},
          record_hotkey: hotkey,
          language
        })
      })

      // Update hotkey in Electron
      if (window.voiceFlow?.updateHotkey) {
        await window.voiceFlow.updateHotkey(hotkey)
      }

      // Mark onboarding as complete
      localStorage.setItem('vf-onboarding-complete', 'true')
      onComplete()
    } catch (error) {
      console.error('Error saving onboarding settings:', error)
      onComplete() // Still complete even on error
    } finally {
      setIsLoading(false)
    }
  }

  const avatarOptions = [
    { id: 'default', colors: ['from-primary', 'to-primary-dark'] },
    { id: 'blue', colors: ['from-blue-400', 'to-blue-600'] },
    { id: 'purple', colors: ['from-purple-400', 'to-purple-600'] },
    { id: 'green', colors: ['from-green-400', 'to-green-600'] },
    { id: 'orange', colors: ['from-orange-400', 'to-orange-600'] },
    { id: 'pink', colors: ['from-pink-400', 'to-pink-600'] },
  ]

  const renderStepContent = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center space-y-6">
            {/* Animated Logo/Icon */}
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 bg-primary/30 rounded-2xl animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative w-24 h-24 bg-primary rounded-2xl flex items-center justify-center shadow-glow">
                <span className="material-symbols-outlined text-5xl text-primary-content icon-filled">graphic_eq</span>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-text-main">Stop Typing</h1>
              <p className="text-text-muted text-lg">
                Your voice, everywhere you type.
              </p>
            </div>

            {/* How it works section */}
            <div className="bg-surface-light border border-border-light rounded-xl p-6 text-left space-y-4">
              <h3 className="font-semibold text-text-main text-center">How it works</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-content font-bold text-sm">1</span>
                  </div>
                  <div>
                    <p className="text-text-main font-medium">Press & Hold Hotkey</p>
                    <p className="text-text-muted text-sm">Hold {isMac ? 'Cmd+Option' : 'Ctrl+Alt'} anywhere on your computer</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-content font-bold text-sm">2</span>
                  </div>
                  <div>
                    <p className="text-text-main font-medium">Speak Naturally</p>
                    <p className="text-text-muted text-sm">Talk as you normally would - we'll capture every word</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-content font-bold text-sm">3</span>
                  </div>
                  <div>
                    <p className="text-text-main font-medium">Text Appears Instantly</p>
                    <p className="text-text-muted text-sm">Your speech is converted to polished text in real-time</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light border border-border-light rounded-full">
                <span className="material-symbols-outlined text-base text-primary-dark">bolt</span>
                <span className="text-text-main text-xs font-medium">3x Faster</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light border border-border-light rounded-full">
                <span className="material-symbols-outlined text-base text-primary-dark">computer</span>
                <span className="text-text-main text-xs font-medium">Local AI</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-light border border-border-light rounded-full">
                <span className="material-symbols-outlined text-base text-primary-dark">lock</span>
                <span className="text-text-main text-xs font-medium">100% Private</span>
              </div>
            </div>
          </div>
        )

      case 'profile':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-primary-dark">person</span>
              </div>
              <h2 className="text-2xl font-bold text-text-main">Create Your Profile</h2>
              <p className="text-text-muted mt-2">
                Let's personalize your experience
              </p>
            </div>

            {/* Avatar Selection */}
            <div className="flex justify-center">
              <div className={clsx(
                'w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white bg-gradient-to-br',
                avatarOptions.find(a => a.id === (profile.avatar || 'default'))?.colors.join(' ')
              )}>
                {getInitials(profile.name)}
              </div>
            </div>

            {/* Avatar color options */}
            <div className="flex justify-center gap-2">
              {avatarOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setProfile({ ...profile, avatar: option.id })}
                  className={clsx(
                    'w-8 h-8 rounded-full bg-gradient-to-br transition-all',
                    option.colors.join(' '),
                    (profile.avatar || 'default') === option.id
                      ? 'ring-2 ring-offset-2 ring-primary scale-110'
                      : 'hover:scale-105'
                  )}
                />
              ))}
            </div>

            {/* Name Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Enter your name"
                className="w-full px-4 py-3 rounded-xl border border-border-light bg-surface-light text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                autoFocus
              />
            </div>

            {/* Email Input (Required) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-main">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => {
                  setProfile({ ...profile, email: e.target.value })
                  if (emailError && validateEmail(e.target.value)) {
                    setEmailError('')
                  }
                }}
                onBlur={() => {
                  if (profile.email && !validateEmail(profile.email)) {
                    setEmailError('Please enter a valid email address')
                  }
                }}
                placeholder="your@email.com"
                className={clsx(
                  'w-full px-4 py-3 rounded-xl border bg-surface-light text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50',
                  emailError ? 'border-red-400 focus:border-red-400' : 'border-border-light focus:border-primary'
                )}
              />
              {emailError ? (
                <p className="text-xs text-red-500">{emailError}</p>
              ) : (
                <p className="text-xs text-text-muted">
                  We'll send you tips and important updates
                </p>
              )}
            </div>
          </div>
        )

      case 'microphone':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-primary-dark">mic</span>
              </div>
              <h2 className="text-2xl font-bold text-text-main">Microphone Access</h2>
              <p className="text-text-muted mt-2">
                We need microphone access to transcribe your voice
              </p>
            </div>

            {micPermissionDenied ? (
              <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-red-500">error</span>
                    <span className="text-red-700 dark:text-red-400 font-medium">Permission Denied</span>
                  </div>
                  <p className="text-red-600 dark:text-red-300 text-sm">
                    Please allow microphone access in your browser/system settings, then click the button below.
                  </p>
                </div>
                <button
                  onClick={requestMicPermission}
                  className="w-full px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">refresh</span>
                  Try Again
                </button>
              </div>
            ) : !micPermissionGranted ? (
              <div className="bg-surface-light border border-border-light rounded-xl p-8 text-center">
                <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4 animate-pulse">
                  <span className="material-symbols-outlined text-3xl text-primary-dark">mic</span>
                </div>
                <p className="text-text-main font-medium mb-2">Requesting permission...</p>
                <p className="text-text-muted text-sm mb-4">Please allow microphone access when prompted</p>
                <button
                  onClick={requestMicPermission}
                  className="px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-xl transition-all"
                >
                  Grant Permission
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-xl">
                  <span className="material-symbols-outlined text-green-600 dark:text-green-400">check_circle</span>
                  <span className="text-green-700 dark:text-green-300 font-medium">Microphone access granted</span>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-main">
                    Select Microphone
                  </label>
                  <div className="relative">
                    <select
                      value={selectedMic}
                      onChange={(e) => setSelectedMic(e.target.value)}
                      className="w-full px-4 py-3 pr-10 rounded-xl border border-border-light bg-surface-light text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary appearance-none cursor-pointer"
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

                {/* Microphone test hint */}
                <div className="bg-surface-hover rounded-xl p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary-dark">tips_and_updates</span>
                  <p className="text-text-muted text-sm">
                    For best results, use a headset or external microphone in a quiet environment.
                  </p>
                </div>
              </div>
            )}
          </div>
        )

      case 'language':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-primary-dark">translate</span>
              </div>
              <h2 className="text-2xl font-bold text-text-main">Language</h2>
              <p className="text-text-muted mt-2">
                Select your preferred language for transcription
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SUPPORTED_LANGUAGES.slice(0, 6).map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => lang.supported && setLanguage(lang.code)}
                  disabled={!lang.supported}
                  className={clsx(
                    'p-4 rounded-xl border transition-all flex items-center gap-3',
                    language === lang.code
                      ? 'bg-primary/20 border-primary ring-2 ring-primary/30'
                      : lang.supported
                        ? 'border-border-light hover:bg-surface-hover'
                        : 'border-border-light opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <div className="text-left">
                    <p className={clsx(
                      'font-medium',
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

            <p className="text-xs text-text-muted text-center">
              More languages will be available in future updates
            </p>
          </div>
        )

      case 'hotkey':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-primary-dark">keyboard</span>
              </div>
              <h2 className="text-2xl font-bold text-text-main">Global Hotkey</h2>
              <p className="text-text-muted mt-2">
                Hold this shortcut anywhere to start recording
              </p>
            </div>

            <div
              onClick={() => setIsRecordingHotkey(true)}
              className={clsx(
                'p-6 rounded-xl border cursor-pointer transition-all text-center',
                isRecordingHotkey
                  ? 'bg-primary/20 border-primary ring-2 ring-primary/50'
                  : 'bg-surface-light border-border-light hover:border-primary/50'
              )}
            >
              {isRecordingHotkey ? (
                <div className="space-y-2">
                  <span className="text-primary-dark font-medium text-lg">Press your shortcut...</span>
                  <p className="text-text-muted text-sm">Hold 2+ modifier keys (Ctrl, Alt, Shift, {isMac ? 'Cmd' : 'Win'})</p>
                </div>
              ) : (
                <span className="text-text-main font-mono text-2xl font-bold">{formatHotkey(hotkey)}</span>
              )}
            </div>

            <p className="text-sm text-text-muted text-center">
              Click the box above and hold your desired key combination
            </p>

            {/* Preset options */}
            <div className="space-y-2">
              <p className="text-xs text-text-muted text-center">Quick presets:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  isMac ? 'Meta+Alt' : 'Control+Alt',
                  isMac ? 'Meta+Shift' : 'Control+Shift',
                  'Alt+Shift',
                ].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setHotkey(preset)}
                    className={clsx(
                      'px-4 py-2 text-sm rounded-lg border transition-all',
                      hotkey === preset
                        ? 'bg-primary/20 border-primary text-primary-content font-medium'
                        : 'border-border-light text-text-muted hover:bg-surface-hover'
                    )}
                  >
                    {formatHotkey(preset)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="text-center space-y-6">
            {/* Success animation */}
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" style={{ animationDuration: '1.5s', animationIterationCount: '2' }} />
              <div className="relative w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                <span className="material-symbols-outlined text-4xl text-white">check</span>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-text-main">Welcome, {profile.name.split(' ')[0]}!</h2>
              <p className="text-text-muted">
                You're all set. Start dictating anywhere!
              </p>
            </div>

            {/* Hotkey reminder card */}
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-5 max-w-xs mx-auto">
              <p className="text-sm text-text-muted mb-2">Hold this anywhere to record:</p>
              <p className="text-2xl font-mono font-bold text-primary-content">{formatHotkey(hotkey)}</p>
            </div>

            {/* Settings summary */}
            <div className="bg-surface-light border border-border-light rounded-xl p-4 max-w-xs mx-auto text-sm">
              <div className="flex items-center justify-between py-2 border-b border-border-light">
                <span className="text-text-muted">Microphone</span>
                <span className="text-text-main font-medium">{selectedMic === 'default' ? 'Default' : 'Custom'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-text-muted">Language</span>
                <span className="text-text-main font-medium">{SUPPORTED_LANGUAGES.find(l => l.code === language)?.name || 'English'}</span>
              </div>
            </div>
          </div>
        )
    }
  }

  const canProceed = () => {
    if (currentStep === 'profile') {
      return profile.name.trim().length >= 2 && profile.email.trim().length > 0 && validateEmail(profile.email)
    }
    if (currentStep === 'microphone') {
      return micPermissionGranted
    }
    return true
  }

  return (
    <div className="fixed inset-0 bg-background-light z-50 flex flex-col">
      {/* Progress bar - only show after welcome */}
      {currentStep !== 'welcome' && (
        <div className="h-1 bg-surface-hover">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${((currentIndex) / (steps.length - 1)) * 100}%` }}
          />
        </div>
      )}

      {/* Step indicators - only show after welcome */}
      {currentStep !== 'welcome' && (
        <div className="flex justify-center gap-2 pt-6">
          {steps.slice(1).map((step, index) => (
            <div
              key={step}
              className={clsx(
                'w-2 h-2 rounded-full transition-all',
                index < currentIndex ? 'bg-primary' : 'bg-border-light'
              )}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md animate-fade-in-up">
          {renderStepContent()}
        </div>
      </div>

      {/* Navigation */}
      {currentStep === 'welcome' ? (
        <div className="p-6 flex justify-center">
          <button
            onClick={handleNext}
            className="px-8 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold text-base rounded-xl shadow-glow hover:shadow-glow-hover transition-all flex items-center gap-2"
          >
            Get Started
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      ) : currentStep === 'complete' ? (
        <div className="p-6 flex justify-center">
          <button
            onClick={handleComplete}
            disabled={isLoading}
            className="px-8 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold text-base rounded-xl shadow-glow hover:shadow-glow-hover transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-primary-content border-t-transparent rounded-full animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                Start Using Stop Typing
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="p-6 flex justify-between items-center max-w-md mx-auto w-full">
          <button
            onClick={handleBack}
            className="px-5 py-2.5 text-text-muted hover:text-text-main border border-border-light hover:border-text-muted rounded-xl transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-xl shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Continue
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  )
}
