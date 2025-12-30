"""
Health and Status Router - macOS
Endpoints for API health checks and status
"""
from fastapi import APIRouter
import torch

from services.transcription_service import transcription_service, DEVICE

router = APIRouter(tags=["health"])


@router.get("/")
async def root():
    """Root endpoint - API status check"""
    return {
        "message": "Voice-Flow API is running (macOS)",
        "status": "ok",
        "version": "0.3.0",
        "engine": "parakeet-tdt-0.6b-v2",
        "device": DEVICE,
        "platform": "macOS"
    }


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    # Check MPS availability for Apple Silicon
    mps_available = hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()

    return {
        "status": "healthy",
        "model": "parakeet-tdt-0.6b-v2",
        "device": DEVICE,
        "model_loaded": transcription_service.is_model_loaded(),
        "mps_available": mps_available,
        "cuda_available": False,  # macOS doesn't support CUDA
        "platform": "macOS"
    }


@router.get("/api/test")
async def test_endpoint():
    """Test endpoint for frontend integration"""
    return {
        "message": "Backend connection successful",
        "data": {"test": True}
    }
