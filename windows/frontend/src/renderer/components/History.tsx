import React, { useEffect, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { AlertDialog } from './AlertDialog'
import clsx from 'clsx'

interface TranscriptionRecord {
  id: number
  raw_text: string
  polished_text: string
  created_at: string
  duration: number
}

export function History() {
  const [transcriptions, setTranscriptions] = useState<TranscriptionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [showExportMode, setShowExportMode] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [lastExportFormat, setLastExportFormat] = useState<'pdf' | 'csv' | 'json'>('pdf')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    fetchTranscriptions()
    window.addEventListener('transcription-saved', fetchTranscriptions)
    return () => window.removeEventListener('transcription-saved', fetchTranscriptions)
  }, [])

  const fetchTranscriptions = async () => {
    try {
      const result = await window.voiceFlow.getHistory(10000)  // Get up to 10000 transcriptions
      if (result.ok && result.data) {
        setTranscriptions(result.data)
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === transcriptions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transcriptions.map(t => t.id)))
    }
  }

  const handleExportButtonClick = () => {
    if (!showExportMode) {
      setShowExportMode(true)
      setShowExportMenu(true)
    } else {
      setShowExportMenu(!showExportMenu)
    }
  }

  const handleExport = async (format: 'pdf' | 'csv' | 'json') => {
    if (selectedIds.size === 0) {
      setAlert({ title: 'No Selection', message: 'Please select at least one transcription to export' })
      return
    }

    try {
      setIsExporting(true)
      setShowExportMenu(false)
      setLastExportFormat(format)

      const result = await window.voiceFlow.exportTranscriptions(format, Array.from(selectedIds))

      if (!result.ok || !result.data) {
        setAlert({ title: 'Export Error', message: result.error || 'Export failed' })
        return
      }

      const data = result.data

      // Download file
      let blob: Blob
      let filename = data.filename

      if (format === 'pdf') {
        const hexString = data.data
        const bytes = new Uint8Array(hexString.length / 2)
        for (let i = 0; i < hexString.length; i += 2) {
          bytes[i / 2] = parseInt(hexString.substr(i, 2), 16)
        }
        blob = new Blob([bytes], { type: 'application/pdf' })
      } else if (format === 'csv') {
        blob = new Blob([data.data], { type: 'text/csv' })
      } else {
        blob = new Blob([data.data], { type: 'application/json' })
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setAlert({
        title: 'Export Successful',
        message: `Exported ${selectedIds.size} transcription(s) as ${format.toUpperCase()}`
      })
      setSelectedIds(new Set())
      setShowExportMode(false)
    } catch (error) {
      console.error('Export error:', error)
      setAlert({ title: 'Export Failed', message: 'Failed to export transcriptions' })
    } finally {
      setIsExporting(false)
    }
  }

  const confirmDelete = async () => {
    if (deleteId === null) return

    try {
      await window.voiceFlow.deleteTranscription(deleteId)
      setTranscriptions(transcriptions.filter(t => t.id !== deleteId))
      const newSelected = new Set(selectedIds)
      newSelected.delete(deleteId)
      setSelectedIds(newSelected)
    } catch (error) {
      console.error('Error deleting:', error)
    } finally {
      setDeleteId(null)
    }
  }

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="min-h-screen bg-background-light p-8">
      <div className="max-w-4xl mx-auto animate-fade-in-up">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-main mb-1">History</h1>
          <p className="text-text-muted text-sm">Your transcribed conversations</p>
        </div>

        {loading ? (
          <div className="bg-surface-light border border-border-light rounded-2xl p-12 text-center text-text-muted shadow-card">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            Loading...
          </div>
        ) : transcriptions.length === 0 ? (
          <div className="bg-surface-light border border-border-light rounded-2xl p-12 text-center shadow-card">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl text-text-muted">mic</span>
            </div>
            <p className="text-text-main font-medium">No transcriptions yet</p>
            <p className="text-text-muted text-sm mt-1">Start recording to see your history!</p>
          </div>
        ) : (
          <>
            {/* Export Toolbar - Only show when in export mode */}
            {showExportMode && (
              <div className="bg-surface-light border border-border-light rounded-2xl p-6 mb-6 space-y-4 relative z-50 shadow-card">
                <div className="flex justify-between items-center">
                  <div className="text-text-muted text-sm">
                    {selectedIds.size > 0 && <span className="text-primary-content font-bold">{selectedIds.size} selected</span>}
                    {selectedIds.size === 0 && <span>Select transcriptions to export</span>}
                  </div>

                  <div className="flex gap-3 items-center">
                    {/* Format Selector Dropdown */}
                    <div className="relative z-[100]">
                      <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="px-4 py-2 bg-surface-hover border border-border-light rounded-full text-sm font-medium text-text-body hover:text-text-main hover:bg-surface-active transition-all flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {lastExportFormat === 'pdf' ? 'picture_as_pdf' : lastExportFormat === 'csv' ? 'table_chart' : 'data_object'}
                        </span>
                        <span>{lastExportFormat.toUpperCase()}</span>
                        <span className="material-symbols-outlined text-sm">expand_more</span>
                      </button>

                      {/* Format Dropdown Menu */}
                      {showExportMenu && (
                        <>
                          {/* Backdrop */}
                          <div
                            className="fixed inset-0 z-[150]"
                            onClick={() => setShowExportMenu(false)}
                          />

                          {/* Dropdown Menu */}
                          <div className="absolute top-full right-0 mt-2 w-56 bg-background-light border border-border-light rounded-2xl overflow-hidden shadow-floating z-[200] animate-scale-in">
                            <button
                              onClick={() => {
                                setLastExportFormat('pdf')
                                setShowExportMenu(false)
                              }}
                              className="w-full px-5 py-4 text-left text-text-body hover:text-text-main hover:bg-surface-light border-b border-border-light transition-all flex items-center gap-3 group"
                            >
                              <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">picture_as_pdf</span>
                              <div>
                                <div className="font-medium text-text-main">PDF</div>
                                <div className="text-xs text-text-muted">Formatted document</div>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                setLastExportFormat('csv')
                                setShowExportMenu(false)
                              }}
                              className="w-full px-5 py-4 text-left text-text-body hover:text-text-main hover:bg-surface-light border-b border-border-light transition-all flex items-center gap-3 group"
                            >
                              <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">table_chart</span>
                              <div>
                                <div className="font-medium text-text-main">CSV</div>
                                <div className="text-xs text-text-muted">Spreadsheet format</div>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                setLastExportFormat('json')
                                setShowExportMenu(false)
                              }}
                              className="w-full px-5 py-4 text-left text-text-body hover:text-text-main hover:bg-surface-light transition-all flex items-center gap-3 group"
                            >
                              <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">data_object</span>
                              <div>
                                <div className="font-medium text-text-main">JSON</div>
                                <div className="text-xs text-text-muted">Machine-readable</div>
                              </div>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Export Button */}
                    <button
                      onClick={() => handleExport(lastExportFormat)}
                      disabled={selectedIds.size === 0 || isExporting}
                      className="px-5 py-2 text-sm font-bold text-primary-content bg-primary hover:bg-primary-hover rounded-full shadow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-lg">download</span>
                      {isExporting ? 'Exporting...' : 'Export Selected'}
                    </button>

                    {/* Cancel Button */}
                    <button
                      onClick={() => {
                        setShowExportMode(false)
                        setSelectedIds(new Set())
                      }}
                      className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main border border-border-light rounded-full hover:bg-surface-hover transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {/* Select All Checkbox */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={toggleSelectAll}
                    className={clsx(
                      'w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer',
                      selectedIds.size === transcriptions.length && transcriptions.length > 0
                        ? 'bg-primary border-primary shadow-sm'
                        : 'border-border-light bg-background-light hover:border-text-muted group-hover:bg-surface-light'
                    )}
                  >
                    {selectedIds.size === transcriptions.length && transcriptions.length > 0 && (
                      <span className="material-symbols-outlined text-sm text-primary-content">check</span>
                    )}
                  </div>
                  <span className="text-sm text-text-muted group-hover:text-text-body transition-colors">
                    {selectedIds.size === transcriptions.length && transcriptions.length > 0
                      ? 'Deselect All'
                      : 'Select All'}
                  </span>
                </label>
              </div>
            )}

            {/* Simple Export Button - Show when NOT in export mode */}
            {!showExportMode && (
              <div className="mb-6 flex justify-end">
                <button
                  onClick={handleExportButtonClick}
                  className="px-4 py-2 bg-surface-light border border-border-light rounded-full text-sm font-medium text-text-body hover:text-text-main hover:bg-surface-hover transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  Export
                </button>
              </div>
            )}

            {/* Transcriptions List */}
            <div className="space-y-4">
              {transcriptions.map((t) => (
                <div key={t.id} className={clsx(
                  'bg-surface-light border border-border-light rounded-2xl p-6 hover:shadow-subtle group transition-all shadow-card',
                  showExportMode && selectedIds.has(t.id) && 'ring-2 ring-primary/50 bg-primary/5'
                )}>
                  <div className="flex items-start gap-4">
                    {/* Checkbox - Only show in export mode */}
                    {showExportMode && (
                      <div
                        onClick={() => toggleSelect(t.id)}
                        className={clsx(
                          'w-5 h-5 mt-1 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0',
                          selectedIds.has(t.id)
                            ? 'bg-primary border-primary shadow-sm'
                            : 'border-border-light bg-background-light hover:border-text-muted hover:bg-surface-hover'
                        )}
                      >
                        {selectedIds.has(t.id) && (
                          <span className="material-symbols-outlined text-sm text-primary-content">check</span>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-xs text-text-muted mb-1">
                            {new Date(t.created_at).toLocaleString()}
                          </p>
                          <p className="text-xs text-text-muted/60">ID #{t.id}</p>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => copyToClipboard(t.polished_text, t.id)}
                            className={clsx(
                              'px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5',
                              copiedId === t.id
                                ? 'bg-primary/30 text-primary-content'
                                : 'bg-surface-hover text-text-body hover:bg-surface-active'
                            )}
                          >
                            <span className="material-symbols-outlined text-sm">{copiedId === t.id ? 'check' : 'content_copy'}</span>
                            {copiedId === t.id ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={() => setDeleteId(t.id)}
                            className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-text-muted mb-2 font-medium">Polished:</p>
                          <p className="text-text-main text-sm leading-relaxed">
                            {t.polished_text}
                          </p>
                        </div>
                        <details className="text-xs">
                          <summary className="text-text-muted cursor-pointer hover:text-text-body mb-2 select-none font-medium">
                            Show raw transcription
                          </summary>
                          <p className="text-text-body bg-surface-hover p-3 rounded-xl mt-2">
                            {t.raw_text}
                          </p>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Delete Transcription"
        message="Are you sure you want to delete this transcription? This action cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Alert Dialog */}
      <AlertDialog
        isOpen={alert !== null}
        title={alert?.title || ''}
        message={alert?.message || ''}
        onClose={() => setAlert(null)}
      />
    </div>
  )
}
