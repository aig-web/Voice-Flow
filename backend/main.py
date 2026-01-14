"""
Voice-Flow API - Main Application (Cross-Platform)
Refactored modular backend using FastAPI routers and services
Supports Windows (CUDA), macOS (MPS/CPU), and Linux (CUDA/CPU)
"""
import os
import sys
import platform

# Detect platform
IS_WINDOWS = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"

# CUDA configuration (Windows/Linux only)
if IS_WINDOWS or IS_LINUX:
    # Disable CUDA graphs to support long recordings (10-15min like Wispr Flow)
    # This prevents "CUDA graph replay without capture" errors
    os.environ['CUDA_LAUNCH_BLOCKING'] = '1'  # Force synchronous execution (fixes CUDA graph errors)
    os.environ['NEMO_DISABLE_CUDAGRAPHS'] = '1'  # Explicitly disable CUDA graphs in NeMo
    os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'  # Better memory management

# Add ffmpeg to PATH (Windows only - Mac uses Homebrew)
if IS_WINDOWS:
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ffmpeg_dir = os.path.join(base_path, 'windows', 'ffmpeg-master-latest-win64-gpl', 'bin')
    if os.path.exists(ffmpeg_dir):
        os.environ['PATH'] = ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import routers
from routers.health import router as health_router
from routers.transcription import router as transcription_router
from routers.settings import router as settings_router
from routers.snippets import router as snippets_router
from routers.modes import router as modes_router
from routers.export import router as export_router

# Import services
from services.transcription_service import transcription_service, DEVICE
from services.firebase_auth import initialize_firebase
from database import init_db


# ============== LIFESPAN ==============
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""

    # Startup
    print("=" * 60)
    print("[Stop Typing] Backend Server - Testing Mode")
    print("[Stop Typing] NO AUTH | NO DATABASE | LOCAL NETWORK ONLY")
    print("=" * 60)

    # Initialize database
    try:
        init_db()
        print("[OK] Database initialized")
    except Exception as e:
        print(f"[ERROR] Failed to initialize database: {e}")

    # Initialize Firebase Authentication
    try:
        initialize_firebase()
    except Exception as e:
        print(f"[WARN] Firebase initialization skipped: {e}")

    # Load ASR model
    try:
        transcription_service.load_model()
        print(f"[OK] Parakeet ASR model ready on {DEVICE}")
    except Exception as e:
        print(f"[ERROR] Failed to load Parakeet model: {e}")
        import traceback
        traceback.print_exc()

    yield  # App is running

    # Shutdown
    transcription_service.unload_model()


# ============== CORS ==============
# TESTING MODE: Allow all origins for local network testing
ALLOWED_ORIGINS = ["*"]


# ============== APP ==============
app = FastAPI(
    title="Stop Typing API",
    description="Backend API for Stop Typing desktop application",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== REGISTER ROUTERS ==============
app.include_router(health_router)
app.include_router(transcription_router)
app.include_router(settings_router)
app.include_router(snippets_router)
app.include_router(modes_router)
app.include_router(export_router)


# ============== RUN SERVER ==============
if __name__ == "__main__":
    import uvicorn

    # Read from environment variables
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", "8001"))

    print("=" * 60)
    print(f"[Stop Typing] Starting server on http://{host}:{port}")
    print(f"[Stop Typing] Mode: TESTING (no auth, local network)")
    print(f"[Stop Typing] CORS: Allowing all origins")
    print("=" * 60)

    uvicorn.run(app, host=host, port=port, log_level="info")
