import React from 'react'

interface AlertDialogProps {
  isOpen: boolean
  title: string
  message: string
  onClose: () => void
}

export function AlertDialog({ isOpen, title, message, onClose }: AlertDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-background-light border border-border-light rounded-2xl p-8 max-w-md w-full space-y-6 animate-scale-in shadow-floating">
        {/* Title */}
        <div>
          <h3 className="text-xl font-bold text-text-main mb-2">{title}</h3>
          <p className="text-text-body text-sm">{message}</p>
        </div>

        {/* Button */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-primary-content bg-primary hover:bg-primary-hover rounded-full shadow-sm hover:shadow-glow transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">check</span>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
