#!/bin/bash
# Voice-Flow macOS Setup Script
# Run this script to set up the development environment

set -e

echo "=========================================="
echo "  Voice-Flow macOS Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: This script is for macOS only${NC}"
    exit 1
fi

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}Installing Homebrew...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Check for Python 3.10+
echo -e "${YELLOW}Checking Python version...${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    echo "Found Python $PYTHON_VERSION"

    # Check if version is at least 3.10
    MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)

    if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 10 ]); then
        echo -e "${YELLOW}Python 3.10+ required. Installing via Homebrew...${NC}"
        brew install python@3.11
    fi
else
    echo -e "${YELLOW}Python not found. Installing via Homebrew...${NC}"
    brew install python@3.11
fi

# Check for Node.js
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing via Homebrew...${NC}"
    brew install node
fi

NODE_VERSION=$(node -v)
echo "Found Node.js $NODE_VERSION"

# Check for FFmpeg
echo -e "${YELLOW}Checking FFmpeg...${NC}"
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}FFmpeg not found. Installing via Homebrew...${NC}"
    brew install ffmpeg
fi

FFMPEG_VERSION=$(ffmpeg -version | head -n1)
echo "Found $FFMPEG_VERSION"

# Create Python virtual environment
echo -e "${YELLOW}Setting up Python virtual environment...${NC}"
cd "$(dirname "$0")/backend"

if [ -d "venv" ]; then
    echo "Virtual environment already exists"
else
    python3 -m venv venv
    echo "Virtual environment created"
fi

# Activate venv and install dependencies
source venv/bin/activate

echo -e "${YELLOW}Installing Python dependencies...${NC}"
pip install --upgrade pip
pip install -r requirements.txt

# Check for MPS (Metal Performance Shaders) support
echo -e "${YELLOW}Checking GPU support...${NC}"
python3 -c "
import torch
print(f'PyTorch version: {torch.__version__}')
if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    print('MPS (Apple Silicon GPU) is available!')
else:
    print('MPS not available, will use CPU')
"

deactivate
cd ..

# Install Node.js dependencies
echo -e "${YELLOW}Installing Node.js dependencies...${NC}"

# Root dependencies
npm install

# Frontend dependencies
cd frontend
npm install
cd ..

# Electron dependencies
cd app
npm install
cd ..

echo ""
echo -e "${GREEN}=========================================="
echo "  Setup Complete!"
echo "==========================================${NC}"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""
echo "Or start individual services:"
echo "  npm run dev:backend     # FastAPI on :8000"
echo "  npm run dev:frontend    # Vite on :5173"
echo "  npm run dev:electron    # Electron app"
echo ""
echo -e "${YELLOW}Important: Grant accessibility permissions to Terminal/iTerm"
echo "System Preferences > Security & Privacy > Privacy > Accessibility${NC}"
echo ""
