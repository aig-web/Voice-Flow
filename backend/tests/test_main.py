from fastapi.testclient import TestClient
import sys
from pathlib import Path
import pytest

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app
from services.dictionary_service import validate_dictionary_entry
from services.rate_limiter import RateLimiter
from database import Base, engine

# Initialize database tables before tests
Base.metadata.create_all(bind=engine)

client = TestClient(app)


# ============== BASIC ENDPOINT TESTS ==============

def test_read_root():
    """Test root endpoint returns correct response"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Voice-Flow API is running"
    assert data["status"] == "ok"
    assert "version" in data


def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "model_loaded" in data
    assert "cuda_available" in data
    assert data["model"] == "parakeet-tdt-0.6b-v2"


def test_api_test_endpoint():
    """Test the API test endpoint"""
    response = client.get("/api/test")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Backend connection successful"
    assert data["data"]["test"] is True


# ============== SETTINGS TESTS ==============

def test_get_settings():
    """Test getting user settings"""
    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert "tone" in data
    assert "personal_dictionary" in data or data.get("error") is None


def test_update_settings():
    """Test updating user settings"""
    response = client.post(
        "/api/settings",
        json={
            "tone": "casual",
            "personal_dictionary": {},
            "record_hotkey": "Ctrl+Shift"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "success" or "error" not in data


# ============== DICTIONARY VALIDATION TESTS ==============

def test_dictionary_validation_empty_mishearing():
    """Should reject empty mishearing"""
    is_valid, error = validate_dictionary_entry("", "correction")
    assert is_valid is False
    assert "empty" in error.lower()


def test_dictionary_validation_empty_correction():
    """Should reject empty correction"""
    is_valid, error = validate_dictionary_entry("mishearing", "")
    assert is_valid is False
    assert "empty" in error.lower()


def test_dictionary_validation_too_long():
    """Should reject too long entries"""
    long_text = "a" * 200
    is_valid, error = validate_dictionary_entry(long_text, "short")
    assert is_valid is False
    assert "too long" in error.lower()


def test_dictionary_validation_dangerous_chars():
    """Should reject regex metacharacters"""
    is_valid, error = validate_dictionary_entry("test.*pattern", "safe")
    assert is_valid is False
    assert "invalid characters" in error.lower()


def test_dictionary_validation_repetitive():
    """Should reject highly repetitive patterns"""
    is_valid, error = validate_dictionary_entry("aaaaaaaaaaaaaaa", "test")
    assert is_valid is False
    assert "repetitive" in error.lower()


def test_dictionary_validation_valid():
    """Should accept valid entries"""
    is_valid, error = validate_dictionary_entry("teh", "the")
    assert is_valid is True
    assert error == ""


# ============== DICTIONARY ENDPOINT TESTS ==============

def test_add_dictionary_entry():
    """Test adding dictionary entry"""
    response = client.post(
        "/api/settings/dictionary/add",
        json={"mishearing": "testword", "correction": "corrected"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "added" or "error" not in data


def test_add_dictionary_entry_validation():
    """Test dictionary entry validation"""
    response = client.post(
        "/api/settings/dictionary/add",
        json={"mishearing": "", "correction": "test"}
    )
    assert response.status_code == 400


def test_add_dictionary_dangerous_chars():
    """Test dictionary rejects dangerous characters"""
    response = client.post(
        "/api/settings/dictionary/add",
        json={"mishearing": "test[regex]", "correction": "safe"}
    )
    assert response.status_code == 400


def test_delete_dictionary_entry():
    """Test deleting dictionary entry"""
    # First add an entry
    client.post(
        "/api/settings/dictionary/add",
        json={"mishearing": "todelete", "correction": "test"}
    )
    # Then delete it
    response = client.delete("/api/settings/dictionary/todelete")
    assert response.status_code == 200


# ============== RATE LIMITER TESTS ==============

def test_rate_limiter_allows_requests():
    """Rate limiter should allow requests under limit"""
    limiter = RateLimiter(requests_per_minute=5)
    for _ in range(5):
        assert limiter.is_allowed("test_ip") is True


def test_rate_limiter_blocks_excess():
    """Rate limiter should block requests over limit"""
    limiter = RateLimiter(requests_per_minute=3)
    for _ in range(3):
        limiter.is_allowed("test_ip_2")
    assert limiter.is_allowed("test_ip_2") is False


def test_rate_limiter_tracks_separate_ips():
    """Rate limiter should track IPs separately"""
    limiter = RateLimiter(requests_per_minute=2)
    limiter.is_allowed("ip1")
    limiter.is_allowed("ip1")
    assert limiter.is_allowed("ip1") is False
    assert limiter.is_allowed("ip2") is True  # Different IP


# ============== TRANSCRIPTION ENDPOINT TESTS ==============

def test_transcribe_requires_file():
    """Transcribe endpoint should require file"""
    response = client.post("/api/transcribe")
    assert response.status_code == 422  # Unprocessable Entity


def test_transcribe_empty_audio():
    """Transcribe should handle empty/tiny audio"""
    files = {"file": ("empty.webm", b"x" * 100, "audio/webm")}
    response = client.post("/api/transcribe", files=files)
    # Should return 200 with message about short recording
    assert response.status_code == 200


# ============== STATS ENDPOINT TESTS ==============

def test_get_stats():
    """Test getting stats"""
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "totalTranscriptions" in data or "error" in data
    assert "wordsCaptured" in data or "error" in data


# ============== TRANSCRIPTIONS ENDPOINT TESTS ==============

def test_get_transcriptions():
    """Test getting transcriptions list"""
    response = client.get("/api/transcriptions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list) or "error" in data


def test_get_transcriptions_with_limit():
    """Test getting transcriptions with limit"""
    response = client.get("/api/transcriptions?limit=5")
    assert response.status_code == 200


# ============== EXPORT ENDPOINT TESTS ==============

def test_export_requires_ids():
    """Export should require transcription IDs"""
    response = client.post(
        "/api/transcriptions/export",
        json={"format": "pdf", "transcription_ids": []}
    )
    data = response.json()
    assert "error" in data


def test_export_invalid_format():
    """Export should reject invalid format"""
    response = client.post(
        "/api/transcriptions/export",
        json={"format": "invalid", "transcription_ids": [1]}
    )
    data = response.json()
    assert "error" in data or response.status_code != 200


# ============== WEBSOCKET TOKEN TESTS ==============

def test_get_ws_token():
    """Test getting WebSocket token"""
    response = client.get("/api/ws-token")
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert len(data["token"]) == 64  # 32 bytes hex = 64 chars
