# Voice-Flow Build Instructions

This guide explains how to build the standalone Voice-Flow installer (.exe) that bundles both the Electron app and Python backend.

## Prerequisites

### Required Software
1. **Node.js** (v18 or higher) - https://nodejs.org/
2. **Python** (3.10 or higher) - https://www.python.org/
3. **FFmpeg** - Already included in the project

### API Key Setup (CRITICAL!)
Before building, you MUST add your Speechmatics API key:

1. Open `backend/main.py`
2. Find this line:
   ```python
   HARDCODED_SPEECHMATICS_KEY = "YOUR_SPEECHMATICS_API_KEY_HERE"
   ```
3. Replace `YOUR_SPEECHMATICS_API_KEY_HERE` with your actual API key
4. Save the file

## Quick Build (PowerShell)

Run the all-in-one build script:

```powershell
# Full build (recommended first time)
.\build.ps1

# Clean build (removes all previous artifacts)
.\build.ps1 -Clean

# Skip specific steps
.\build.ps1 -SkipBackend    # Skip Python build
.\build.ps1 -SkipFrontend   # Skip React build
.\build.ps1 -SkipElectron   # Skip Electron packaging
```

## Manual Build Steps

### Step 1: Build Python Backend

```powershell
cd backend

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
pip install pyinstaller

# Build executable
pyinstaller build_engine.spec --noconfirm

# Output: backend/dist/voice-engine.exe
```

### Step 2: Build Frontend

```powershell
cd frontend

# Install dependencies
npm install

# Build for production
npm run build

# Output: dist/ (copied to project root)
```

### Step 3: Build Electron App

```powershell
cd app

# Install dependencies (including electron-builder)
npm install

# Compile TypeScript
npm run build

# Build installer
npm run dist:win

# Output: app/release/Voice-Flow-Setup-1.0.0.exe
```

## Output Files

After a successful build, you'll find:

| File | Location | Description |
|------|----------|-------------|
| `voice-engine.exe` | `backend/dist/` | Python backend (FastAPI server) |
| `index.html` | `dist/` | Built frontend assets |
| `Voice-Flow-Setup-1.0.0.exe` | `app/release/` | Final installer |

## What's Inside the Installer

The NSIS installer bundles:
- **Electron App** - The main desktop application
- **voice-engine.exe** - Python backend (auto-starts with the app)
- **ffmpeg.exe** - Audio conversion tool
- **Frontend Assets** - React/Vite built files

## Distribution

### Sharing with Friends
1. Copy `Voice-Flow-Setup-1.0.0.exe` from `app/release/`
2. Share via USB, cloud storage, or any file sharing method
3. Recipients just double-click to install!

### What Users Get
- One-click installation
- Desktop shortcut
- Start menu entry
- Everything bundled - no separate installs needed!

## Troubleshooting

### "voice-engine.exe not found"
- Make sure Step 1 (Python build) completed successfully
- Check that `backend/dist/voice-engine.exe` exists

### "ffmpeg not found"
- Verify `ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe` exists in project root
- The build script expects FFmpeg at this exact location

### "API key not configured"
- Edit `backend/main.py` and add your Speechmatics API key
- Rebuild the Python backend

### Installer is too large
- The installer includes Python runtime (~50MB) - this is normal
- FFmpeg adds ~100MB - also normal
- Total installer size: approximately 150-200MB

## Development vs Production

| Mode | Backend | How to Run |
|------|---------|------------|
| Development | Manual (`uvicorn main:app --reload`) | `npm run dev` in both `frontend/` and `app/` |
| Production | Auto-spawned by Electron | Run the installed `.exe` |

The Electron app automatically detects whether it's running in dev or production mode:
- **Dev mode**: Expects backend at `localhost:8000` (start manually)
- **Production**: Spawns `voice-engine.exe` automatically

## Version Bumping

To release a new version:

1. Update version in `app/package.json`:
   ```json
   "version": "1.1.0"
   ```

2. Rebuild:
   ```powershell
   .\build.ps1
   ```

3. New installer: `Voice-Flow-Setup-1.1.0.exe`
