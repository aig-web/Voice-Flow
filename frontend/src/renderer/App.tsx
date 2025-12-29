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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'dictionary' | 'snippets' | 'settings'>('dashboard')
  const [currentHotkey, setCurrentHotkey] = useState('Ctrl+Alt')
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Check if onboarding should be shown
  useEffect(() => {
    const onboardingComplete = localStorage.getItem('vf-onboarding-complete')
    if (!onboardingComplete) {
      setShowOnboarding(true)
    }
  }, [])

  // Fetch current hotkey from settings
  useEffect(() => {
    const fetchHotkey = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/settings`)
        const data = await response.json()
        if (data.record_hotkey) {
          // Format for display
          const formatted = data.record_hotkey
            .replace('CommandOrControl', 'Ctrl')
            .replace('Control', 'Ctrl')
            .replace('Meta', 'Cmd')
          setCurrentHotkey(formatted)
        }
      } catch (error) {
        console.error('Error fetching hotkey:', error)
      }
    }
    fetchHotkey()
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
      <aside className="w-72 h-screen bg-background-light border-r border-border-light flex flex-col fixed left-0 top-0 bottom-0 z-40">
        {/* Logo */}
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-content shadow-sm ring-1 ring-black/5">
              <span className="material-symbols-outlined icon-filled">graphic_eq</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-main leading-tight tracking-tight">Voice-Flow</h1>
              <p className="text-text-muted text-xs font-medium">Pro Workspace</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-200 text-left group',
                activeTab === item.id
                  ? 'bg-primary/20 text-text-main shadow-sm ring-1 ring-primary/50'
                  : 'text-text-muted hover:bg-surface-light hover:text-text-main'
              )}
            >
              <span className={clsx(
                'material-symbols-outlined text-2xl',
                activeTab === item.id ? 'icon-filled text-primary-content' : 'group-hover:scale-105'
              )}>{item.icon}</span>
              <span className={clsx('text-sm', activeTab === item.id ? 'font-bold' : 'font-medium')}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Settings at bottom */}
        <div className="p-4 space-y-2">
          <button
            onClick={() => setActiveTab('settings')}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-200 text-left group',
              activeTab === 'settings'
                ? 'bg-primary/20 text-text-main shadow-sm ring-1 ring-primary/50'
                : 'text-text-muted hover:bg-surface-light hover:text-text-main'
            )}
          >
            <span className={clsx(
              'material-symbols-outlined text-2xl',
              activeTab === 'settings' ? 'icon-filled text-primary-content' : 'group-hover:scale-105'
            )}>settings</span>
            <span className={clsx('text-sm', activeTab === 'settings' ? 'font-bold' : 'font-medium')}>Settings</span>
          </button>

          {/* New Dictation Button */}
          <button
            onClick={() => {
              // Show info toast that user should use hotkey
              const toast = document.createElement('div')
              toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-surface-light border border-border-light px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in text-sm'
              toast.innerHTML = `<span class="text-text-main">Hold <span class="font-mono font-bold text-primary-content bg-primary/30 px-1.5 py-0.5 rounded">${currentHotkey}</span> to record</span>`
              document.body.appendChild(toast)
              setTimeout(() => toast.remove(), 3000)
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-primary hover:bg-primary-hover text-primary-content font-bold text-sm shadow-sm hover:shadow-glow transition-all"
          >
            <span className="material-symbols-outlined text-xl">add</span>
            <span>New Dictation</span>
          </button>
        </div>

        {/* User Profile & Hotkey */}
        <div className="p-4 border-t border-border-light">
          <div className="flex items-center gap-3 px-2 py-2 rounded-full hover:bg-surface-light cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center text-xs font-bold text-text-main border border-border-light">
              U
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-text-main">User</span>
              <span className="text-xs text-text-muted">Pro Plan</span>
            </div>
            <span className="material-symbols-outlined text-text-muted text-sm">expand_more</span>
          </div>

          <div className="mt-3 px-3 py-2 bg-surface-light rounded-lg">
            <p className="text-xs text-text-muted">
              Press <span className="font-mono font-bold text-primary-content bg-primary/30 px-1.5 py-0.5 rounded">{currentHotkey}</span> to record
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-72 min-h-screen bg-background-light">
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
