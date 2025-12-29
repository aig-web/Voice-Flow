#!/bin/bash
# Stop Typing - Start All Services (macOS)
# This script starts backend, frontend, and electron app

set -e

echo "======================================"
echo "  Stop Typing - Starting Services"
echo "======================================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down services..."
    kill $BACKEND_PID $FRONTEND_PID $ELECTRON_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start Backend
echo "Starting Backend..."
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
echo "Waiting for backend to start..."
sleep 5

# Start Frontend
echo "Starting Frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to be ready
echo "Waiting for frontend to start..."
sleep 5

# Start Electron
echo "Starting Electron..."
cd app
npm run dev &
ELECTRON_PID=$!
cd ..

echo ""
echo "======================================"
echo "  ✅ All services started!"
echo "======================================"
echo ""
echo "Backend PID: $BACKEND_PID (http://localhost:8000)"
echo "Frontend PID: $FRONTEND_PID (http://localhost:5173)"
echo "Electron PID: $ELECTRON_PID"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all processes
wait
