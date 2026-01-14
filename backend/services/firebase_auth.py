"""
Firebase Authentication Service
Verifies Firebase ID tokens and manages user sessions
"""
import os
import firebase_admin
from firebase_admin import credentials, auth
from fastapi import HTTPException, Header
from typing import Optional
from database import SessionLocal, User
from datetime import datetime

# Initialize Firebase Admin SDK
# You need to download your Firebase service account key JSON and set FIREBASE_CREDENTIALS_PATH
firebase_app = None


def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    global firebase_app

    if firebase_app:
        return  # Already initialized

    credentials_path = os.getenv('FIREBASE_CREDENTIALS_PATH')

    if not credentials_path or not os.path.exists(credentials_path):
        print("[AUTH] WARNING: Firebase credentials not found. Auth will not work!")
        print("[AUTH] Set FIREBASE_CREDENTIALS_PATH in .env to your service account JSON file")
        return

    try:
        cred = credentials.Certificate(credentials_path)
        firebase_app = firebase_admin.initialize_app(cred)
        print("[AUTH] Firebase Admin SDK initialized successfully")
    except Exception as e:
        print(f"[AUTH] Error initializing Firebase: {e}")


async def verify_firebase_token(authorization: str = Header(None)) -> dict:
    """
    Verify Firebase ID token from Authorization header
    Returns decoded token with user info
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    id_token = authorization.split("Bearer ")[1]

    try:
        # Verify the ID token
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid ID token")
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Expired ID token")
    except Exception as e:
        print(f"[AUTH] Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")


async def get_current_user(authorization: str = Header(None)) -> User:
    """
    Get current authenticated user from Firebase token
    Creates user in database if doesn't exist
    """
    decoded_token = await verify_firebase_token(authorization)

    firebase_uid = decoded_token['uid']
    email = decoded_token.get('email', '')
    name = decoded_token.get('name', email.split('@')[0])  # Fallback to email username
    photo_url = decoded_token.get('picture', '')

    with SessionLocal() as db:
        # Find or create user
        user = db.query(User).filter(User.firebase_uid == firebase_uid).first()

        if not user:
            # Create new user
            user = User(
                firebase_uid=firebase_uid,
                email=email,
                name=name,
                photo_url=photo_url,
                is_active=True,
                is_premium=False
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"[AUTH] Created new user: {email} (ID: {user.id})")
        else:
            # Update last login
            user.last_login = datetime.now()

            # Update profile info if changed
            if user.name != name or user.photo_url != photo_url:
                user.name = name
                user.photo_url = photo_url

            db.commit()
            db.refresh(user)

        return user


def get_user_id_from_token(authorization: Optional[str] = None) -> Optional[int]:
    """
    Helper to extract user ID from token
    Returns None if no valid auth
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    try:
        id_token = authorization.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(id_token)
        firebase_uid = decoded_token['uid']

        with SessionLocal() as db:
            user = db.query(User).filter(User.firebase_uid == firebase_uid).first()
            return user.id if user else None
    except:
        return None
