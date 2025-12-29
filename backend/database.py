from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./voiceflow.db")

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
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "raw_text": self.raw_text,
            "polished_text": self.polished_text,
            "duration": self.duration,
            "created_at": self.created_at.isoformat()
        }


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, default="default", unique=True)
    tone = Column(String, default="formal")  # formal, casual, technical
    personal_dictionary = Column(JSON, default={})  # {"mishearing": "correction"}
    record_hotkey = Column(String, default="Ctrl+Alt")  # Global hotkey for recording (hold to record)
    language = Column(String, default="en")  # Language code: en, es, fr, de, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "tone": self.tone,
            "personal_dictionary": self.personal_dictionary or {},
            "record_hotkey": self.record_hotkey or "Ctrl+Alt",
            "language": self.language or "en",
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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "trigger": self.trigger,
            "content": self.content,
            "use_count": self.use_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
