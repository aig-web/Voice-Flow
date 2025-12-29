import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastWindow } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import './styles/globals.css'

// Check if this is the toast window (loaded with #/toast hash)
const isToastWindow = window.location.hash === '#/toast'

// Set transparent background for toast window
if (isToastWindow) {
  document.documentElement.classList.add('toast-window')
  document.body.classList.add('toast-window')
  document.body.style.background = 'transparent'
  document.documentElement.style.background = 'transparent'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        {isToastWindow ? <ToastWindow /> : <App />}
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
