# Stop Typing - macOS Setup Guide

Complete guide to run Stop Typing on macOS (Intel or Apple Silicon).

## Prerequisites

### 1. Install Homebrew (Package Manager)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Required Software

```bash
# Install Node.js, Python, and FFmpeg
brew install node python@3.10 ffmpeg

# Install Xcode Command Line Tools (required for native modules)
xcode-select --install
```

## Quick Setup (Automated)

Run the setup script:

```bash
# Make script executable
chmod +x setup-mac.sh

# Run setup
./setup-mac.sh
```

## Manual Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/aig-web/Voice-Flow.git
cd Voice-Flow
```

### Step 2: Install Node Dependencies

```bash
npm run install:all
```

### Step 3: Setup Python Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements-mac.txt
```

**Note:** First install may take 10-15 minutes as it downloads PyTorch and NeMo.

### Step 4: Configure Environment (Optional)

```bash
# Copy example env file
cp backend/.env.example backend/.env

# Edit if needed (default settings work fine)
nano backend/.env
```

## Running the App

### Option A: Run All Services Together

```bash
npm run dev:mac
```

### Option B: Run Services Separately (Recommended for Development)

Open 3 terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - Electron:**
```bash
cd app
npm run dev
```

## Using the App

1. **Press and hold** `Option + C` to start recording
2. **Speak** your text
3. **Release** the key to stop recording
4. Text is **automatically copied** to clipboard
5. **Paste** anywhere with `Cmd + V`

## Changing the Hotkey

1. Open the app
2. Go to **Settings** (gear icon)
3. Click on the hotkey field
4. Press your desired key combination
5. Click **Save**

## Troubleshooting

### "Permission denied" when running scripts

```bash
chmod +x setup-mac.sh start-mac.sh app/run-electron.sh
```

### Python not found

```bash
# Check if Python is installed
which python3

# If not found, install it
brew install python@3.10

# Add to PATH (for Apple Silicon Macs)
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### FFmpeg not found

```bash
brew install ffmpeg
```

### Microphone permission denied

1. Go to **System Preferences > Security & Privacy > Privacy > Microphone**
2. Add **Terminal** (or your terminal app) to the list
3. Restart the terminal

### Model download is slow

The Parakeet model (~600MB) downloads on first run. This is normal. Wait for it to complete.

### Apple Silicon: MPS errors

If you encounter MPS (Metal) errors on M1/M2/M3 Macs:

```bash
# Edit backend/.env
echo "DEVICE=cpu" >> backend/.env
```

Or edit `backend/services/transcription_service.py` and change:
```python
DEVICE = "cpu"  # Force CPU mode
```

### Port already in use

```bash
# Find process using port 8000
lsof -i :8000

# Kill it
kill -9 <PID>
```

## Building for Distribution

### Build DMG for macOS

```bash
cd app
npm run build
npm run dist:mac
```

The DMG file will be in `app/release/`.

## File Structure

```
Voice-Flow/
├── app/                    # Electron desktop app
│   ├── main.ts            # Main process
│   ├── preload.ts         # Preload script
│   └── package.json
├── backend/                # Python FastAPI backend
│   ├── main.py            # API server
│   ├── services/          # Business logic
│   ├── routers/           # API routes
│   ├── requirements-mac.txt
│   └── venv/              # Python virtual environment
├── frontend/               # React frontend
│   ├── src/renderer/      # React components
│   └── package.json
├── setup-mac.sh           # macOS setup script
├── start-mac.sh           # Start all services
└── README.md
```

## Support

If you encounter issues, please open an issue on GitHub with:
1. Your macOS version
2. Chip type (Intel or Apple Silicon)
3. Error message
4. Steps to reproduce
