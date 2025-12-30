"""
Settings Router
User settings and personal dictionary management
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import SessionLocal, UserSettings
from services.dictionary_service import (
    validate_dictionary_entry,
    MAX_DICTIONARY_ENTRIES
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsRequest(BaseModel):
    tone: str
    personal_dictionary: dict
    record_hotkey: str = "Command+Shift+S"  # macOS default
    language: str = "en"


class DictionaryEntryRequest(BaseModel):
    mishearing: str
    correction: str


@router.get("")
async def get_settings():
    """Get user settings"""
    try:
        with SessionLocal() as db:
            settings = db.query(UserSettings).filter(
                UserSettings.user_id == "default"
            ).first()

            if not settings:
                settings = UserSettings(user_id="default")
                db.add(settings)
                db.commit()
                db.refresh(settings)

            return settings.to_dict()
    except Exception as e:
        print(f"Error getting settings: {e}")
        return {"error": str(e)}


@router.post("")
async def update_settings(request: SettingsRequest):
    """Update user settings"""
    try:
        with SessionLocal() as db:
            settings = db.query(UserSettings).filter(
                UserSettings.user_id == "default"
            ).first()

            if not settings:
                settings = UserSettings(user_id="default")
                db.add(settings)

            settings.tone = request.tone
            settings.personal_dictionary = request.personal_dictionary
            settings.record_hotkey = request.record_hotkey
            settings.language = request.language

            db.commit()

        print(f"Settings updated: tone={request.tone}, hotkey={request.record_hotkey}, language={request.language}")
        return {"status": "success", "record_hotkey": request.record_hotkey, "language": request.language}
    except Exception as e:
        print(f"Error updating settings: {e}")
        return {"error": str(e)}


@router.post("/dictionary/add")
async def add_dictionary_entry(request: DictionaryEntryRequest):
    """Add entry to personal dictionary"""
    try:
        # Validate input
        is_valid, error_msg = validate_dictionary_entry(request.mishearing, request.correction)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        mishearing = request.mishearing.strip()
        correction = request.correction.strip()

        with SessionLocal() as db:
            settings = db.query(UserSettings).filter(
                UserSettings.user_id == "default"
            ).first()

            if not settings:
                settings = UserSettings(user_id="default")
                db.add(settings)

            if not settings.personal_dictionary:
                settings.personal_dictionary = {}

            # Check dictionary size limit
            current_size = len(settings.personal_dictionary)
            if current_size >= MAX_DICTIONARY_ENTRIES and mishearing not in settings.personal_dictionary:
                raise HTTPException(
                    status_code=400,
                    detail=f"Dictionary limit reached (max {MAX_DICTIONARY_ENTRIES} entries)"
                )

            new_dict = dict(settings.personal_dictionary)
            new_dict[mishearing] = correction
            settings.personal_dictionary = new_dict

            db.commit()
            result = {"status": "added", "dictionary": dict(settings.personal_dictionary)}

        print(f"Dictionary entry added: {mishearing} -> {correction}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error adding dictionary entry: {e}")
        return {"error": str(e)}


@router.delete("/dictionary/{mishearing}")
async def remove_dictionary_entry(mishearing: str):
    """Remove entry from personal dictionary"""
    try:
        with SessionLocal() as db:
            settings = db.query(UserSettings).filter(
                UserSettings.user_id == "default"
            ).first()

            if settings and settings.personal_dictionary and mishearing in settings.personal_dictionary:
                new_dict = dict(settings.personal_dictionary)
                del new_dict[mishearing]
                settings.personal_dictionary = new_dict
                db.commit()
                print(f"Dictionary entry removed: {mishearing}")
                return {"status": "deleted"}

            return {"error": "Not found"}
    except Exception as e:
        print(f"Error removing dictionary entry: {e}")
        return {"error": str(e)}
