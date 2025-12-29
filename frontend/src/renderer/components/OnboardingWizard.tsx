import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../i18n/languages'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface OnboardingWizardProps {
  onComplete: () => void
}

type Step = 'welcome' | 'microphone' | 'language' | 'hotkey' | 'complete'

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome')
  const [microphones, setMicrophones] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('default')
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE)
  const [hotkey, setHotkey] = useState<string>('CommandOrControl+Shift+Space')
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [micPermissionGranted, setMicPermissionGranted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const steps: Step[] = ['welcome', 'microphone', 'language', 'hotkey', 'complete']
  const currentIndex = steps.indexOf(currentStep)

  // Fetch microphones when on that step
  useEffect(() => {
    if (currentStep === 'microphone') {
      requestMicPermission()
    }
  }, [currentStep])

  const requestMicPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicPermissionGranted(true)

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
    }
  }

  // Hotkey recording
  useEffect(() => {
    if (!isRecordingHotkey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      const key = e.key
      if (key.length === 1) {
        parts.push(key.toUpperCase())
      } else if (['Enter', 'Space', 'Backspace', 'Delete', 'Tab'].includes(key)) {
        parts.push(key)
      } else if (key.startsWith('F') && key.length <= 3) {
        parts.push(key)
      }

      if (parts.length >= 2) {
        setHotkey(parts.join('+'))
        setIsRecordingHotkey(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRecordingHotkey])

  const formatHotkey = (hk: string) => {
    return hk.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl')
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

  const handleComplete = async () => {
    setIsLoading(true)
    try {
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center space-y-8">
            {/* Animated Logo/Icon */}
            <div className="relative w-28 h-28 mx-auto">
              <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative w-28 h-28 bg-primary rounded-full flex items-center justify-center shadow-glow">
                <span className="material-symbols-outlined text-5xl text-primary-content">mic</span>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-bold text-text-main">Voice-Flow</h1>
              <p className="text-text-muted text-xl max-w-md mx-auto">
                Your voice, everywhere you type.
              </p>
            </div>

            <p className="text-text-body max-w-sm mx-auto">
              Transform speech to text instantly in any app. Just hold a hotkey and speak.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-light border border-border-light rounded-full">
                <span className="material-symbols-outlined text-lg text-primary-content">bolt</span>
                <span className="text-text-main text-sm font-medium">Instant</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-light border border-border-light rounded-full">
                <span className="material-symbols-outlined text-lg text-primary-content">computer</span>
                <span className="text-text-main text-sm font-medium">Local AI</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-light border border-border-light rounded-full">
                <span className="material-symbols-outlined text-lg text-primary-content">lock</span>
                <span className="text-text-main text-sm font-medium">Private</span>
              </div>
            </div>
          </div>
        )

      case 'microphone':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-primary-content">settings_voice</span>
              </div>
              <h2 className="text-2xl font-bold text-text-main">Microphone Setup</h2>
              <p className="text-text-muted mt-2">
                Grant microphone access and select your preferred device
              </p>
            </div>

            {!micPermissionGranted ? (
              <div className="bg-surface-hover rounded-xl p-6 text-center">
                <span className="material-symbols-outlined text-4xl text-text-muted mb-3">mic_off</span>
                <p className="text-text-main font-medium mb-4">Microphone access required</p>
                <button
                  onClick={requestMicPermission}
                  className="px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-full transition-all"
                >
                  Grant Permission
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                  <span className="material-symbols-outlined">check_circle</span>
                  <span>Microphone access granted</span>
                </div>
                <select
                  value={selectedMic}
                  onChange={(e) => setSelectedMic(e.target.value)}
                  className="w-full p-4 rounded-xl border border-border-light bg-surface-hover text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="default">System Default</option>
                  {microphones.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )

      case 'language':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-primary-content">translate</span>
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
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-primary-content">keyboard</span>
              </div>
              <h2 className="text-2xl font-bold text-text-main">Global Hotkey</h2>
              <p className="text-text-muted mt-2">
                Set a keyboard shortcut to start recording from anywhere
              </p>
            </div>

            <div
              onClick={() => setIsRecordingHotkey(true)}
              className={clsx(
                'p-6 rounded-xl border cursor-pointer transition-all text-center',
                isRecordingHotkey
                  ? 'bg-primary/20 border-primary ring-2 ring-primary/50 animate-pulse'
                  : 'bg-surface-hover border-border-light hover:border-text-muted'
              )}
            >
              {isRecordingHotkey ? (
                <span className="text-primary-content font-medium text-lg">Press your shortcut...</span>
              ) : (
                <span className="text-text-main font-mono text-2xl font-bold">{formatHotkey(hotkey)}</span>
              )}
            </div>

            <p className="text-sm text-text-muted text-center">
              Click the box above and press your desired key combination
            </p>

            <div className="flex flex-wrap justify-center gap-2">
              {['CommandOrControl+Shift+Space', 'CommandOrControl+Shift+M', 'Alt+Shift+R'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setHotkey(preset)}
                  className={clsx(
                    'px-3 py-1.5 text-sm rounded-lg border transition-all',
                    hotkey === preset
                      ? 'bg-primary/20 border-primary text-primary-content'
                      : 'border-border-light text-text-muted hover:bg-surface-hover'
                  )}
                >
                  {formatHotkey(preset)}
                </button>
              ))}
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="text-center space-y-8">
            {/* Success animation */}
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" style={{ animationDuration: '1.5s', animationIterationCount: '2' }} />
              <div className="relative w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                <span className="material-symbols-outlined text-5xl text-white">check</span>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-text-main">You're All Set!</h2>
              <p className="text-text-muted text-lg max-w-md mx-auto">
                Voice-Flow is ready to use.
              </p>
            </div>

            {/* Hotkey reminder card */}
            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6 max-w-sm mx-auto">
              <p className="text-sm text-text-muted mb-2">Press this anywhere to record:</p>
              <p className="text-2xl font-mono font-bold text-primary-content">{formatHotkey(hotkey)}</p>
            </div>

            {/* Settings summary */}
            <div className="bg-surface-light border border-border-light rounded-xl p-5 max-w-sm mx-auto">
              <div className="flex items-center justify-between py-2 border-b border-border-light">
                <div className="flex items-center gap-2 text-text-muted">
                  <span className="material-symbols-outlined text-lg">mic</span>
                  <span className="text-sm">Microphone</span>
                </div>
                <span className="text-text-main text-sm font-medium">{selectedMic === 'default' ? 'System Default' : 'Custom'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-text-muted">
                  <span className="material-symbols-outlined text-lg">translate</span>
                  <span className="text-sm">Language</span>
                </div>
                <span className="text-text-main text-sm font-medium">{SUPPORTED_LANGUAGES.find(l => l.code === language)?.name || 'English'}</span>
              </div>
            </div>
          </div>
        )
    }
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
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg animate-fade-in-up">
          {renderStepContent()}
        </div>
      </div>

      {/* Navigation - Different layout for welcome vs other steps */}
      {currentStep === 'welcome' ? (
        // Welcome: Centered "Get Started" button
        <div className="p-8 flex justify-center">
          <button
            onClick={handleNext}
            className="px-10 py-4 bg-primary hover:bg-primary-hover text-primary-content font-bold text-lg rounded-full shadow-glow hover:shadow-glow-hover transition-all flex items-center gap-3"
          >
            Get Started
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      ) : currentStep === 'complete' ? (
        // Complete: Centered "Start Using Voice-Flow" button
        <div className="p-8 flex justify-center">
          <button
            onClick={handleComplete}
            disabled={isLoading}
            className="px-10 py-4 bg-primary hover:bg-primary-hover text-primary-content font-bold text-lg rounded-full shadow-glow hover:shadow-glow-hover transition-all disabled:opacity-50 flex items-center gap-3"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-primary-content border-t-transparent rounded-full animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                Start Using Voice-Flow
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      ) : (
        // Other steps: Back on left, Continue on right
        <div className="p-8 flex justify-between items-center max-w-lg mx-auto w-full">
          <button
            onClick={handleBack}
            className="px-6 py-3 text-text-muted hover:text-text-main border border-border-light hover:border-text-muted rounded-full transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={currentStep === 'microphone' && !micPermissionGranted}
            className="px-8 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-full shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Continue
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  )
}
