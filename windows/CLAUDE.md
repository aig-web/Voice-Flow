# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice-Flow is a desktop voice transcription application that captures audio via global hotkey, transcribes using NVIDIA Parakeet TDT 0.6B v2 (local GPU ASR), and injects text into the active window.

## Development Commands

```bash
# Install all dependencies (root + frontend + electron)
npm run install:all

# Backend setup (first time only)
cd backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt

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
cd backend && pytest

# Production build
.\build.ps1             # PowerShell (full build)
.\build.ps1 -Clean      # Clean build
```

## Architecture

### Three-Process Model
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Electron Main  │────▶│  FastAPI Backend │◀────│  React Frontend │
│  (app/main.ts)  │     │  (backend/)      │     │  (frontend/)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
      │                        │
      │ FFmpeg subprocess      │ NeMo ASR (GPU)
      │ WebSocket streaming    │ SQLite database
      │ Global hotkey (uiohook)│ Text processing pipeline
```

### Data Flow
1. **Hotkey DOWN** → Electron starts FFmpeg audio capture + WebSocket to backend
2. **Audio streaming** → FFmpeg → Electron main process → WebSocket → FastAPI
3. **Transcription** → NeMo Parakeet model processes audio chunks
4. **Hotkey UP** → Stop recording, receive final text
5. **Text injection** → Electron injects text into active window (platform-specific)

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
- `app/platform/` - OS-specific text injection (Windows, macOS, Linux)

## Key Technical Details

### Communication
- **WebSocket** `ws://127.0.0.1:8000/api/ws/transcribe` - Audio streaming with token auth
- **REST API** - `/api/settings`, `/api/transcriptions`, `/api/modes`, `/api/export`
- **IPC** - Electron main ↔ renderer (start-recording, stop-recording, text-injected)

### Audio Pipeline
- Sample rate: 16000 Hz
- FFmpeg captures audio, streams to Electron main process
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

- `backend/dist/voice-engine.exe` - Bundled Python backend
- `app/release/Voice-Flow-Setup-X.X.X.exe` - NSIS installer

## Platform Notes

- Primary target: Windows
- FFmpeg bundled at `ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe`
- Requires NVIDIA GPU with CUDA 12.1 for optimal performance (falls back to CPU)

## Critical Dependencies & Fixes

### NumPy Version
**IMPORTANT**: Must use NumPy < 2.0 for NeMo compatibility:
```bash
pip install "numpy<2.0"
```
NumPy 2.0+ breaks NeMo with `np.sctypes was removed` error.

### NeMo Windows Fix
NeMo's `exp_manager.py` uses `signal.SIGKILL` which doesn't exist on Windows. Fix applied:
```python
# In venv/Lib/site-packages/nemo/utils/exp_manager.py line 170
rank_termination_signal: signal.Signals = getattr(signal, 'SIGKILL', getattr(signal, 'SIGTERM', None))
```

### FFmpeg PATH
FFmpeg path must be added to PATH before importing pydub/NeMo. Done in `backend/main.py`:
```python
ffmpeg_dir = os.path.join(base_path, 'ffmpeg-master-latest-win64-gpl', 'bin')
os.environ['PATH'] = ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
```

## Project Structure

Code is organized by platform:
```
Voice-Flow/
├── windows/           # Windows-specific code
│   ├── app/          # Electron
│   ├── backend/      # FastAPI + NeMo
│   ├── frontend/     # React + Vite
│   └── ffmpeg-master-latest-win64-gpl/
├── mac/              # macOS setup scripts
└── .gitignore
```
