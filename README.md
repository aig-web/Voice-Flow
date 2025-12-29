# Stop Typing

AI-powered voice transcription desktop application. Speak instead of typing - 3x faster!

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + TypeScript
- **Desktop**: Electron (cross-platform: Windows, macOS, Linux)
- **Backend**: Python FastAPI + NVIDIA Parakeet TDT 0.6B v2 (local ASR)
- **Database**: SQLite
- **Features**: Global hotkey recording, AI text polishing, dark mode

## Project Structure

```
Stop-Typing/
├── package.json        # Root scripts (dev, install)
├── frontend/           # React + Vite frontend
│   ├── src/renderer/   # React components
│   ├── vite.config.ts
│   └── package.json
├── backend/            # Python FastAPI backend
│   ├── main.py
│   ├── database.py
│   ├── requirements.txt      # Windows (CUDA)
│   └── requirements-mac.txt  # macOS (MPS/CPU)
└── app/                # Electron desktop app
    ├── main.ts
    └── package.json
```

---

## Quick Start (Windows with NVIDIA GPU)

### Prerequisites
- Node.js 18+
- Python 3.10+
- NVIDIA GPU with CUDA 12.1+
- FFmpeg

### 1. Install Dependencies

```bash
# Install Node dependencies
npm run install:all

# Setup Python backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run Development

```bash
# Terminal 1 - Backend (port 8000)
cd backend
venv\Scripts\activate
uvicorn main:app --reload

# Terminal 2 - Frontend (port 5173)
cd frontend
npm run dev

# Terminal 3 - Electron app
cd app
npm run dev
```

---

## Quick Start (macOS)

### Prerequisites
- Node.js 18+ (install via Homebrew: `brew install node`)
- Python 3.10+ (install via Homebrew: `brew install python@3.10`)
- FFmpeg (install via Homebrew: `brew install ffmpeg`)
- Xcode Command Line Tools: `xcode-select --install`

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/aig-web/Voice-Flow.git
cd Voice-Flow

# Install Node dependencies (root + frontend + electron)
npm run install:all
```

### 2. Setup Python Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install macOS-specific requirements
pip install -r requirements-mac.txt
```

**Note for Apple Silicon (M1/M2/M3):** PyTorch will automatically use Metal Performance Shaders (MPS) for GPU acceleration. The first transcription may take longer as the model downloads (~600MB).

### 3. Run the Application

Open 3 terminal windows:

**Terminal 1 - Backend:**
```bash
cd Voice-Flow/backend
source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd Voice-Flow/frontend
npm run dev
```

**Terminal 3 - Electron App:**
```bash
cd Voice-Flow/app
npm run dev
```

### 4. Using the App

1. The app window will open automatically
2. Press and hold **Alt + C** (or **Option + C** on Mac) to record
3. Release to stop recording - text will be transcribed and copied to clipboard
4. Paste anywhere!

---

## Configuration

### Change Hotkey

Go to **Settings** in the app to change the recording hotkey.

### Environment Variables

Create `.env` files if needed:

```bash
# backend/.env
DATABASE_URL=sqlite:///./voiceflow.db

# frontend/.env
VITE_API_URL=http://localhost:8000
```

---

## Troubleshooting

### macOS: "Permission denied" errors
```bash
chmod +x venv/bin/activate
```

### macOS: FFmpeg not found
```bash
brew install ffmpeg
```

### macOS: Python not found
```bash
brew install python@3.10
# Add to PATH if needed
export PATH="/opt/homebrew/bin:$PATH"
```

### Model download slow
The Parakeet model (~600MB) downloads on first run. Be patient!

### Apple Silicon: MPS errors
Try forcing CPU mode by setting in `backend/services/transcription_service.py`:
```python
device = "cpu"  # Instead of "mps"
```

---

## Building for Production

### macOS DMG
```bash
cd app
npm run build
npm run dist:mac
```

### Windows EXE
```bash
cd app
npm run build
npm run dist:win
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transcriptions` | GET | List all transcriptions |
| `/api/transcriptions` | POST | Create transcription |
| `/api/transcriptions/{id}` | DELETE | Delete transcription |
| `/api/settings` | GET/PUT | App settings |
| `/api/stats` | GET | Usage statistics |
| `/health` | GET | Health check |

API Docs: http://localhost:8000/docs

---

## License

MIT
