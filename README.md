# Voice-Flow

AI-powered voice transcription desktop application.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + TypeScript
- **Desktop**: Electron (cross-platform)
- **Backend**: Python FastAPI + NVIDIA Parakeet TDT 0.6B v2 (local GPU ASR)
- **Database**: SQLite
- **Features**: Real-time WebSocket streaming, global hotkey recording, text injection

## Project Structure

```
Voice-Flow/
├── package.json        # Root scripts (dev, install)
├── frontend/           # React + Vite frontend
│   ├── src/renderer/   # React components
│   ├── vite.config.ts
│   └── package.json
├── backend/            # Python FastAPI backend
│   ├── main.py
│   ├── database.py
│   └── venv/
└── app/                # Electron entry (future)
```

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- NVIDIA GPU with CUDA support (for Parakeet ASR model)
- FFmpeg (for audio conversion)

### 1. Install Dependencies

```bash
# Install root + frontend dependencies
npm run install:all

# Setup Python backend (first time only)
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy env files
cp .env.example .env
cp backend/.env.example backend/.env
```

Configure environment (optional, defaults work for local development):
```
# Frontend URL for CORS
VITE_API_URL=http://localhost:8000
```

### 3. Run Development Servers

```bash
# Run both frontend + backend together
npm run dev
```

Or run separately:
```bash
# Terminal 1 - Backend (port 8000)
npm run dev:backend

# Terminal 2 - Frontend (port 5173)
npm run dev:frontend
```

### Access the App

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run backend + frontend together |
| `npm run dev:frontend` | Run frontend only (Vite) |
| `npm run dev:backend` | Run backend only (FastAPI) |
| `npm run install:all` | Install all dependencies |
| `npm run build:frontend` | Build frontend for production |

## License

MIT
