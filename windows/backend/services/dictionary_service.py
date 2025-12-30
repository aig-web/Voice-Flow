"""
Dictionary Service
Personal dictionary management with validation
"""
import re
from database import SessionLocal, UserSettings


# Validation constants
MAX_DICTIONARY_ENTRIES = 500
MAX_MISHEARING_LENGTH = 100
MAX_CORRECTION_LENGTH = 200
DANGEROUS_REGEX_CHARS = set('[](){}*+?|^$\\')


def validate_dictionary_entry(mishearing: str, correction: str) -> tuple[bool, str]:
    """
    Validate dictionary entry for security and sanity.
    Returns (is_valid, error_message)
    """
    # Check for empty values
    if not mishearing or not mishearing.strip():
        return False, "Mishearing text cannot be empty"
    if not correction or not correction.strip():
        return False, "Correction text cannot be empty"

    mishearing = mishearing.strip()
    correction = correction.strip()

    # Length limits
    if len(mishearing) > MAX_MISHEARING_LENGTH:
        return False, f"Mishearing text too long (max {MAX_MISHEARING_LENGTH} characters)"
    if len(correction) > MAX_CORRECTION_LENGTH:
        return False, f"Correction text too long (max {MAX_CORRECTION_LENGTH} characters)"

    # Prevent regex metacharacters in mishearing
    dangerous_chars_found = [c for c in mishearing if c in DANGEROUS_REGEX_CHARS]
    if dangerous_chars_found:
        return False, f"Mishearing text contains invalid characters: {dangerous_chars_found[:3]}"

    # Prevent extremely repetitive patterns that could cause ReDoS
    if len(mishearing) > 10:
        char_counts = {}
        for c in mishearing.lower():
            char_counts[c] = char_counts.get(c, 0) + 1
        max_repeat = max(char_counts.values())
        if max_repeat > len(mishearing) * 0.8:
            return False, "Mishearing text is too repetitive"

    return True, ""


class DictionaryService:
    """Personal dictionary management"""

    @staticmethod
    def get_dictionary() -> dict:
        """Get personal dictionary from settings"""
        try:
            with SessionLocal() as db:
                settings = db.query(UserSettings).filter(
                    UserSettings.user_id == "default"
                ).first()

                if settings and settings.personal_dictionary:
                    return dict(settings.personal_dictionary)
            return {}
        except Exception as e:
            print(f"[WARN] Could not load dictionary: {e}")
            return {}

    @staticmethod
    def apply_dictionary(text: str, dictionary: dict) -> str:
        """Apply personal dictionary corrections to text"""
        if not dictionary or not text:
            return text

        result = text
        for mishearing, correction in dictionary.items():
            # Case-insensitive replacement
            pattern = re.compile(re.escape(mishearing), re.IGNORECASE)
            result = pattern.sub(correction, result)

        return result


# Global dictionary service instance
dictionary_service = DictionaryService()
