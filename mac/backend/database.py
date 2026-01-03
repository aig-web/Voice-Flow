from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Text, JSON, Boolean, ForeignKey, UniqueConstraint, LargeBinary
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./stoptyping.db")

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Dependency for database sessions"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)


class Transcription(Base):
    __tablename__ = "transcriptions"

    id = Column(Integer, primary_key=True, index=True)
    raw_text = Column(Text, nullable=False)
    polished_text = Column(Text, nullable=False)
    duration = Column(Float, default=0.0)  # seconds
    created_at = Column(DateTime, default=lambda: datetime.utcnow())

    # Audio storage for reprocessing (optional)
    audio_data = Column(LargeBinary, nullable=True)
    audio_duration_ms = Column(Integer, nullable=True)

    # Mode tracking
    mode_id = Column(Integer, ForeignKey('modes.id'), nullable=True)
    mode_name = Column(String(100), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "raw_text": self.raw_text,
            "polished_text": self.polished_text,
            "duration": self.duration,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "mode_id": self.mode_id,
            "mode_name": self.mode_name,
            "has_audio": self.audio_data is not None
        }


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, default="default", unique=True)
    tone = Column(String, default="formal")  # formal, casual, technical
    personal_dictionary = Column(JSON, default={})  # {"mishearing": "correction"}
    record_hotkey = Column(String, default="Command+Shift+S")  # Global hotkey for recording (macOS uses Command)
    language = Column(String, default="en")  # Language code: en, es, fr, de, etc.
    created_at = Column(DateTime, default=lambda: datetime.utcnow())
    updated_at = Column(DateTime, default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "tone": self.tone,
            "personal_dictionary": self.personal_dictionary or {},
            "record_hotkey": self.record_hotkey or "Command+Shift+S",
            "language": self.language or "en",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class Mode(Base):
    """Processing modes with custom prompts and settings"""
    __tablename__ = "modes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, default="default", index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500))

    # System prompt for AI processing
    system_prompt = Column(Text, nullable=False)

    # Processing options
    tone = Column(String(20), default="formal")  # formal/casual/technical
    use_ai_polish = Column(Boolean, default=True)
    use_cleanup = Column(Boolean, default=True)
    use_dictionary = Column(Boolean, default=True)
    use_snippets = Column(Boolean, default=True)

    # AI model selection
    ai_model = Column(String(100), default="anthropic/claude-3.5-haiku")

    # Auto-switch rules (JSON array of app names)
    auto_switch_apps = Column(JSON, default=[])

    # Keyboard shortcut for this mode
    shortcut = Column(String(50))

    # Ordering
    sort_order = Column(Integer, default=0)
    is_default = Column(Boolean, default=False)

    created_at = Column(DateTime, default=lambda: datetime.utcnow())
    updated_at = Column(DateTime, onupdate=lambda: datetime.utcnow())

    __table_args__ = (
        UniqueConstraint('user_id', 'name', name='unique_mode_per_user'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description,
            "system_prompt": self.system_prompt,
            "tone": self.tone,
            "use_ai_polish": self.use_ai_polish,
            "use_cleanup": self.use_cleanup,
            "use_dictionary": self.use_dictionary,
            "use_snippets": self.use_snippets,
            "ai_model": self.ai_model,
            "auto_switch_apps": self.auto_switch_apps or [],
            "shortcut": self.shortcut,
            "sort_order": self.sort_order,
            "is_default": self.is_default,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class Snippet(Base):
    """Voice shortcuts that expand to longer text"""
    __tablename__ = "snippets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, default="default", index=True)
    trigger = Column(String, nullable=False)  # "my email", "my address"
    content = Column(Text, nullable=False)    # "john@example.com", "123 Main St..."
    use_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.utcnow())
    updated_at = Column(DateTime, default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow())

    def to_dict(self):
        return {
            "id": self.id,
            "trigger": self.trigger,
            "content": self.content,
            "use_count": self.use_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


# Default modes to seed
DEFAULT_MODES = [
    {
        "name": "Dictation",
        "description": "Clean speech-to-text with minimal AI processing",
        "system_prompt": """Clean up the transcribed speech:
- Fix grammar and punctuation
- Remove filler words (um, uh, like)
- Handle self-corrections
- Preserve the speaker's voice and intent
Output ONLY the cleaned text.""",
        "use_ai_polish": False,
        "tone": "casual",
        "is_default": True,
        "sort_order": 0
    },
    {
        "name": "Email",
        "description": "Format as professional email",
        "system_prompt": """Format this dictation as a professional email:
- Add appropriate greeting if missing
- Structure into paragraphs
- Professional but warm tone
- Add signature placeholder [Your Name]
Output ONLY the email text.""",
        "tone": "formal",
        "auto_switch_apps": ["mail", "outlook", "thunderbird", "gmail"],
        "sort_order": 1
    },
    {
        "name": "Notes",
        "description": "Quick notes and bullet points",
        "system_prompt": """Convert to organized notes:
- Use bullet points for lists
- Keep it concise
- Preserve key information
- Use markdown formatting
Output ONLY the notes.""",
        "tone": "casual",
        "auto_switch_apps": ["notion", "obsidian", "notes", "bear"],
        "sort_order": 2
    },
    {
        "name": "Code Comment",
        "description": "Technical documentation style",
        "system_prompt": """Format as code documentation:
- Technical, precise language
- Preserve any code-like content exactly
- Use proper terminology
- Keep concise
Output ONLY the text.""",
        "tone": "technical",
        "auto_switch_apps": ["code", "vscode", "xcode", "intellij", "pycharm", "terminal", "iterm"],
        "sort_order": 3
    },
    {
        "name": "Assistant",
        "description": "AI assistant mode - execute commands",
        "system_prompt": """You are a helpful AI assistant. The user's speech may contain:
1. Direct dictation (transcribe and clean)
2. Commands (execute them)
3. Questions (answer them)

Detect the intent and respond appropriately.
For commands like "make this bold" or "translate to Spanish", execute them.
For questions, provide helpful answers.
For dictation, just clean it up.""",
        "use_ai_polish": True,
        "tone": "casual",
        "sort_order": 4
    }
]


def seed_default_modes(db_session):
    """Seed default modes if none exist"""
    existing = db_session.query(Mode).filter(Mode.user_id == "default").first()
    if existing:
        return  # Already seeded

    for mode_data in DEFAULT_MODES:
        mode = Mode(user_id="default", **mode_data)
        db_session.add(mode)

    db_session.commit()
    print("[DB] Seeded default modes")
