import React, { useEffect, useState } from 'react'
import clsx from 'clsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

interface Transcription {
  id: number
  raw_text: string
  polished_text: string
  created_at: string
  duration?: number
}

interface Stats {
  totalTranscriptions: number
  wordsCaptured: number
  timeSavedMinutes: number
}

export function Dashboard() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [stats, setStats] = useState<Stats>({ totalTranscriptions: 0, wordsCaptured: 0, timeSavedMinutes: 0 })
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentHotkey, setCurrentHotkey] = useState('Alt + C')
  const [userName, setUserName] = useState('User')

  // Load user profile from localStorage
  useEffect(() => {
    const savedProfile = localStorage.getItem('st-user-profile')
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile)
        if (profile.name) {
          // Get first name only for greeting
          const firstName = profile.name.split(' ')[0]
          setUserName(firstName)
        }
      } catch (e) {
        console.error('Error parsing user profile:', e)
      }
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchHotkey()

    // Listen for new transcriptions to refresh data (from window event)
    const handleTranscriptionSaved = () => {
      console.log('[Dashboard] New transcription saved, refreshing...')
      fetchData()
    }

    window.addEventListener('transcription-saved', handleTranscriptionSaved)

    // Listen for dashboard refresh from main process (IPC)
    if (window.voiceFlow?.onRefreshDashboard) {
      window.voiceFlow.onRefreshDashboard(() => {
        console.log('[Dashboard] Refresh triggered from main process')
        fetchData()
      })
    }

    return () => {
      window.removeEventListener('transcription-saved', handleTranscriptionSaved)
    }
  }, [])

  const fetchHotkey = async () => {
    try {
      const result = await window.voiceFlow.getSettings()
      if (result.ok && result.data?.record_hotkey) {
        const formatted = result.data.record_hotkey
          .replace('CommandOrControl', 'Ctrl')
          .replace('Control', 'Ctrl')
          .replace('Meta', 'Cmd')
          .replace('+', ' + ')
        setCurrentHotkey(formatted)
      }
    } catch (error) {
      console.error('Error fetching hotkey:', error)
    }
  }

  const fetchData = async () => {
    try {
      setError(null)

      // Fetch history and stats from main process via voiceFlow API
      const [historyResult, statsResult] = await Promise.all([
        window.voiceFlow.getHistory(50),
        window.voiceFlow.getStats()
      ])

      if (historyResult.ok && Array.isArray(historyResult.data)) {
        setTranscriptions(historyResult.data)
      }

      if (statsResult.ok && statsResult.data) {
        setStats({
          totalTranscriptions: statsResult.data.totalTranscriptions || 0,
          wordsCaptured: statsResult.data.wordsCaptured || 0,
          timeSavedMinutes: statsResult.data.timeSavedMinutes || 0
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load transcriptions'
      setError(message)
      console.error('Error fetching transcriptions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (text: string, id: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      setError('Failed to copy to clipboard')
      setTimeout(() => setError(null), 3000)
    }
  }

  const dismissError = () => setError(null)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const getCurrentDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
  }

  const truncateText = (text: string, maxLength: number = 60) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const getActivityIcon = (index: number) => {
    const icons = ['description', 'lightbulb', 'mail']
    const classes = ['document', 'idea', 'email']
    return { icon: icons[index % 3], className: classes[index % 3] }
  }

  const getWordCount = (text: string) => {
    return text.split(/\s+/).filter(w => w.length > 0).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted">Loading dashboard...</span>
        </div>
      </div>
    )
  }

  const recentTranscriptions = transcriptions.slice(0, 3)

  return (
    <div className="h-screen flex flex-col max-w-4xl mx-auto px-6 py-4 animate-fade-in-up overflow-hidden">
      {/* Error Notification */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center justify-between animate-fade-in flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-red-500">error</span>
            <span className="text-red-700 dark:text-red-400 font-medium text-sm">{error}</span>
          </div>
          <button
            onClick={dismissError}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-800/30 rounded-lg transition-colors"
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined text-red-500 text-lg">close</span>
          </button>
        </div>
      )}

      {/* Header with Greeting */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            {getGreeting()}, {userName} <span className="inline-block">👋</span>
          </h1>
          <p className="text-text-muted text-sm">Ready to capture your thoughts today?</p>
        </div>
        <div className="flex items-center gap-2 bg-surface-light border border-border-light rounded-lg px-3 py-1.5">
          <span className="material-symbols-outlined text-text-muted text-lg">calendar_today</span>
          <span className="text-text-main font-medium text-sm">{getCurrentDate()}</span>
        </div>
      </div>

      {/* Start Recording Card */}
      <div className="bg-surface-light border border-border-light rounded-xl p-4 mb-3 relative overflow-hidden flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">Ready to Record</span>
            </div>
            <h2 className="text-xl font-bold text-text-main mb-1">Start New Dictation</h2>
            <p className="text-text-muted text-sm mb-3">Use your voice to create notes, emails, and documents 3x faster than typing.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const toast = document.createElement('div')
                  toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-surface-light border border-border-light px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in text-sm'
                  toast.innerHTML = `<span class="text-text-main">Hold <span class="font-mono font-bold text-primary-content bg-primary px-2 py-0.5 rounded">${currentHotkey}</span> to record</span>`
                  document.body.appendChild(toast)
                  setTimeout(() => toast.remove(), 3000)
                }}
                className="bg-primary hover:bg-primary-hover text-primary-content font-semibold px-5 py-2.5 rounded-lg shadow-sm hover:shadow-glow transition-all text-sm"
              >
                Start Recording
              </button>
              <div className="flex items-center gap-2 bg-surface-hover px-3 py-2.5 rounded-lg border border-border-light">
                <span className="material-symbols-outlined text-text-muted text-base">keyboard</span>
                <span className="text-text-body font-medium text-sm">{currentHotkey}</span>
              </div>
            </div>
          </div>
          {/* Microphone illustration */}
          <div className="hidden md:flex items-center justify-center">
            <div className="relative">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center">
                <div className="w-14 h-14 bg-primary/40 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-primary-content icon-filled">mic</span>
                </div>
              </div>
              <div className="absolute inset-0 w-20 h-20 bg-primary/10 rounded-full animate-pulse-ring"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-3 flex-shrink-0">
        {/* Total Transcriptions */}
        <div className="bg-surface-light border border-border-light rounded-xl p-3 card-hover">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-xl text-blue-600 dark:text-blue-400">description</span>
            </div>
            <div>
              <p className="text-text-muted text-xs">Total Transcriptions</p>
              <p className="text-2xl font-bold text-text-main font-numbers">{stats.totalTranscriptions}</p>
            </div>
          </div>
        </div>

        {/* Words Captured */}
        <div className="bg-surface-light border border-border-light rounded-xl p-3 card-hover">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-xl text-orange-600 dark:text-orange-400">text_fields</span>
            </div>
            <div>
              <p className="text-text-muted text-xs">Words Captured</p>
              <p className="text-2xl font-bold text-text-main font-numbers">{stats.wordsCaptured.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Time Saved */}
        <div className="bg-surface-light border border-border-light rounded-xl p-3 card-hover">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-xl text-purple-600 dark:text-purple-400">schedule</span>
            </div>
            <div>
              <p className="text-text-muted text-xs">Time Saved</p>
              <p className="text-2xl font-bold text-text-main font-numbers">
                {stats.timeSavedMinutes >= 60
                  ? `${(stats.timeSavedMinutes / 60).toFixed(1)} hrs`
                  : `${stats.timeSavedMinutes} min`
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity - no card, just header and items */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h2 className="text-lg font-bold text-text-main">Recent Activity</h2>
          {transcriptions.length > 3 && (
            <button className="text-primary-dark hover:text-primary font-medium text-sm">
              View All
            </button>
          )}
        </div>

        {recentTranscriptions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-text-muted">mic</span>
              </div>
              <p className="text-text-main font-semibold mb-1 text-base">No transcriptions yet</p>
              <p className="text-text-muted text-sm">Hold {currentHotkey} to start recording</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-2">
            {recentTranscriptions.map((transcription, index) => {
              const { icon, className } = getActivityIcon(index)
              const text = transcription.polished_text || transcription.raw_text
              const wordCount = getWordCount(text)

              return (
                <div
                  key={transcription.id}
                  onClick={() => handleCopy(text, transcription.id)}
                  className="flex-1 bg-surface-light border border-border-light rounded-xl px-4 py-3 hover:shadow-card transition-all cursor-pointer group flex items-center"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className={`activity-icon ${className} flex-shrink-0`}>
                      <span className="material-symbols-outlined text-lg">{icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-text-main font-semibold text-sm">
                          {truncateText(text, 45) || 'Untitled'}
                        </p>
                        <span className="text-text-muted text-xs flex-shrink-0">{formatDate(transcription.created_at)}</span>
                      </div>
                      <p className="text-text-muted text-sm line-clamp-1">
                        {truncateText(text, 70)}
                      </p>
                      <div className="flex items-center gap-4 text-text-muted text-xs mt-0.5">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">notes</span>
                          {wordCount} words
                        </span>
                        {transcription.duration && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {formatDuration(transcription.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Copy indicator */}
                    <div className={clsx(
                      'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all flex-shrink-0',
                      copiedId === transcription.id
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : 'text-text-muted opacity-0 group-hover:opacity-100'
                    )}>
                      {copiedId === transcription.id ? (
                        <>
                          <span className="material-symbols-outlined text-xs">check</span>
                          Copied
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-xs">content_copy</span>
                          Copy
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
