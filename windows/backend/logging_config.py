"""
Voice-Flow Logging Configuration
Provides structured logging with file rotation and proper log levels
"""

import logging
import logging.handlers
import sys
from pathlib import Path
from datetime import datetime


def setup_logging(log_level: str = "INFO", log_dir: str = ".logs") -> logging.Logger:
    """
    Configure structured logging for Voice-Flow backend.

    Args:
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR)
        log_dir: Directory for log files

    Returns:
        Root logger instance
    """
    # Create log directory
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)

    # Create formatters
    console_formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%H:%M:%S'
    )

    file_formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)s | %(funcName)s:%(lineno)d | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Console handler (human-readable)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)
    console_handler.setLevel(logging.DEBUG)

    # File handler (rotating, 5MB max, keep 3 files)
    file_handler = logging.handlers.RotatingFileHandler(
        log_path / f"voiceflow-{datetime.now().strftime('%Y%m%d')}.log",
        maxBytes=5 * 1024 * 1024,  # 5MB
        backupCount=3,
        encoding='utf-8'
    )
    file_handler.setFormatter(file_formatter)
    file_handler.setLevel(logging.DEBUG)

    # Error file handler (errors only)
    error_handler = logging.handlers.RotatingFileHandler(
        log_path / "voiceflow-errors.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=2,
        encoding='utf-8'
    )
    error_handler.setFormatter(file_formatter)
    error_handler.setLevel(logging.ERROR)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove existing handlers to avoid duplicates
    root_logger.handlers.clear()

    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(error_handler)

    # Silence noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("nemo").setLevel(logging.WARNING)
    logging.getLogger("pytorch_lightning").setLevel(logging.WARNING)
    logging.getLogger("torch").setLevel(logging.WARNING)

    return logging.getLogger("voiceflow")


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger for a specific module.

    Args:
        name: Module name (e.g., 'transcribe', 'websocket', 'database')

    Returns:
        Logger instance with voiceflow prefix
    """
    return logging.getLogger(f"voiceflow.{name}")


# Pre-configured loggers for common modules
transcribe_logger = get_logger("transcribe")
ws_logger = get_logger("websocket")
db_logger = get_logger("database")
api_logger = get_logger("api")
