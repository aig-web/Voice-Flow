# Voice-Flow Network Deployment Guide

## Architecture
```
┌──────────────────┐         ┌──────────────────┐
│  Server Laptop   │         │  Client Laptop 1 │
│  (Your Machine)  │◄───────►│  (Electron Only) │
│                  │         └──────────────────┘
│  - Backend API   │
│  - GPU (CUDA)    │         ┌──────────────────┐
│  - Port 8001     │◄───────►│  Client Laptop 2 │
└──────────────────┘         │  (Electron Only) │
                             └──────────────────┘
```

## Quick Start

### 1️⃣ Server Laptop (Your Machine with GPU)

**Run ONLY the backend:**

```powershell
cd E:\Yash\PROJECTS\Voice-flow\windows

# Start backend server (accessible on network)
npm run dev:backend

# Find your server IP
ipconfig
# Look for "IPv4 Address" - e.g., 192.168.1.100
```

**Allow firewall:**
```powershell
netsh advfirewall firewall add rule name="Voice-Flow Backend" dir=in action=allow protocol=TCP localport=8001
```

---

### 2️⃣ Client Laptops (Other Machines)

**Set server IP and run Electron:**

**Windows Client:**
```powershell
cd path\to\Voice-flow\windows

# Set server IP (replace with your server's IP)
$env:VITE_API_URL="http://192.168.1.100:8001"

# Run Electron app only (no backend)
npm run dev:electron
```

**Mac Client:**
```bash
cd path/to/Voice-flow/mac

# Set server IP (replace with your server's IP)
export VITE_API_URL="http://192.168.1.100:8001"

# Run Electron app only (no backend)
npm run dev:electron
```

---

## Local Development (Single Machine)

**Windows:**
```powershell
cd E:\Yash\PROJECTS\Voice-flow\windows
npm run dev  # Runs backend + frontend + electron together
```

**Mac:**
```bash
cd /path/to/Voice-flow/mac
npm run dev  # Runs backend + frontend + electron together
```

Default: Connects to `http://127.0.0.1:8001` (localhost)

---

## Production Build

### Server Laptop
Just run the backend:
```powershell
cd E:\Yash\PROJECTS\Voice-flow\backend
.\venv\Scripts\python.exe main.py
```

### Client Laptops
Build and distribute the Electron app:

**Windows:**
```powershell
cd windows
$env:VITE_API_URL="http://192.168.1.100:8001"
npm run dist:win
# Share: windows/app/release/Voice-Flow-Setup-X.X.X.exe
```

**Mac:**
```bash
cd mac
export VITE_API_URL="http://192.168.1.100:8001"
npm run dist:mac
# Share: mac/app/release/Voice-Flow-X.X.X.dmg
```

---

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://127.0.0.1:8001` | Backend server URL |
| `BACKEND_HOST` | `0.0.0.0` | Server bind address |
| `BACKEND_PORT` | `8001` | Server port |

### Server Configuration

**Backend `.env` file** (optional):
```bash
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8001
```

---

## Troubleshooting

### ❌ "Connection Refused"
- Check server IP is correct
- Verify backend is running: `netstat -ano | findstr :8001`
- Check Windows Firewall allows port 8001
- Ensure both machines are on same network

### ❌ "CORS Error"
- Backend already allows all origins (`["*"]`) in testing mode
- No changes needed

### ❌ "Slow Transcription"
- Server laptop needs NVIDIA GPU with CUDA
- Check GPU usage: `nvidia-smi`
- Ensure backend is using GPU (check startup logs for "cuda:0")

---

## Security Notes

⚠️ **Current Setup: Testing Mode**
- No authentication
- CORS allows all origins
- Only use on trusted local networks

For production deployment with external access:
- Add authentication
- Configure CORS properly
- Use HTTPS/WSS
- Add rate limiting

---

## Logs

**Server logs:** Backend shows all transcription requests
**Client logs:** Electron console shows connection status

Check logs for:
```
[Voice-Flow] Connecting to backend: http://X.X.X.X:8001
[Voice-Flow] WebSocket URL: ws://X.X.X.X:8001
```
