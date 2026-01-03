"""
Grammar Service
Real-time text correction using LanguageTool for streaming transcription
"""
import os
import time
import threading
from typing import Optional

# Global instance
_grammar_tool = None
_grammar_lock = threading.Lock()
_is_initialized = False
_init_in_progress = False


_init_failed = False  # Track if init already failed (don't retry)

def get_grammar_tool():
    """Get or create LanguageTool instance (lazy initialization)"""
    global _grammar_tool, _is_initialized, _init_in_progress, _init_failed

    # If already failed, don't retry
    if _init_failed:
        return None

    if _is_initialized:
        return _grammar_tool

    with _grammar_lock:
        if _is_initialized:
            return _grammar_tool

        if _init_in_progress or _init_failed:
            return None

        _init_in_progress = True

    # Initialize outside lock to avoid blocking
    try:
        import language_tool_python

        print("[GRAMMAR] Initializing LanguageTool (first call may take 10-30s)...")
        t0 = time.perf_counter()

        # Use local LanguageTool server for faster response
        tool = language_tool_python.LanguageTool('en-US')

        # Warmup call to initialize JVM
        _ = tool.check("Hello world")

        init_ms = (time.perf_counter() - t0) * 1000
        print(f"[GRAMMAR] LanguageTool ready ({init_ms:.0f}ms)")

        with _grammar_lock:
            _grammar_tool = tool
            _is_initialized = True
            _init_in_progress = False

        return _grammar_tool

    except Exception as e:
        print(f"[GRAMMAR] Failed to initialize LanguageTool: {e}")
        print("[GRAMMAR] Grammar correction disabled - install Java to enable")
        with _grammar_lock:
            _init_in_progress = False
            _init_failed = True  # Don't retry
        return None


class GrammarService:
    """
    Fast grammar correction service for streaming transcription.

    Design principles:
    1. Non-blocking: Don't slow down transcription if grammar check is slow
    2. Incremental: Only correct NEW text, cache corrections for confirmed text
    3. Context-aware: Use surrounding words for better corrections
    """

    def __init__(self):
        self._cached_corrections: dict[str, str] = {}
        self._last_corrected_text = ""

    def correct_text(self, text: str, is_final: bool = False) -> str:
        """
        Correct grammar/spelling in text.

        Args:
            text: Text to correct
            is_final: If True, apply all corrections. If False, be conservative.

        Returns:
            Corrected text
        """
        if not text or not text.strip():
            return text

        # Check cache first
        cache_key = text.strip().lower()
        if cache_key in self._cached_corrections:
            return self._cached_corrections[cache_key]

        tool = get_grammar_tool()
        if tool is None:
            return text  # Return uncorrected if tool not available

        try:
            t0 = time.perf_counter()

            # Get matches (errors/suggestions)
            matches = tool.check(text)

            if not matches:
                self._cached_corrections[cache_key] = text
                return text

            # Apply corrections (from end to start to preserve positions)
            corrected = text
            for match in reversed(matches):
                if match.replacements:
                    # Use first suggestion
                    replacement = match.replacements[0]
                    start = match.offset
                    end = match.offset + match.errorLength
                    corrected = corrected[:start] + replacement + corrected[end:]

            correction_ms = (time.perf_counter() - t0) * 1000

            if corrected != text:
                print(f"[GRAMMAR] Corrected in {correction_ms:.0f}ms: '{text}' -> '{corrected}'")

            # Cache the correction
            self._cached_corrections[cache_key] = corrected

            return corrected

        except Exception as e:
            print(f"[GRAMMAR] Error correcting text: {e}")
            return text

    def correct_streaming(self, confirmed_text: str, partial_text: str) -> tuple[str, str]:
        """
        Correct streaming transcription output.

        For streaming, we:
        1. Correct confirmed text (yellow) - these are stable words
        2. Don't correct partial text (gray) - these are still changing

        Args:
            confirmed_text: Stable/confirmed words (yellow in UI)
            partial_text: Unstable/partial words (gray in UI)

        Returns:
            (corrected_confirmed, partial_text) - partial unchanged
        """
        # Only correct confirmed text since it's stable
        corrected_confirmed = self.correct_text(confirmed_text) if confirmed_text else ""

        # Don't correct partial - it's still changing rapidly
        return corrected_confirmed, partial_text

    def correct_final(self, text: str) -> str:
        """
        Final correction when recording stops.
        Apply full grammar checking to final text.
        """
        return self.correct_text(text, is_final=True)

    def reset(self):
        """Reset state for new recording session"""
        self._cached_corrections.clear()
        self._last_corrected_text = ""


# Global service instance
grammar_service = GrammarService()


def init_grammar_async():
    """Initialize LanguageTool in background thread"""
    thread = threading.Thread(target=get_grammar_tool, daemon=True)
    thread.start()
