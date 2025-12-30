@echo off
REM ============================================================
REM Voice-Flow Server Startup Script
REM ============================================================

cd /d "%~dp0"

REM Set cache directories
set HF_HOME=%CD%\.cache\huggingface
set NEMO_CACHE_DIR=%CD%\.cache\nemo
set TMPDIR=%CD%\.cache\tmp
set TEMP=%CD%\.cache\tmp
set TMP=%CD%\.cache\tmp

REM Activate virtual environment
call venv\Scripts\activate.bat

echo.
echo ============================================================
echo Starting Voice-Flow Server with Parakeet STT
echo ============================================================
echo.

python main.py
