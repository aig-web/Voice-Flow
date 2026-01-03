"""
Authentication Service
WebSocket token-based authentication for streaming transcription
"""
import secrets


class AuthService:
    """Simple token-based authentication for WebSocket connections"""

    def __init__(self):
        # Generate a session token on startup (valid for this server instance)
        self._token = secrets.token_hex(32)

    def generate_token(self) -> str:
        """Generate a WebSocket authentication token"""
        return self._token

    def verify_token(self, token: str) -> bool:
        """Verify a WebSocket authentication token"""
        return secrets.compare_digest(token, self._token)


# Global auth service instance
auth_service = AuthService()
