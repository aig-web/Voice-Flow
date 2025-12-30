import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * ErrorBoundary - Catches React errors and displays fallback UI
 * Prevents entire app from crashing when a component fails
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-background-light flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-surface-light border border-border-light rounded-2xl p-8 text-center shadow-card">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl text-red-500">error</span>
            </div>

            <h2 className="text-xl font-bold text-text-main mb-2">
              Something went wrong
            </h2>

            <p className="text-text-muted text-sm mb-6">
              The app encountered an unexpected error. Your data is safe.
            </p>

            {/* Show error details in dev mode */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs text-text-muted cursor-pointer hover:text-text-main">
                  Technical details
                </summary>
                <pre className="mt-2 p-3 bg-surface-hover rounded-lg text-xs text-red-600 overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 bg-primary hover:bg-primary-hover text-primary-content font-bold rounded-full transition-all"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-6 py-3 border border-border-light text-text-body hover:bg-surface-hover rounded-full transition-all"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
