"""
Text Cleanup Service
Removes filler words, fixes common speech patterns, handles self-corrections
Improved with context-aware filler detection
"""
import re
from typing import List, Tuple


class TextCleanupService:
    """Improved text cleanup with context awareness"""

    # Filler words to remove (only when clearly hesitation markers)
    PURE_FILLERS = ['um', 'uh', 'er', 'ah', 'hmm', 'hm', 'eh']

    # Contextual fillers (only remove at sentence start or after pause)
    CONTEXTUAL_FILLERS = ['so', 'well', 'right', 'okay', 'like', 'basically', 'literally', 'actually']

    # Self-correction markers
    CORRECTION_MARKERS = ['actually', 'i mean', 'no wait', 'sorry', 'no no', 'wait']

    def cleanup(self, text: str) -> str:
        """Full cleanup pipeline"""
        if not text or not text.strip():
            return text

        result = text

        # Step 1: Handle self-corrections first
        result = self._handle_corrections(result)

        # Step 2: Remove pure fillers
        result = self._remove_pure_fillers(result)

        # Step 3: Remove contextual fillers (carefully)
        result = self._remove_contextual_fillers(result)

        # Step 4: Remove stuttering/repeated words
        result = self._remove_stuttering(result)

        # Step 5: Fix formatting
        result = self._fix_formatting(result)

        return result.strip()

    def _handle_corrections(self, text: str) -> str:
        """Handle self-corrections like 'at 2 actually 3'"""

        # Pattern: number/word + correction marker + number/word
        # Keep the corrected version
        patterns = [
            # "at 2 actually 3" -> "at 3"
            (r'\b(\w+)\s+(\d+)\s+(?:actually|no\s+wait|I\s+mean)\s+(\d+)\b', r'\1 \3'),

            # "5 no wait 6" -> "6"
            (r'\b(\d+)\s+(?:no\s+wait|actually|I\s+mean)\s+(\d+)\b', r'\2'),

            # "on Monday actually Tuesday" -> "on Tuesday"
            (r'\b(on|at|for|to)\s+(\w+)\s+(?:actually|no\s+wait|I\s+mean)\s+(\w+)\b', r'\1 \3'),

            # More general: "X, no, Y" -> "Y"
            (r'\b(\w+),?\s+no,?\s+(\w+)\b', r'\2'),

            # "X no Y" pattern
            (r'\b(\w+)\s+(?:no|wait|I mean|sorry|actually)\s+(\w+)\b(?=\s|$|[,.])', r'\2'),
        ]

        result = text
        for pattern, replacement in patterns:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

        return result

    def _remove_pure_fillers(self, text: str) -> str:
        """Remove fillers that are always hesitation markers"""
        result = text

        for filler in self.PURE_FILLERS:
            # Match filler as whole word, possibly followed by comma
            pattern = rf'\b{filler}+\b,?\s*'
            result = re.sub(pattern, '', result, flags=re.IGNORECASE)

        return result

    def _remove_contextual_fillers(self, text: str) -> str:
        """Remove contextual fillers only when they're clearly filler usage"""
        result = text

        # Remove "like" only when it's a filler (before pause or certain words)
        # BUT NOT when it's a verb: "I like pizza"
        # Filler pattern: "like" followed by article, pronoun, or number
        result = re.sub(
            r'\blike\s+(?=(?:the|a|an|this|that|I|you|he|she|it|we|they|\d))',
            '',
            result,
            flags=re.IGNORECASE
        )

        # Remove "you know" when it's clearly a filler
        result = re.sub(
            r'\byou know\b,?\s*',
            '',
            result,
            flags=re.IGNORECASE
        )

        # Remove "I mean" when followed by content
        result = re.sub(
            r'\bI mean\b,?\s*',
            '',
            result,
            flags=re.IGNORECASE
        )

        # Remove sentence-starting fillers
        for filler in ['so', 'well', 'okay', 'right']:
            # Only at very beginning of sentence
            result = re.sub(
                rf'^{filler},?\s+',
                '',
                result,
                flags=re.IGNORECASE | re.MULTILINE
            )
            # After period
            result = re.sub(
                rf'(\.\s+){filler},?\s+',
                r'\1',
                result,
                flags=re.IGNORECASE
            )

        # Remove "basically", "literally", "obviously" when clearly filler
        for filler in ['basically', 'literally', 'obviously', 'honestly']:
            result = re.sub(
                rf'\b{filler}\b,?\s+',
                '',
                result,
                flags=re.IGNORECASE
            )

        return result

    def _remove_stuttering(self, text: str) -> str:
        """Remove repeated words (stuttering)"""
        # "the the" -> "the" (case insensitive)
        result = re.sub(
            r'\b(\w+)\s+\1\b',
            r'\1',
            text,
            flags=re.IGNORECASE
        )

        # Handle repeated pronouns "I I" -> "I"
        result = re.sub(
            r'\b(I|we|they|he|she)\s+\1\b',
            r'\1',
            result,
            flags=re.IGNORECASE
        )

        return result

    def _fix_formatting(self, text: str) -> str:
        """Fix spacing, punctuation, capitalization"""
        result = text

        # Multiple spaces -> single space
        result = re.sub(r'\s+', ' ', result)

        # Space before punctuation
        result = re.sub(r'\s+([.,!?;:])', r'\1', result)

        # No space after opening paren/bracket
        result = re.sub(r'(\(|\[)\s+', r'\1', result)

        # No space before closing paren/bracket
        result = re.sub(r'\s+(\)|\])', r'\1', result)

        # Space after punctuation if missing (but not for abbreviations)
        result = re.sub(r'([.,!?;:])([A-Za-z])', r'\1 \2', result)

        # Multiple punctuation
        result = re.sub(r'([.,!?]){2,}', r'\1', result)

        # Capitalize first letter
        if result and result[0].isalpha() and result[0].islower():
            result = result[0].upper() + result[1:]

        # Capitalize after periods
        result = re.sub(
            r'([.!?]\s+)([a-z])',
            lambda m: m.group(1) + m.group(2).upper(),
            result
        )

        return result.strip()

    def process(self, text: str) -> str:
        """Full cleanup pipeline - alias for cleanup()"""
        return self.cleanup(text)


# Global instance
text_cleanup_service = TextCleanupService()
