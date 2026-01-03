# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice-Flow is a desktop voice transcription application that captures audio via global hotkey, transcribes using NVIDIA Parakeet TDT 0.6B v2 (local ASR), and injects text into the active window.

## Project Structure

This project uses a **shared backend** for both platforms:

```
Voice-Flow/
├── backend/          # SHARED FastAPI backend (works on Windows, macOS, Linux)
│   ├── routers/     # API endpoints
│   ├── services/    # Business logic
│   └── database.py  # SQLAlchemy models
├── windows/         # Windows-specific code
│   ├── app/        # Electron (Windows)
│   └── frontend/   # React + Vite
└── mac/            # macOS-specific code
    ├── app/        # Electron (macOS)
    └── frontend/   # React + Vite
```

**Backend:** Cross-platform, auto-detects CUDA (Windows/Linux), MPS (Apple Silicon), or CPU
**Frontend/Electron:** Platform-specific (different hotkeys, text injection methods)

**IMPORTANT:** When working on platform-specific code, always read the platform's CLAUDE.md for detailed instructions.

## Quick Start

### Windows
```bash
# Install backend (one-time)
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Install and run
cd ../windows
npm run install:all
npm run dev
```

### macOS
```bash
# Install backend (one-time)
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

# Install and run
cd ../mac
npm run install:all
npm run dev
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Electron Main  │────▶│  FastAPI Backend │◀────│  React Frontend │
│  (hotkey, audio)│     │  (NeMo ASR, DB)  │     │  (UI, dashboard)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Data Flow:** Hotkey → FFmpeg audio capture → WebSocket → NeMo transcription → Text injection

## Key Differences by Platform

| Feature | Windows | macOS |
|---------|---------|-------|
| GPU | CUDA | MPS (Metal) or CPU |
| Audio Capture | dshow | avfoundation |
| Text Injection | SendInput API | AppleScript |
| FFmpeg | Bundled `.exe` | Homebrew |
| Backend Port | 8001 | 8000 |

## Critical: NumPy Version

**Must use NumPy < 2.0** for NeMo compatibility:
```bash
pip install "numpy<2.0"
```

## Ports

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8001` (Windows) or `http://localhost:8000` (macOS)
- API Docs: `http://localhost:8001/docs` (Windows) or `http://localhost:8000/docs` (macOS)

## Known Issues & Critical Warnings

### Killing Processes - IMPORTANT

**DO NOT kill Python or Node processes broadly!** Claude Code uses Python and Node.

**Safe cleanup - ONLY kill Electron:**
```bash
# Windows: Kill only Electron (the app)
taskkill /F /IM electron.exe 2>nul

# macOS: Kill only Electron
killall Electron

# NEVER do these (kills Claude Code too):
# taskkill /F /IM python.exe  ❌ WRONG (Windows)
# taskkill /F /IM node.exe    ❌ WRONG (Windows)
# killall python3             ❌ WRONG (macOS)
# killall node                ❌ WRONG (macOS)
```

If you need to stop the backend, kill only the specific PID on port 8000/8001:
```bash
# Windows
netstat -ano | findstr ":8001"
taskkill /F /PID <specific_pid>

# macOS
lsof -ti:8000 | xargs kill -9
```

## Common Development Commands

All commands should be run from the platform directory (`windows/` or `mac/`):

```bash
# Install all dependencies
npm run install:all

# Run all three servers together (recommended)
npm run dev

# Run individually
npm run dev:backend     # FastAPI
npm run dev:frontend    # Vite
npm run dev:electron    # Electron

# Linting and type checking
npm run lint            # ESLint (frontend)
npm run typecheck       # TypeScript check (frontend)

# Production build
# Windows: .\build.ps1
# macOS:   npm run dist
```

## Database Schema

Three main SQLite tables:
- `transcriptions` - Raw/polished text, duration, mode_id, timestamps
- `user_settings` - Tone, personal dictionary, hotkey, language
- `modes` - Processing profiles (formal, casual, technical) with custom system prompts

## Text Processing Pipeline

1. Raw transcription from NeMo
2. Text cleanup (remove filler words)
3. Personal dictionary mapping
4. Snippet expansion
5. AI polish (Claude API, optional)
6. Save to SQLite

## Security

- Backend binds to `127.0.0.1` only (no external access)
- CORS restricted to localhost origins
- WebSocket token-based authentication
