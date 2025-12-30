import React from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-background-light border border-border-light rounded-2xl p-8 max-w-md w-full space-y-6 animate-scale-in shadow-floating">
        {/* Title */}
        <div>
          <h3 className="text-xl font-bold text-text-main mb-2">{title}</h3>
          <p className="text-text-body text-sm">{message}</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 text-sm font-medium text-text-muted hover:text-text-main border border-border-light hover:border-text-muted rounded-full transition-all hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-full shadow-sm transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">delete</span>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
