import React, { useState } from 'react'
import clsx from 'clsx'
import { AlertDialog } from './AlertDialog'

type ExportFormat = 'pdf' | 'csv' | 'json'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

export function ExportButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null)

  const handleExport = async (format: ExportFormat) => {
    try {
      setIsExporting(true)

      const response = await fetch(
        `${API_BASE_URL}/api/transcriptions/export/${format}`
      )
      const result = await response.json()

      if (result.error) {
        setAlert({ title: 'Export Error', message: result.error })
        return
      }

      // Convert data to blob and download
      let blob: Blob
      let filename = result.filename

      if (format === 'pdf') {
        // Convert hex back to binary
        const hexString = result.data
        const bytes = new Uint8Array(hexString.length / 2)
        for (let i = 0; i < hexString.length; i += 2) {
          bytes[i / 2] = parseInt(hexString.substr(i, 2), 16)
        }
        blob = new Blob([bytes], { type: 'application/pdf' })
      } else if (format === 'csv') {
        blob = new Blob([result.data], { type: 'text/csv' })
      } else {
        blob = new Blob([result.data], { type: 'application/json' })
      }

      // Trigger download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setIsOpen(false)
      setAlert({
        title: 'Export Successful',
        message: `Exported as ${format.toUpperCase()}`
      })
    } catch (error) {
      console.error('Export error:', error)
      setAlert({ title: 'Export Failed', message: 'Failed to export transcriptions' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="px-4 py-2 glass-sm text-sm font-medium text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/50 disabled:opacity-50 relative"
      >
        ⬇️ Export
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 glass rounded-lg overflow-hidden shadow-lg z-50">
          <button
            onClick={() => handleExport('pdf')}
            className="w-full px-4 py-3 text-left text-slate-300 hover:bg-blue-500/20 border-b border-slate-700/50 transition-colors"
          >
            📄 Export as PDF
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="w-full px-4 py-3 text-left text-slate-300 hover:bg-blue-500/20 border-b border-slate-700/50 transition-colors"
          >
            📊 Export as CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="w-full px-4 py-3 text-left text-slate-300 hover:bg-blue-500/20 transition-colors"
          >
            📦 Export as JSON
          </button>
        </div>
      )}

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
