"""
Rate Limiter Service
Simple in-memory rate limiter with periodic cleanup to prevent memory leaks
"""
from collections import defaultdict
import time


class RateLimiter:
    """In-memory rate limiter with automatic cleanup"""

    def __init__(self, requests_per_minute: int = 30, cleanup_interval: int = 300):
        self.requests_per_minute = requests_per_minute
        self.requests: dict[str, list[float]] = defaultdict(list)
        self.last_cleanup = time.time()
        self.cleanup_interval = cleanup_interval  # Cleanup every 5 minutes

    def _cleanup_old_entries(self) -> None:
        """Remove entries for IPs that haven't made requests recently"""
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return

        minute_ago = now - 60
        # Remove IPs with no recent requests
        empty_ips = [ip for ip, times in self.requests.items()
                     if not times or max(times) < minute_ago]
        for ip in empty_ips:
            del self.requests[ip]

        self.last_cleanup = now

    def is_allowed(self, client_ip: str) -> bool:
        """Check if request from this IP is allowed"""
        now = time.time()
        minute_ago = now - 60

        # Periodic cleanup to prevent memory leak
        self._cleanup_old_entries()

        # Clean old requests for this IP
        self.requests[client_ip] = [
            req_time for req_time in self.requests[client_ip]
            if req_time > minute_ago
        ]

        # Check if under limit
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            return False

        self.requests[client_ip].append(now)
        return True


# Global rate limiter instance
rate_limiter = RateLimiter(requests_per_minute=30)
