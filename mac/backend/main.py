"""
Voice-Flow API - Main Application (macOS)
Refactored modular backend using FastAPI routers and services
Supports MPS (Apple Silicon) and CPU
"""
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
from routers.export import router as export_router
from routers.snippets import router as snippets_router
from routers.modes import router as modes_router

# Import services
from services.transcription_service import transcription_service, DEVICE
from services.rate_limiter import rate_limiter, RateLimiter
from services.dictionary_service import validate_dictionary_entry

# Import database
from database import Base, engine, SessionLocal, seed_default_modes

# Import logging
from logging_config import setup_logging, get_logger

# Initialize logging
logger = setup_logging(log_level="INFO")
transcribe_log = get_logger("transcribe")
ws_log = get_logger("websocket")
db_log = get_logger("database")


# ============== LIFESPAN ==============
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""

    # Startup
    Base.metadata.create_all(bind=engine)
    print("[OK] Database initialized")

    # Seed default modes
    with SessionLocal() as db:
        seed_default_modes(db)

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
# SECURITY: Restrict to localhost origins only (Electron dev and production)
ALLOWED_ORIGINS = [
    "http://localhost:5173",      # Vite dev server
    "http://localhost:8000",      # Backend (for same-origin requests)
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
    "file://",                    # Electron file:// protocol
    "app://.",                    # Electron custom protocol
]


# ============== APP ==============
app = FastAPI(
    title="Voice-Flow API (macOS)",
    description="Backend API for Voice-Flow desktop application - macOS version",
    version="0.3.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ============== REGISTER ROUTERS ==============
app.include_router(health_router)
app.include_router(transcription_router)
app.include_router(settings_router)
app.include_router(export_router)
app.include_router(snippets_router)
app.include_router(modes_router)


# ============== RUN SERVER ==============
if __name__ == "__main__":
    import uvicorn
    print("[Voice-Flow] Starting backend server on http://localhost:8000")
    # SECURITY: Bind to localhost only - prevents external network access
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
