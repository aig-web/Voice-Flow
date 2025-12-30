import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { AlertDialog } from './AlertDialog'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function Dictionary() {
  const [dictionary, setDictionary] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [newMishearing, setNewMishearing] = useState('')
  const [newCorrection, setNewCorrection] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    fetchDictionary()
  }, [])

  const fetchDictionary = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings`)
      const data = await response.json()
      setDictionary(data.personal_dictionary || {})
    } catch (error) {
      console.error('Error fetching dictionary:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddEntry = async () => {
    if (!newMishearing.trim() || !newCorrection.trim()) {
      setAlert({ title: 'Missing Fields', message: 'Please fill in both mishearing and correction' })
      return
    }

    // Check for duplicates
    if (dictionary[newMishearing]) {
      setAlert({ title: 'Duplicate Entry', message: 'This word is already in your dictionary' })
      return
    }

    try {
      setIsAdding(true)
      const response = await fetch(`${API_BASE_URL}/api/settings/dictionary/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mishearing: newMishearing,
          correction: newCorrection
        })
      })

      if (response.ok) {
        const data = await response.json()
        setDictionary(data.dictionary)
        setNewMishearing('')
        setNewCorrection('')
        setAlert({ title: 'Success', message: 'Word added to dictionary!' })
      } else {
        setAlert({ title: 'Error', message: 'Failed to add entry' })
      }
    } catch (error) {
      console.error('Error adding entry:', error)
      setAlert({ title: 'Error', message: 'Error adding entry' })
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemoveEntry = async (mishearing: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/settings/dictionary/${encodeURIComponent(mishearing)}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        const newDict = { ...dictionary }
        delete newDict[mishearing]
        setDictionary(newDict)
        setAlert({ title: 'Success', message: 'Word removed from dictionary!' })
      }
    } catch (error) {
      console.error('Error removing entry:', error)
    }
  }

  const filteredEntries = Object.entries(dictionary).filter(
    ([mishearing, correction]) =>
      mishearing.toLowerCase().includes(searchTerm.toLowerCase()) ||
      correction.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted">Loading dictionary...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-light p-8">
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-main mb-1">Personal Dictionary</h1>
          <p className="text-text-muted text-sm">
            Teach Voice-Flow how to spell your unique words and terms
          </p>
        </div>

        {/* Add New Entry */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-8 space-y-6 shadow-card">
          <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-content">add_circle</span>
            Add New Word
          </h3>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-text-muted mb-2 font-medium">
                Mishearing (what Voice-Flow might transcribe)
              </label>
              <input
                type="text"
                placeholder="e.g., 'wright', 'their', 'one'"
                value={newMishearing}
                onChange={(e) => setNewMishearing(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddEntry()}
                className="w-full px-4 py-3 bg-surface-hover border border-border-light text-text-main placeholder-text-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-2 font-medium">
                Correction (the correct spelling)
              </label>
              <input
                type="text"
                placeholder="e.g., 'right', 'there', 'won'"
                value={newCorrection}
                onChange={(e) => setNewCorrection(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddEntry()}
                className="w-full px-4 py-3 bg-surface-hover border border-border-light text-text-main placeholder-text-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
          </div>

          <button
            onClick={handleAddEntry}
            disabled={isAdding || !newMishearing.trim() || !newCorrection.trim()}
            className="w-full px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-full shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            {isAdding ? 'Adding...' : 'Add to Dictionary'}
          </button>
        </div>

        {/* Dictionary List */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-8 space-y-6 shadow-card">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-text-main">
              Your Words ({filteredEntries.length})
            </h3>
            {Object.keys(dictionary).length > 0 && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search dictionary..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2 pl-10 bg-surface-hover border border-border-light text-sm text-text-main placeholder-text-muted rounded-full w-64 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">search</span>
              </div>
            )}
          </div>

          {filteredEntries.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-text-muted">menu_book</span>
              </div>
              <p className="text-text-main font-medium">
                {Object.keys(dictionary).length === 0
                  ? 'No words in your dictionary yet'
                  : 'No matching words found'}
              </p>
              <p className="text-text-muted text-sm mt-1">
                {Object.keys(dictionary).length === 0 && 'Add your first word above!'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEntries.map(([mishearing, correction]) => (
                <div
                  key={mishearing}
                  className="flex items-center justify-between p-4 bg-surface-hover border border-border-light rounded-xl hover:border-primary/30 hover:bg-surface-active transition-all group"
                >
                  <div className="flex-1 flex items-center gap-6">
                    <div className="flex-1">
                      <p className="text-xs text-text-muted mb-1 uppercase tracking-wide font-medium">Mishearing</p>
                      <p className="text-base text-text-body font-mono">"{mishearing}"</p>
                    </div>

                    <div className="text-primary-content">
                      <span className="material-symbols-outlined">arrow_forward</span>
                    </div>

                    <div className="flex-1">
                      <p className="text-xs text-text-muted mb-1 uppercase tracking-wide font-medium">Correction</p>
                      <p className="text-base text-text-main font-bold font-mono">"{correction}"</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveEntry(mishearing)}
                    className="ml-4 px-4 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-full hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips Section */}
        {Object.keys(dictionary).length === 0 && (
          <div className="bg-primary/10 border border-primary/30 p-6 rounded-2xl">
            <p className="text-sm text-text-main mb-3 font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-content">lightbulb</span>
              Tips for your dictionary:
            </p>
            <ul className="space-y-2 text-sm text-text-body">
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                Add names that are often mispronounced
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                Add technical terms or jargon specific to your field
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                Add slang or words you use frequently
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                Add common homophones (their/there/they're)
              </li>
            </ul>
          </div>
        )}
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
