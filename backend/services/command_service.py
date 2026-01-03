from enum import Enum
from typing import Tuple, Dict, Any, Optional


class CommandType(str, Enum):
    NONE = "none"
    FORMAT = "format"
    EDIT = "edit"
    GENERATE = "generate"
    TRANSLATE = "translate"
    SUMMARIZE = "summarize"
    QUESTION = "question"


class CommandService:
    """Minimal command detection service.

    This lightweight implementation always returns `NONE` so the rest
    of the backend can operate. It can be extended later to detect
    commands from text (e.g., /translate to Spanish).
    """

    def detect_command(self, text: str) -> Tuple[CommandType, Optional[Dict[str, Any]]]:
        # Placeholder: no command detection implemented
        return (CommandType.NONE, None)


# Export a singleton instance
command_service = CommandService()
