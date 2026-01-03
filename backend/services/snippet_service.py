"""
Snippet Service
Manages voice shortcuts that expand to longer text
"""
import re
from typing import List, Optional, Tuple
from database import SessionLocal, Snippet

# Limits
MAX_SNIPPETS = 100
MAX_TRIGGER_LENGTH = 50
MAX_CONTENT_LENGTH = 2000


class SnippetService:
    """Manages snippets (voice shortcuts)"""

    def get_snippets(self, user_id: str = "default") -> List[dict]:
        """Get all snippets for a user"""
        with SessionLocal() as db:
            snippets = db.query(Snippet).filter(
                Snippet.user_id == user_id
            ).order_by(Snippet.use_count.desc()).all()
            return [s.to_dict() for s in snippets]

    def add_snippet(
        self,
        trigger: str,
        content: str,
        user_id: str = "default"
    ) -> Tuple[bool, str, Optional[dict]]:
        """
        Add a new snippet

        Returns: (success, message, snippet_dict)
        """
        # Validation
        trigger = trigger.strip().lower()
        content = content.strip()

        if not trigger or not content:
            return False, "Trigger and content are required", None

        if len(trigger) > MAX_TRIGGER_LENGTH:
            return False, f"Trigger too long (max {MAX_TRIGGER_LENGTH} chars)", None

        if len(content) > MAX_CONTENT_LENGTH:
            return False, f"Content too long (max {MAX_CONTENT_LENGTH} chars)", None

        with SessionLocal() as db:
            # Check if trigger already exists
            existing = db.query(Snippet).filter(
                Snippet.user_id == user_id,
                Snippet.trigger == trigger
            ).first()

            if existing:
                # Update existing
                existing.content = content
                db.commit()
                db.refresh(existing)
                return True, "Snippet updated", existing.to_dict()

            # Check limit
            count = db.query(Snippet).filter(Snippet.user_id == user_id).count()
            if count >= MAX_SNIPPETS:
                return False, f"Maximum snippets reached ({MAX_SNIPPETS})", None

            # Create new
            snippet = Snippet(
                user_id=user_id,
                trigger=trigger,
                content=content
            )
            db.add(snippet)
            db.commit()
            db.refresh(snippet)

            return True, "Snippet added", snippet.to_dict()

    def delete_snippet(self, snippet_id: int, user_id: str = "default") -> bool:
        """Delete a snippet"""
        with SessionLocal() as db:
            snippet = db.query(Snippet).filter(
                Snippet.id == snippet_id,
                Snippet.user_id == user_id
            ).first()

            if snippet:
                db.delete(snippet)
                db.commit()
                return True
            return False

    def apply_snippets(self, text: str, user_id: str = "default") -> Tuple[str, List[str]]:
        """
        Apply snippets to text

        Returns: (processed_text, list_of_applied_triggers)
        """
        snippets = self.get_snippets(user_id)
        if not snippets:
            return text, []

        result = text
        applied = []

        # Sort by trigger length (longest first) to handle overlapping triggers
        snippets.sort(key=lambda s: len(s["trigger"]), reverse=True)

        for snippet in snippets:
            trigger = snippet["trigger"]
            content = snippet["content"]

            # Case-insensitive replacement
            pattern = r'\b' + re.escape(trigger) + r'\b'

            if re.search(pattern, result, flags=re.IGNORECASE):
                result = re.sub(pattern, content, result, flags=re.IGNORECASE)
                applied.append(trigger)

                # Increment use count
                self._increment_use_count(snippet["id"])

        return result, applied

    def _increment_use_count(self, snippet_id: int):
        """Increment the use count for a snippet"""
        try:
            with SessionLocal() as db:
                snippet = db.query(Snippet).filter(Snippet.id == snippet_id).first()
                if snippet:
                    snippet.use_count += 1
                    db.commit()
        except Exception:
            pass  # Non-critical, don't fail on this


# Global instance
snippet_service = SnippetService()
