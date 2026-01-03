"""
Authentication Router
Simple email-based authentication with whitelist
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from typing import List

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    email: str


# Load allowed emails from file
def load_allowed_emails():
    """Load allowed emails from allowed_users.txt"""
    allowed_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "allowed_users.txt")

    try:
        with open(allowed_file, 'r') as f:
            emails = []
            for line in f:
                line = line.strip()
                # Skip comments and empty lines
                if line and not line.startswith('#'):
                    emails.append(line.lower())
            return emails
    except FileNotFoundError:
        # Default emails if file doesn't exist
        return [
            "user1@gmail.com",
            "user2@gmail.com",
            "user3@gmail.com",
            "user4@gmail.com",
            "user5@gmail.com",
        ]

ALLOWED_EMAILS = load_allowed_emails()
print(f"[AUTH] Loaded {len(ALLOWED_EMAILS)} authorized users")


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Simple email-based login

    Checks if email is in whitelist of allowed users
    """
    email = request.email.strip().lower()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Check if email is in whitelist
    if email not in [e.strip().lower() for e in ALLOWED_EMAILS]:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Your email is not authorized to use this service."
        )

    return LoginResponse(
        success=True,
        message="Login successful",
        email=email
    )


@router.get("/health")
async def health():
    """Check if auth service is running"""
    return {"status": "ok", "service": "authentication"}
