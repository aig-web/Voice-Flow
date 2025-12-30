#!/bin/bash
# Voice-Flow macOS Start Script
# Starts all services for development

set -e

cd "$(dirname "$0")"

echo "Starting Voice-Flow..."

# Check if setup has been run
if [ ! -d "backend/venv" ]; then
    echo "Error: Virtual environment not found. Run ./setup.sh first"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Error: Node modules not found. Run ./setup.sh first"
    exit 1
fi

# Start all services
npm run dev
