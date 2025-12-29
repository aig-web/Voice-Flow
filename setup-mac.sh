#!/bin/bash
# Stop Typing - macOS Setup Script
# Run this script after cloning the repository

set -e

echo "======================================"
echo "  Stop Typing - macOS Setup"
echo "======================================"
echo ""

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "✅ Homebrew found"
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing..."
    brew install node
else
    NODE_VERSION=$(node -v)
    echo "✅ Node.js found: $NODE_VERSION"
fi

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python not found. Installing..."
    brew install python@3.10
else
    PYTHON_VERSION=$(python3 --version)
    echo "✅ Python found: $PYTHON_VERSION"
fi

# Check for FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg not found. Installing..."
    brew install ffmpeg
else
    echo "✅ FFmpeg found"
fi

echo ""
echo "======================================"
echo "  Installing Node Dependencies"
echo "======================================"
npm run install:all

echo ""
echo "======================================"
echo "  Setting up Python Backend"
echo "======================================"
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate and install requirements
echo "Installing Python dependencies (this may take a while)..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-mac.txt

cd ..

echo ""
echo "======================================"
echo "  ✅ Setup Complete!"
echo "======================================"
echo ""
echo "To run the app, open 3 terminal windows:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend && npm run dev"
echo ""
echo "Terminal 3 (Electron):"
echo "  cd app && npm run dev"
echo ""
echo "Or run all at once with:"
echo "  npm run dev:mac"
echo ""
