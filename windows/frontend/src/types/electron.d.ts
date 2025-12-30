export interface ElectronAPI {
  platform: string
  // Add more API methods here as needed
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
