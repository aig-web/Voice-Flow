"""
Health and Status Router
Endpoints for API health checks and status
"""
from fastapi import APIRouter
import torch
from datetime import datetime

from services.transcription_service import transcription_service, DEVICE

router = APIRouter(tags=["health"])


@router.get("/")
async def root():
    """Root endpoint - API status check"""
    return {
        "message": "Voice-Flow API is running",
        "status": "ok",
        "version": "0.3.0",
        "engine": "parakeet-tdt-0.6b-v2",
        "device": DEVICE
    }


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": "parakeet-tdt-0.6b-v2",
        "device": DEVICE,
        "model_loaded": transcription_service.is_model_loaded(),
        "cuda_available": torch.cuda.is_available()
    }


@router.get("/api/test")
async def test_endpoint():
    """Test endpoint for frontend integration"""
    return {
        "message": "Backend connection successful",
        "data": {"test": True}
    }


@router.get("/api/server-stats")
async def get_server_stats():
    """Get server statistics for monitoring active sessions"""
    from routers.transcription import active_sessions

    return {
        "status": "running",
        "active_connections": len(active_sessions),
        "sessions": [
            {
                "id": sid,
                "ip": info["ip"],
                "connected_at": info["started"].isoformat(),
                "duration_seconds": (datetime.now() - info["started"]).total_seconds()
            }
            for sid, info in active_sessions.items()
        ]
    }
