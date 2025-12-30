# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice-Flow is a desktop voice transcription application that captures audio via global hotkey, transcribes using NVIDIA Parakeet TDT 0.6B v2 (local ASR), and injects text into the active window. This is the **macOS version** optimized for Apple Silicon (M1/M2/M3) and Intel Macs.

## Development Commands

```bash
# First-time setup (installs all dependencies)
chmod +x setup.sh && ./setup.sh

# Or manual installation:
npm run install:all

# Run all three servers together (recommended)
npm run dev

# Run individually:
npm run dev:backend     # FastAPI on :8000
npm run dev:frontend    # Vite on :5173
npm run dev:electron    # Electron (waits for :5173)

# Linting and type checking
npm run lint            # ESLint (frontend)
npm run typecheck       # TypeScript check (frontend)

# Backend tests
npm run test

# Production build
npm run dist            # Creates DMG for macOS
```

## Architecture

### Three-Process Model
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Electron Main  │────▶│  FastAPI Backend │◀────│  React Frontend │
│  (app/main.ts)  │     │  (backend/)      │     │  (frontend/)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
      │                        │
      │ FFmpeg subprocess      │ NeMo ASR (MPS/CPU)
      │ WebSocket streaming    │ SQLite database
      │ Global hotkey (uiohook)│ Text processing pipeline
```

### Data Flow
1. **Hotkey DOWN** → Electron starts FFmpeg audio capture + WebSocket to backend
2. **Audio streaming** → FFmpeg → Electron main process → WebSocket → FastAPI
3. **Transcription** → NeMo Parakeet model processes audio chunks (MPS or CPU)
4. **Hotkey UP** → Stop recording, receive final text
5. **Text injection** → Electron injects text via AppleScript keystroke

### Backend Structure (Modular)
- `routers/` - API endpoints (transcription, settings, modes, export, snippets, health)
- `services/` - Business logic (transcription_service, ai_polish_service, text_cleanup_service, dictionary_service)
- `database.py` - SQLAlchemy models (Transcription, UserSettings, Mode)

### Frontend Structure
- `src/renderer/components/` - React components (Dashboard, Recorder, History, Settings, Dictionary, Snippets)
- `src/renderer/hooks/` - Custom React hooks
- `src/renderer/services/` - API communication layer
- State management: Zustand

### Electron Structure
- `app/main.ts` - Main process (hotkey, FFmpeg, WebSocket, text injection)
- `app/preload.ts` - Context bridge for secure IPC
- `app/platform/` - macOS-specific text injection (AppleScript keystroke)

## Key Technical Details

### macOS-Specific Differences from Windows

| Feature | macOS | Windows |
|---------|-------|---------|
| GPU Acceleration | MPS (Metal) or CPU | CUDA |
| Audio Capture | FFmpeg avfoundation | FFmpeg dshow |
| Text Injection | AppleScript keystroke | SendInput/WM_CHAR |
| Active Window Detection | AppleScript System Events | Win32 API |
| Default Hotkey | Command+Shift+S | Ctrl+Alt |
| FFmpeg Location | Homebrew (/opt/homebrew/bin) | Bundled exe |

### Communication
- **WebSocket** `ws://127.0.0.1:8000/api/ws/transcribe` - Audio streaming with token auth
- **REST API** - `/api/settings`, `/api/transcriptions`, `/api/modes`, `/api/export`
- **IPC** - Electron main ↔ renderer (start-recording, stop-recording, text-injected)

### Audio Pipeline
- Sample rate: 16000 Hz
- FFmpeg captures audio using `avfoundation` (macOS audio framework)
- Main process buffers and forwards to WebSocket
- Backend feeds to NeMo model for real-time transcription

### Text Processing Pipeline
1. Raw transcription from NeMo
2. Text cleanup (remove filler words)
3. Personal dictionary mapping
4. Snippet expansion
5. AI polish (Claude API, optional)
6. Save to SQLite

### Security
- Backend binds to `127.0.0.1` only (no external access)
- CORS restricted to localhost origins
- WebSocket token-based authentication

## Database Schema

Three main tables:
- `transcriptions` - Raw/polished text, duration, mode_id, timestamps
- `user_settings` - Tone, personal dictionary, hotkey, language
- `modes` - Processing profiles (formal, casual, technical) with custom system prompts

## Ports

- Frontend (Vite): `http://localhost:5173`
- Backend (FastAPI): `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`

## Production Build Output

- `app/release/Voice-Flow-X.X.X-arm64.dmg` - Apple Silicon DMG
- `app/release/Voice-Flow-X.X.X-x64.dmg` - Intel Mac DMG

## macOS Permissions Required

The app requires these permissions (grant in System Preferences > Security & Privacy > Privacy):

1. **Accessibility** - For AppleScript text injection
2. **Microphone** - For audio recording
3. **Automation** - For controlling other apps via AppleScript

## GPU Support

- **Apple Silicon (M1/M2/M3)**: Uses MPS (Metal Performance Shaders) for GPU acceleration
- **Intel Macs**: Falls back to CPU (no CUDA on macOS)

To check GPU availability:
```python
import torch
print(f"MPS available: {torch.backends.mps.is_available()}")
```

## Critical Dependencies & Fixes

### NumPy Version
**IMPORTANT**: Must use NumPy < 2.0 for NeMo compatibility:
```bash
pip install "numpy<2.0"
```
NumPy 2.0+ breaks NeMo with `np.sctypes was removed` error.

### FFmpeg
FFmpeg must be installed via Homebrew and accessible in PATH:
```bash
brew install ffmpeg
```

## Project Structure

Code is organized by platform:
```
Voice-Flow/
├── mac/               # macOS-specific code
│   ├── app/          # Electron
│   ├── backend/      # FastAPI + NeMo (MPS/CPU)
│   └── frontend/     # React + Vite
├── windows/          # Windows setup
└── .gitignore
```

## Troubleshooting

### FFmpeg not found
```bash
brew install ffmpeg
```

### Accessibility permission error
Grant Terminal/iTerm accessibility access in:
System Preferences > Security & Privacy > Privacy > Accessibility

### Model download fails
The NeMo model downloads on first run. Ensure you have:
- Stable internet connection
- ~1GB free disk space

### MPS not working on Apple Silicon
If MPS fails, the app will fall back to CPU automatically. Check MPS status:
```python
import torch
print(f"MPS available: {torch.backends.mps.is_available()}")
print(f"MPS built: {torch.backends.mps.is_built()}")
```
