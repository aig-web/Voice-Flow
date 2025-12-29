"""
AI Polish Service
Uses OpenRouter API to polish transcribed text with grammar, style, and tone
Supports command detection and execution, custom mode prompts
"""
import os
import httpx
import asyncio
from typing import Optional, Dict, Any
from enum import Enum

from services.command_service import command_service, CommandType


class Tone(str, Enum):
    FORMAL = "formal"
    CASUAL = "casual"
    TECHNICAL = "technical"


class AppContext(str, Enum):
    EMAIL = "email"
    CHAT = "chat"
    CODE = "code"
    DOCUMENT = "document"
    GENERAL = "general"


# Tone-specific instructions
TONE_INSTRUCTIONS = {
    Tone.FORMAL: """
        - Use professional language
        - Avoid contractions (use "do not" instead of "don't")
        - Use complete sentences
        - Maintain a respectful, business-appropriate tone
    """,
    Tone.CASUAL: """
        - Use natural, conversational language
        - Contractions are fine (don't, can't, won't)
        - Keep it friendly and approachable
        - Short sentences are okay
    """,
    Tone.TECHNICAL: """
        - Use precise technical terminology
        - Be concise and clear
        - Maintain accuracy over style
        - Preserve code-like content exactly
    """,
}

# App context instructions
APP_CONTEXT_INSTRUCTIONS = {
    AppContext.EMAIL: "Format as proper email content with appropriate structure.",
    AppContext.CHAT: "Keep messages short and direct. Casual tone unless formal setting.",
    AppContext.CODE: "Preserve any code-like content exactly. Use technical terminology.",
    AppContext.DOCUMENT: "Use proper document formatting. Professional tone by default.",
    AppContext.GENERAL: "Adapt to the content naturally. Focus on clarity.",
}


class AIPolishService:
    """
    AI-powered text polishing using OpenRouter API

    Features:
    - Grammar and punctuation correction
    - Tone adaptation (formal/casual/technical)
    - App context awareness
    """

    def __init__(self):
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.base_url = "https://openrouter.ai/api/v1"
        self.model = "anthropic/claude-3.5-haiku"
        self.timeout = 6.0  # Reduced from 10s for faster response

    def is_configured(self) -> bool:
        """Check if API key is configured"""
        return bool(self.api_key and self.api_key.startswith("sk-or-"))

    async def polish(
        self,
        text: str,
        tone: Tone = Tone.FORMAL,
        app_context: AppContext = AppContext.GENERAL,
        custom_instructions: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Polish text using AI

        Returns:
            {
                "success": bool,
                "polished_text": str,
                "changes_made": list[str],
                "error": Optional[str]
            }
        """
        if not text or not text.strip():
            return {
                "success": True,
                "polished_text": text,
                "changes_made": [],
                "error": None
            }

        if not self.is_configured():
            return {
                "success": False,
                "polished_text": text,
                "changes_made": [],
                "error": "OpenRouter API key not configured"
            }

        system_prompt = self._build_system_prompt(tone, app_context, custom_instructions)
        user_prompt = f"Polish this transcribed text:\n\n{text}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://voice-flow.app",
                        "X-Title": "Voice-Flow"
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "max_tokens": 1024,
                        "temperature": 0.3,
                    }
                )

                if response.status_code != 200:
                    print(f"[AI_POLISH] API error: {response.status_code}")
                    return {
                        "success": False,
                        "polished_text": text,
                        "changes_made": [],
                        "error": f"API error: {response.status_code}"
                    }

                result = response.json()
                polished_text = result["choices"][0]["message"]["content"].strip()
                polished_text = self._extract_polished_text(polished_text)
                changes = self._detect_changes(text, polished_text)

                print(f"[AI_POLISH] Success: '{text[:50]}...' -> '{polished_text[:50]}...'")

                return {
                    "success": True,
                    "polished_text": polished_text,
                    "changes_made": changes,
                    "error": None
                }

        except httpx.TimeoutException:
            print(f"[AI_POLISH] Timeout after {self.timeout}s")
            return {
                "success": False,
                "polished_text": text,
                "changes_made": [],
                "error": "Request timeout"
            }
        except Exception as e:
            print(f"[AI_POLISH] Error: {e}")
            return {
                "success": False,
                "polished_text": text,
                "changes_made": [],
                "error": str(e)
            }

    def _build_system_prompt(
        self,
        tone: Tone,
        app_context: AppContext,
        custom_instructions: Optional[str]
    ) -> str:
        """Build the system prompt"""
        prompt = f"""You are a text polishing assistant for a voice dictation app.

Your job is to take raw transcribed speech and clean it up while preserving the speaker's EXACT words.

## ABSOLUTE RULES - VIOLATION = FAILURE:
1. Output MUST have the SAME NUMBER OF WORDS (±2) as input
2. NEVER cut off, truncate, or shorten the text
3. NEVER summarize - output the FULL text
4. NEVER answer questions - just fix grammar on questions
5. NEVER add new content or commentary
6. Only fix: grammar, spelling, punctuation, capitalization
7. Remove ONLY filler words: "um", "uh", "like", "you know"
8. Handle self-corrections: "at 2 actually 3" -> "at 3"
9. PRESERVE EVERY SENTENCE AND IDEA from the input

## Examples of CORRECT behavior:
- Input: "how are you doing" -> Output: "How are you doing?"
- Input: "whats the weather like" -> Output: "What's the weather like?"
- Input: "i went to the um store" -> Output: "I went to the store."
- Input: "The startup is way too long I actually completed one full" -> Output: "The startup is way too long. I actually completed one full."

## Examples of WRONG behavior (DO NOT DO THIS):
- Input: "The startup is way too long I actually completed one full"
- Output: "The startup is too long." ← WRONG! This truncates content!

## Tone: {tone.value.upper()}
{TONE_INSTRUCTIONS[tone]}

## Context: {app_context.value.upper()}
{APP_CONTEXT_INSTRUCTIONS[app_context]}
"""

        if custom_instructions:
            prompt += f"\n## Additional Instructions:\n{custom_instructions}\n"

        prompt += """
## Output Format:
Return ONLY the polished text. No explanations, no quotes, no prefixes.
Just output the cleaned-up text directly. Keep it SHORT - same length as input.
"""

        return prompt

    def _extract_polished_text(self, response: str) -> str:
        """Extract just the polished text from the response, removing any AI commentary"""
        import re

        prefixes_to_remove = [
            "Here's the polished text:",
            "Here is the polished text:",
            "Polished text:",
            "Polished:",
            "Output:",
        ]

        result = response.strip()

        for prefix in prefixes_to_remove:
            if result.lower().startswith(prefix.lower()):
                result = result[len(prefix):].strip()

        # Remove surrounding quotes if present
        if (result.startswith('"') and result.endswith('"')) or \
           (result.startswith("'") and result.endswith("'")):
            result = result[1:-1]

        # Remove inline AI commentary (Note: ...) anywhere in the text
        # This handles cases where the note is on the same line as the text
        result = re.sub(r'\s*\(Note:.*?\)', '', result, flags=re.IGNORECASE | re.DOTALL)
        result = re.sub(r'\s*\(This text.*?\)', '', result, flags=re.IGNORECASE | re.DOTALL)
        result = re.sub(r'\s*\(No changes.*?\)', '', result, flags=re.IGNORECASE | re.DOTALL)
        result = re.sub(r'\s*\(Already.*?\)', '', result, flags=re.IGNORECASE | re.DOTALL)
        result = re.sub(r'\s*\(The text.*?\)', '', result, flags=re.IGNORECASE | re.DOTALL)

        # Also remove lines that are entirely commentary
        lines = result.split('\n')
        cleaned_lines = []
        for line in lines:
            line_stripped = line.strip()
            # Skip lines that are AI commentary
            if line_stripped.startswith('(Note') or line_stripped.startswith('Note:'):
                continue
            if line_stripped.startswith('(This') or line_stripped.startswith('(The text'):
                continue
            if line_stripped.startswith('(No changes') or line_stripped.startswith('(Already'):
                continue
            if not line_stripped:  # Skip empty lines left after stripping
                continue
            cleaned_lines.append(line)

        result = '\n'.join(cleaned_lines).strip()

        return result.strip()

    def _detect_changes(self, original: str, polished: str) -> list:
        """Detect what changes were made"""
        changes = []

        if original.lower() != polished.lower():
            fillers = ["um", "uh", "like", "you know", "basically"]
            for filler in fillers:
                if filler in original.lower() and filler not in polished.lower():
                    changes.append(f"Removed '{filler}'")

            if original.count('.') != polished.count('.'):
                changes.append("Fixed punctuation")

            if original[0].islower() and polished[0].isupper():
                changes.append("Fixed capitalization")

            if not changes:
                changes.append("Grammar/style improvements")

        return changes

    async def polish_with_fallback(
        self,
        text: str,
        tone: Tone = Tone.FORMAL,
        app_context: AppContext = AppContext.GENERAL
    ) -> str:
        """Polish with fallback to original text on error"""
        result = await self.polish(text, tone, app_context)
        return result["polished_text"]

    async def polish_with_mode(
        self,
        text: str,
        mode: Optional[Dict[str, Any]] = None,
        selected_text: Optional[str] = None,
        clipboard_text: Optional[str] = None,
        app_context: AppContext = AppContext.GENERAL
    ) -> Dict[str, Any]:
        """
        Polish text using a specific mode's settings and prompt

        Args:
            text: The transcribed text
            mode: Mode dict with system_prompt, tone, etc.
            selected_text: User's selected text from the app
            clipboard_text: Clipboard content (optional)
            app_context: Current app context
        """
        if not text or not text.strip():
            return {
                "success": True,
                "polished_text": text,
                "changes_made": [],
                "command_type": "none",
                "error": None
            }

        if not self.is_configured():
            return {
                "success": False,
                "polished_text": text,
                "changes_made": [],
                "command_type": "none",
                "error": "OpenRouter API key not configured"
            }

        # Detect commands in the text
        cmd_type, cmd_params = command_service.detect_command(text)

        # CRITICAL RULES that MUST be prepended to ALL prompts
        critical_rules = """## ABSOLUTE RULES - VIOLATION = FAILURE:
1. Output MUST have the SAME NUMBER OF WORDS (±2) as input
2. NEVER cut off, truncate, or shorten the text
3. NEVER summarize - output the FULL text
4. NEVER answer questions - just fix grammar on questions
5. NEVER add ANY commentary, notes, explanations, or meta-text
6. NEVER add "(Note: ...)" or any parenthetical commentary
7. ONLY fix: grammar, punctuation, capitalization, filler words
8. If input is 10 words, output must be ~10 words
9. PRESERVE EVERY IDEA AND SENTENCE from the input
10. Output ONLY the cleaned text - nothing else!

Example of CORRECT behavior:
- Input: "how are you doing" -> Output: "How are you doing?"
- Input: "one two three" -> Output: "One, two, three."

Example of WRONG behavior (DO NOT DO THIS):
- Adding "(Note: This text is already correct)" ← WRONG!
- Adding any explanation ← WRONG!
- Truncating content ← WRONG!

"""

        # Build the system prompt from mode or use default
        if mode and mode.get("system_prompt"):
            # ALWAYS prepend critical rules to mode prompts
            system_prompt = critical_rules + mode["system_prompt"]
            # Use mode's model if specified
            model = mode.get("ai_model", self.model)
        else:
            tone = Tone.FORMAL
            if mode and mode.get("tone"):
                try:
                    tone = Tone(mode["tone"])
                except ValueError:
                    pass
            # Critical rules are already in _build_system_prompt, but add them anyway for safety
            system_prompt = critical_rules + self._build_system_prompt(tone, app_context, None)
            model = self.model

        # Build user message based on command type
        user_message = self._build_user_message(
            text=text,
            cmd_type=cmd_type,
            cmd_params=cmd_params,
            selected_text=selected_text,
            clipboard_text=clipboard_text
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://voice-flow.app",
                        "X-Title": "Voice-Flow"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_message}
                        ],
                        "max_tokens": 2048,
                        "temperature": 0.3,
                    }
                )

                if response.status_code != 200:
                    print(f"[AI_POLISH] API error: {response.status_code}")
                    return {
                        "success": False,
                        "polished_text": text,
                        "changes_made": [],
                        "command_type": cmd_type.value,
                        "error": f"API error: {response.status_code}"
                    }

                result = response.json()
                polished_text = result["choices"][0]["message"]["content"].strip()
                polished_text = self._extract_polished_text(polished_text)
                changes = self._detect_changes(text, polished_text)

                print(f"[AI_POLISH] Mode: {mode.get('name') if mode else 'default'}, Command: {cmd_type.value}")

                return {
                    "success": True,
                    "polished_text": polished_text,
                    "changes_made": changes,
                    "command_type": cmd_type.value,
                    "error": None
                }

        except httpx.TimeoutException:
            print(f"[AI_POLISH] Timeout after {self.timeout}s")
            return {
                "success": False,
                "polished_text": text,
                "changes_made": [],
                "command_type": cmd_type.value,
                "error": "Request timeout"
            }
        except Exception as e:
            print(f"[AI_POLISH] Error: {e}")
            return {
                "success": False,
                "polished_text": text,
                "changes_made": [],
                "command_type": cmd_type.value,
                "error": str(e)
            }

    def _build_user_message(
        self,
        text: str,
        cmd_type: CommandType,
        cmd_params: Optional[Dict[str, Any]],
        selected_text: Optional[str],
        clipboard_text: Optional[str]
    ) -> str:
        """Build user message based on command type and context"""

        # Add context if available
        context_parts = []
        if selected_text:
            context_parts.append(f"Selected text:\n\"\"\"\n{selected_text}\n\"\"\"")
        if clipboard_text:
            context_parts.append(f"Clipboard:\n\"\"\"\n{clipboard_text}\n\"\"\"")

        context_section = ""
        if context_parts:
            context_section = "## Context:\n" + "\n\n".join(context_parts) + "\n\n"

        # Build message based on command type
        if cmd_type == CommandType.NONE:
            return f"{context_section}Polish this transcribed text:\n\n{text}"

        elif cmd_type == CommandType.FORMAT:
            format_type = cmd_params.get("format", "bold") if cmd_params else "bold"
            return f"""{context_section}Polish this text and apply formatting:

Text: {text}

Apply {format_type} formatting to the relevant portion.
Output ONLY the formatted text."""

        elif cmd_type == CommandType.EDIT:
            old = cmd_params.get("old_text", "") if cmd_params else ""
            new = cmd_params.get("new_text", "") if cmd_params else ""
            return f"""{context_section}Polish this text and make the requested edit:

Text: {text}

Command: Change "{old}" to "{new}"
Make this change and return the edited text."""

        elif cmd_type == CommandType.GENERATE:
            gen_type = cmd_params.get("type", "text") if cmd_params else "text"
            return f"""{context_section}Generate content based on this request:

Request: {text}

Generate a {gen_type} as requested.
Output ONLY the generated content."""

        elif cmd_type == CommandType.TRANSLATE:
            target_lang = cmd_params.get("target_language", "Spanish") if cmd_params else "Spanish"
            return f"""{context_section}Translate this text to {target_lang}:

{text}

Output ONLY the translation."""

        elif cmd_type == CommandType.SUMMARIZE:
            target = selected_text or clipboard_text or text
            return f"""{context_section}Summarize this content:

{target}

Provide a concise summary."""

        elif cmd_type == CommandType.QUESTION:
            return f"""{context_section}Answer this question:

{text}

Provide a helpful, concise answer."""

        else:
            return f"{context_section}Polish this transcribed text:\n\n{text}"


# Global instance
ai_polish_service = AIPolishService()
