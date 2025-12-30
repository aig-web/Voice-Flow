const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface TranscriptionResponse {
  transcription: string
  polished_text?: string
  duration?: number
  status: 'success' | 'error'
  error?: string
  file_size?: number
  file_name?: string
}

/**
 * Send audio blob to backend for transcription
 * @param audioBlob - The audio blob to transcribe
 * @param appContext - The detected app context for tone adaptation (email, chat, code, etc.)
 */
export async function transcribeAudio(audioBlob: Blob, appContext: string = 'general'): Promise<TranscriptionResponse> {
  try {
    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.webm')
    formData.append('app_context', appContext)  // Pass app context for AI tone adaptation

    // Add timeout to prevent indefinite hangs
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout

    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    // Return polished text if available, otherwise raw transcription
    return {
      ...data,
      transcription: data.polished_text || data.transcription || ''
    }
  } catch (error) {
    console.error('Transcription API error:', error)

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        transcription: '',
        status: 'error',
        error: 'Transcription timed out - try a shorter recording'
      }
    }

    return {
      transcription: '',
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to transcribe audio'
    }
  }
}

/**
 * Test backend connectivity
 */
export async function testBackendConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`)
    return response.ok
  } catch {
    return false
  }
}
