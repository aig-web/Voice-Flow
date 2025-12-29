"""
Text Cleanup Service
Removes filler words, fixes common speech patterns, handles self-corrections
"""
import re
from typing import List, Tuple


class TextCleanupService:
    """Cleans up raw transcription text"""

    # Filler words to remove (word boundaries)
    FILLER_PATTERNS: List[Tuple[str, str]] = [
        # Basic fillers
        (r'\b(um+|uh+|er+|ah+|eh+|hm+|hmm+)\b', ''),

        # Hesitation fillers (only when followed by actual content)
        (r'\b(like)\b(?=\s+(?:the|a|an|I|you|we|they|he|she|it|this|that|so|um|uh))', ''),
        (r'\b(you know)\b(?=\s*[,.]?\s+)', ''),
        (r'\b(I mean)\b(?=\s*[,.]?\s+)', ''),
        (r'\b(basically)\b(?=\s*[,.]?\s+)', ''),
        (r'\b(literally)\b(?=\s*[,.]?\s+)', ''),
        (r'\b(obviously)\b(?=\s*[,.]?\s+)', ''),
        (r'\b(honestly)\b(?=\s*[,.]?\s+)', ''),

        # Sentence starters to clean (when redundant)
        (r'^(so+|well|right|okay|ok)\s*[,.]?\s+(?=[A-Z])', ''),

        # Repeated words (stuttering)
        (r'\b(\w+)\s+\1\b', r'\1'),  # "the the" -> "the"

        # False starts
        (r'\b(I|we|they|he|she)\s+\1\b', r'\1'),  # "I I" -> "I"
    ]

    # Self-correction patterns
    # "let's meet at 2 actually 3" -> "let's meet at 3"
    # "I need 5 no wait 6 items" -> "I need 6 items"
    CORRECTION_PATTERNS: List[Tuple[str, str]] = [
        # "X actually Y" pattern (numbers)
        (r'\b(\d+)\s+(?:actually|no|wait|I mean|sorry)\s+(\d+)\b', r'\2'),

        # "X no Y" pattern for words
        (r'\b(\w+)\s+(?:no|wait|I mean|sorry|actually)\s+(\w+)\b(?=\s|$|[,.])', r'\2'),
    ]

    # Cleanup patterns (formatting)
    CLEANUP_PATTERNS: List[Tuple[str, str]] = [
        # Multiple spaces
        (r'\s{2,}', ' '),

        # Space before punctuation
        (r'\s+([.,!?;:])', r'\1'),

        # Multiple punctuation
        (r'([.,!?]){2,}', r'\1'),

        # Space after punctuation if missing
        (r'([.,!?;:])([A-Za-z])', r'\1 \2'),
    ]

    def remove_fillers(self, text: str) -> str:
        """Remove filler words from text"""
        result = text

        for pattern, replacement in self.FILLER_PATTERNS:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

        return result.strip()

    def handle_corrections(self, text: str) -> str:
        """Handle self-corrections in speech"""
        result = text

        for pattern, replacement in self.CORRECTION_PATTERNS:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

        return result

    def cleanup_formatting(self, text: str) -> str:
        """Fix formatting issues"""
        result = text

        for pattern, replacement in self.CLEANUP_PATTERNS:
            result = re.sub(pattern, replacement, result)

        # Capitalize first letter
        if result and result[0].islower():
            result = result[0].upper() + result[1:]

        # Capitalize after periods
        result = re.sub(
            r'(\.\s+)([a-z])',
            lambda m: m.group(1) + m.group(2).upper(),
            result
        )

        return result.strip()

    def process(self, text: str) -> str:
        """Full cleanup pipeline"""
        if not text:
            return text

        # Step 1: Handle self-corrections first
        result = self.handle_corrections(text)

        # Step 2: Remove fillers
        result = self.remove_fillers(result)

        # Step 3: Fix formatting
        result = self.cleanup_formatting(result)

        return result


# Global instance
text_cleanup_service = TextCleanupService()
