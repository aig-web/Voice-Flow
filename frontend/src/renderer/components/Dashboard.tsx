import React, { useEffect, useState } from 'react'
import clsx from 'clsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

  useEffect(() => {
    fetchData()

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

  const fetchData = async () => {
    try {
      setError(null)
      const response = await fetch(`${API_BASE_URL}/api/transcriptions`)

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

      const data: Transcription[] = await response.json()

      if (Array.isArray(data)) {
        setTranscriptions(data)

        // Calculate stats
        const totalTranscriptions = data.length
        const wordsCaptured = data.reduce((acc, t) => {
          const text = t.polished_text || t.raw_text || ''
          return acc + text.split(/\s+/).filter(w => w.length > 0).length
        }, 0)
        // Average typing speed is ~40 WPM, so time saved = words / 40
        const timeSavedMinutes = Math.round(wordsCaptured / 40)

        setStats({ totalTranscriptions, wordsCaptured, timeSavedMinutes })
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
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const truncateText = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted">Loading dashboard...</span>
        </div>
      </div>
    )
  }

  const recentTranscriptions = transcriptions.slice(0, 5)

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 animate-fade-in-up">
      {/* Error Notification */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-red-500">error</span>
            <span className="text-red-700 font-medium">{error}</span>
          </div>
          <button
            onClick={dismissError}
            className="p-1 hover:bg-red-100 rounded-lg transition-colors"
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined text-red-500">close</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-main mb-1">Dashboard</h1>
        <p className="text-text-muted text-sm">Overview of your voice transcription activity</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Total Transcriptions */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card hover:shadow-subtle transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-primary-content">description</span>
            </div>
            <div>
              <p className="text-text-muted text-sm font-medium">Total Transcriptions</p>
              <p className="text-3xl font-bold text-text-main">{stats.totalTranscriptions}</p>
            </div>
          </div>
        </div>

        {/* Words Captured */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card hover:shadow-subtle transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-primary-content">text_fields</span>
            </div>
            <div>
              <p className="text-text-muted text-sm font-medium">Words Captured</p>
              <p className="text-3xl font-bold text-text-main">{stats.wordsCaptured.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Time Saved */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-6 shadow-card hover:shadow-subtle transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-primary-content">schedule</span>
            </div>
            <div>
              <p className="text-text-muted text-sm font-medium">Time Saved</p>
              <p className="text-3xl font-bold text-text-main">
                {stats.timeSavedMinutes < 60
                  ? `${stats.timeSavedMinutes}m`
                  : `${Math.floor(stats.timeSavedMinutes / 60)}h ${stats.timeSavedMinutes % 60}m`
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-surface-light border border-border-light rounded-2xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light">
          <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-content">history</span>
            Recent Activity
          </h2>
        </div>

        {recentTranscriptions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl text-text-muted">mic</span>
            </div>
            <p className="text-text-main font-medium">No transcriptions yet</p>
            <p className="text-text-muted text-sm mt-1">Hold Ctrl+Alt to start recording</p>
          </div>
        ) : (
          <div className="divide-y divide-border-light">
            {recentTranscriptions.map((transcription) => (
              <div
                key={transcription.id}
                className="px-6 py-4 hover:bg-surface-hover transition-colors flex items-center justify-between gap-4 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-text-main font-medium truncate">
                    {truncateText(transcription.polished_text || transcription.raw_text)}
                  </p>
                  <p className="text-text-muted text-sm mt-1">
                    {formatDate(transcription.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(transcription.polished_text || transcription.raw_text, transcription.id)}
                  className={clsx(
                    'px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 flex-shrink-0',
                    copiedId === transcription.id
                      ? 'bg-primary/30 text-primary-content'
                      : 'bg-surface-hover text-text-body hover:bg-surface-active group-hover:opacity-100 opacity-0'
                  )}
                >
                  {copiedId === transcription.id ? (
                    <>
                      <span className="material-symbols-outlined text-lg">check</span>
                      Copied
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">content_copy</span>
                      Copy
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {transcriptions.length > 5 && (
          <div className="px-6 py-3 border-t border-border-light text-center bg-surface-hover/50">
            <span className="text-text-muted text-sm">
              Showing 5 of {transcriptions.length} transcriptions
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
