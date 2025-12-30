/**
 * WebSocketManager - Handles WebSocket connections with auto-reconnection
 * Provides exponential backoff for reconnection attempts
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface WebSocketManagerOptions {
  url: string
  onMessage: (data: any) => void
  onStateChange: (state: ConnectionState) => void
  maxReconnectAttempts?: number
  initialReconnectDelay?: number
  maxReconnectDelay?: number
}

export class WebSocketManager {
  private ws: WebSocket | null = null
  private options: Required<WebSocketManagerOptions>
  private reconnectAttempts = 0
  private reconnectTimeout: number | null = null
  private state: ConnectionState = 'disconnected'
  private authToken: string | null = null
  private intentionalClose = false

  constructor(options: WebSocketManagerOptions) {
    this.options = {
      maxReconnectAttempts: 10,
      initialReconnectDelay: 1000,
      maxReconnectDelay: 30000,
      ...options
    }
  }

  async connect(authToken: string): Promise<void> {
    this.authToken = authToken
    this.intentionalClose = false
    this.setState('connecting')

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url)

        this.ws.onopen = () => {
          console.log('[WebSocketManager] Connected, authenticating...')
          this.ws?.send(JSON.stringify({ type: 'auth', token: authToken }))
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            // Handle auth failure
            if (data.error === 'Authentication failed') {
              this.setState('disconnected')
              reject(new Error('Authentication failed'))
              return
            }

            // First successful message = connected
            if (this.state === 'connecting' || this.state === 'reconnecting') {
              this.setState('connected')
              this.reconnectAttempts = 0
              resolve()
            }

            this.options.onMessage(data)
          } catch (e) {
            console.error('[WebSocketManager] Failed to parse message:', e)
          }
        }

        this.ws.onclose = (event) => {
          console.log(`[WebSocketManager] Closed: code=${event.code}, reason=${event.reason}`)

          // Don't reconnect if intentionally closed or auth failed
          if (this.intentionalClose || event.code === 4001) {
            this.setState('disconnected')
            return
          }

          // Attempt reconnection
          this.attemptReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('[WebSocketManager] Error:', error)
        }

      } catch (error) {
        this.setState('disconnected')
        reject(error)
      }
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('[WebSocketManager] Max reconnect attempts reached')
      this.setState('disconnected')
      return
    }

    this.setState('reconnecting')
    this.reconnectAttempts++

    // Exponential backoff with jitter
    const baseDelay = this.options.initialReconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    const jitter = Math.random() * 1000
    const delay = Math.min(baseDelay + jitter, this.options.maxReconnectDelay)

    console.log(`[WebSocketManager] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`)

    this.reconnectTimeout = window.setTimeout(async () => {
      if (this.authToken) {
        try {
          await this.connect(this.authToken)
        } catch (error) {
          console.error('[WebSocketManager] Reconnect failed:', error)
        }
      }
    }, delay)
  }

  send(data: string | object): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data))
      return true
    }
    console.warn('[WebSocketManager] Cannot send - not connected')
    return false
  }

  sendBinary(data: ArrayBuffer): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
      return true
    }
    return false
  }

  disconnect(): void {
    this.intentionalClose = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect')
      this.ws = null
    }

    this.setState('disconnected')
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state
      this.options.onStateChange(state)
    }
  }

  getState(): ConnectionState {
    return this.state
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }
}

export default WebSocketManager
