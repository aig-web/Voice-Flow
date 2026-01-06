import React, { useState, useEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import { History } from './components/History'
import { Settings } from './components/Settings'
import { Dictionary } from './components/Dictionary'
import { Snippets } from './components/Snippets'
import { FloatingBubble } from './components/FloatingBubble'
import { OnboardingWizard } from './components/OnboardingWizard'
import { useBackgroundRecorder } from './hooks/useBackgroundRecorder'
import clsx from 'clsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

interface UserProfile {
  name: string
  email: string
  avatar: string
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'dictionary' | 'snippets' | 'settings'>('dashboard')
  const [currentHotkey, setCurrentHotkey] = useState('Alt + C')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: 'User', email: '', avatar: 'default' })

  // Check if onboarding should be shown and load user profile from backend
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const result = await window.voiceFlow.getSettings()
        if (result.ok && result.data) {
          const settings = result.data

          // Check if onboarding is complete from backend
          if (!settings.onboarding_complete) {
            setShowOnboarding(true)
          }

          // Load user profile from backend settings
          if (settings.user_name && settings.user_email) {
            setUserProfile({
              name: settings.user_name || 'User',
              email: settings.user_email || '',
              avatar: settings.user_avatar || 'default'
            })
          }
        } else {
          // No settings found, show onboarding
          setShowOnboarding(true)
        }
      } catch (error) {
        console.error('Error checking onboarding:', error)
        // On error, show onboarding to be safe
        setShowOnboarding(true)
      }
    }

    checkOnboarding()
  }, [])

  // Detect platform for hotkey display
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0

  // Format hotkey for display
  const formatHotkeyDisplay = (hotkey: string): string => {
    return hotkey
      .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
      .replace('Control', isMac ? '⌃' : 'Ctrl')
      .replace('Meta', isMac ? '⌘' : 'Win')
      .replace('Alt', isMac ? '⌥' : 'Alt')
      .replace('Shift', isMac ? '⇧' : 'Shift')
      .replace(/\+/g, ' + ')
  }

  // Fetch current hotkey from settings
  const fetchHotkey = async () => {
    try {
      const result = await window.voiceFlow.getSettings()
      if (result.ok && result.data?.record_hotkey) {
        setCurrentHotkey(formatHotkeyDisplay(result.data.record_hotkey))
      }
    } catch (error) {
      console.error('Error fetching hotkey:', error)
    }
  }

  // Fetch on tab change and set up refresh listeners
  useEffect(() => {
    fetchHotkey()

    // Listen for settings changes
    const handleSettingsUpdate = () => {
      console.log('[App] Settings updated, refreshing hotkey...')
      fetchHotkey()
    }

    // Listen for transcription saves to refresh profile data
    const handleTranscriptionSaved = () => {
      // Refresh user profile in case it changed
      const savedProfile = localStorage.getItem('st-user-profile')
      if (savedProfile) {
        try {
          const profile = JSON.parse(savedProfile)
          setUserProfile(profile)
        } catch (e) {
          console.error('Error parsing user profile:', e)
        }
      }
    }

    window.addEventListener('settings-updated', handleSettingsUpdate)
    window.addEventListener('transcription-saved', handleTranscriptionSaved)

    return () => {
      window.removeEventListener('settings-updated', handleSettingsUpdate)
      window.removeEventListener('transcription-saved', handleTranscriptionSaved)
    }
  }, [activeTab])

  // Initialize background recorder hook (runs silently, no UI)
  useBackgroundRecorder()

  // Show onboarding wizard for first-time users
  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
  }

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: 'home' },
    { id: 'dictionary', label: 'Dictionary', icon: 'menu_book' },
    { id: 'snippets', label: 'Shortcuts', icon: 'bolt' },
    { id: 'history', label: 'History', icon: 'history' },
  ] as const

  return (
    <div className="min-h-screen bg-background-light flex font-display">
      {/* Floating Bubble - Shows recording status */}
      <FloatingBubble />

      {/* Left Sidebar */}
      <aside className="w-56 h-screen bg-surface-light border-r border-border-light flex flex-col fixed left-0 top-0 bottom-0 z-40">
        {/* Logo */}
        <div className="p-5 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-primary-content text-xl icon-filled">graphic_eq</span>
            </div>
            <span className="text-lg font-bold text-text-main tracking-tight">Stop Typing</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-left group',
                activeTab === item.id
                  ? 'bg-primary/15 text-text-main'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-main'
              )}
            >
              <span className={clsx(
                'material-symbols-outlined text-xl',
                activeTab === item.id ? 'icon-filled' : ''
              )}>{item.icon}</span>
              <span className={clsx('text-sm', activeTab === item.id ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </button>
          ))}

          {/* Divider */}
          <div className="my-3 border-t border-border-light" />

          {/* Settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-left group',
              activeTab === 'settings'
                ? 'bg-primary/15 text-text-main'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-main'
            )}
          >
            <span className={clsx(
              'material-symbols-outlined text-xl',
              activeTab === 'settings' ? 'icon-filled' : ''
            )}>settings</span>
            <span className={clsx('text-sm', activeTab === 'settings' ? 'font-semibold' : 'font-medium')}>Settings</span>
          </button>
        </nav>

        {/* Hotkey Display */}
        <div className="p-3">
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-3">
            <p className="text-xs text-text-muted text-center mb-2">Hold to record</p>
            <div className="flex items-center justify-center gap-2 bg-primary rounded-lg px-4 py-2.5">
              <span className="material-symbols-outlined text-lg text-primary-content">keyboard</span>
              <span className="font-mono font-bold text-primary-content">{currentHotkey}</span>
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div className="p-3 border-t border-border-light">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
            <div className={clsx(
              'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br',
              userProfile.avatar === 'blue' ? 'from-blue-400 to-blue-600' :
              userProfile.avatar === 'purple' ? 'from-purple-400 to-purple-600' :
              userProfile.avatar === 'green' ? 'from-green-400 to-green-600' :
              userProfile.avatar === 'orange' ? 'from-orange-400 to-orange-600' :
              userProfile.avatar === 'pink' ? 'from-pink-400 to-pink-600' :
              'from-primary to-primary-dark'
            )}>
              {userProfile.name ? userProfile.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U'}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-main truncate">{userProfile.name || 'User'}</span>
                <span className="text-[10px] font-bold bg-text-main text-surface-light px-1.5 py-0.5 rounded">PRO</span>
              </div>
              <span className="text-xs text-text-muted truncate">{userProfile.email || 'user@example.com'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-56 h-screen bg-background-light overflow-y-auto">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'history' && <History />}
        {activeTab === 'dictionary' && <Dictionary />}
        {activeTab === 'snippets' && <Snippets />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  )
}

export default App
