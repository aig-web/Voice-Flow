import React, { useEffect, useState } from 'react'
import { AlertDialog } from './AlertDialog'

interface Snippet {
  id: number
  trigger: string
  content: string
  use_count: number
  created_at: string
}

export function Snippets() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [loading, setLoading] = useState(true)
  const [newTrigger, setNewTrigger] = useState('')
  const [newContent, setNewContent] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    fetchSnippets()
  }, [])

  const fetchSnippets = async () => {
    try {
      const result = await window.voiceFlow.getSnippets()
      if (result.ok && result.data) {
        setSnippets(result.data)
      }
    } catch (error) {
      console.error('Error fetching snippets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSnippet = async () => {
    if (!newTrigger.trim() || !newContent.trim()) {
      setAlert({ title: 'Missing Fields', message: 'Please fill in both trigger phrase and content' })
      return
    }

    try {
      setIsAdding(true)
      const result = await window.voiceFlow.addSnippet(newTrigger.trim(), newContent.trim())

      if (result.ok) {
        setNewTrigger('')
        setNewContent('')
        fetchSnippets()
        setAlert({ title: 'Success', message: result.data?.message || 'Shortcut added!' })
      } else {
        setAlert({ title: 'Error', message: result.error || 'Failed to add shortcut' })
      }
    } catch (error) {
      console.error('Error adding snippet:', error)
      setAlert({ title: 'Error', message: 'Error adding shortcut' })
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteSnippet = async (id: number) => {
    try {
      const result = await window.voiceFlow.deleteSnippet(id)

      if (result.ok) {
        setSnippets(snippets.filter(s => s.id !== id))
        setAlert({ title: 'Success', message: 'Shortcut removed!' })
      }
    } catch (error) {
      console.error('Error deleting snippet:', error)
    }
  }

  const filteredSnippets = snippets.filter(
    (snippet) =>
      snippet.trigger.toLowerCase().includes(searchTerm.toLowerCase()) ||
      snippet.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-text-muted">Loading shortcuts...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-light p-8">
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-main mb-1">Voice Shortcuts</h1>
          <p className="text-text-muted text-sm">
            Create shortcuts that expand when you speak them. Say "my email" and get your full email address.
          </p>
        </div>

        {/* Add New Shortcut */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-8 space-y-6 shadow-card">
          <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-content">bolt</span>
            Add New Shortcut
          </h3>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-text-muted mb-2 font-medium">
                Trigger Phrase (what you say)
              </label>
              <input
                type="text"
                placeholder="e.g., 'my email', 'my address', 'my phone'"
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSnippet()}
                className="w-full px-4 py-3 bg-surface-hover border border-border-light text-text-main placeholder-text-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-2 font-medium">
                Expands To (what gets inserted)
              </label>
              <input
                type="text"
                placeholder="e.g., 'john@example.com', '123 Main Street'"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSnippet()}
                className="w-full px-4 py-3 bg-surface-hover border border-border-light text-text-main placeholder-text-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
          </div>

          <button
            onClick={handleAddSnippet}
            disabled={isAdding || !newTrigger.trim() || !newContent.trim()}
            className="w-full px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-full shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            {isAdding ? 'Adding...' : 'Add Shortcut'}
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="bg-surface-light border border-border-light rounded-2xl p-8 space-y-6 shadow-card">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-text-main">
              Your Shortcuts ({filteredSnippets.length})
            </h3>
            {snippets.length > 0 && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search shortcuts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2 pl-10 bg-surface-hover border border-border-light text-sm text-text-main placeholder-text-muted rounded-full w-64 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">search</span>
              </div>
            )}
          </div>

          {filteredSnippets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-text-muted">bolt</span>
              </div>
              <p className="text-text-main font-medium">
                {snippets.length === 0
                  ? 'No shortcuts yet'
                  : 'No matching shortcuts found'}
              </p>
              <p className="text-text-muted text-sm mt-1">
                {snippets.length === 0 && 'Create your first voice shortcut above!'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSnippets.map((snippet) => (
                <div
                  key={snippet.id}
                  className="flex items-center justify-between p-4 bg-surface-hover border border-border-light rounded-xl hover:border-primary/30 hover:bg-surface-active transition-all group"
                >
                  <div className="flex-1 flex items-center gap-6">
                    <div className="flex-1">
                      <p className="text-xs text-text-muted mb-1 uppercase tracking-wide font-medium">Say</p>
                      <p className="text-base text-primary-content font-bold font-mono">"{snippet.trigger}"</p>
                    </div>

                    <div className="text-primary-content">
                      <span className="material-symbols-outlined">arrow_forward</span>
                    </div>

                    <div className="flex-1">
                      <p className="text-xs text-text-muted mb-1 uppercase tracking-wide font-medium">Inserts</p>
                      <p className="text-base text-text-main font-mono truncate max-w-xs" title={snippet.content}>
                        {snippet.content}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-text-muted mb-1">Used</p>
                      <p className="text-sm text-text-body font-medium">{snippet.use_count}x</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteSnippet(snippet.id)}
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
        {snippets.length === 0 && (
          <div className="bg-primary/10 border border-primary/30 p-6 rounded-2xl">
            <p className="text-sm text-text-main mb-3 font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-content">lightbulb</span>
              Shortcut ideas:
            </p>
            <ul className="space-y-2 text-sm text-text-body">
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                <span><strong>"my email"</strong> expands to your email address</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                <span><strong>"my address"</strong> expands to your full mailing address</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                <span><strong>"my phone"</strong> expands to your phone number</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-content">•</span>
                <span><strong>"thanks email"</strong> expands to "Thank you for your email. I'll get back to you shortly."</span>
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
