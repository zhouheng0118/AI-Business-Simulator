#!/bin/bash
echo "Starting AI Business Simulator..."

# Check for Python
if ! command -v python3 &> /dev/null
then
    echo "[ERROR] python3 could not be found!"
    echo "Please install Python from https://www.python.org/downloads/"
    exit 1
fi

echo "[1/2] Starting Backend Server..."
# Run backend in a subshell in the background
(
    cd backend || exit
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    source .venv/bin/activate
    pip install -r requirements.txt
    python3 -m uvicorn main:app --reload
) &
BACKEND_PID=$!

echo "[2/2] Starting Frontend Server..."
# Run frontend in a subshell in the background
(
    cd frontend || exit
    npm install
    npm run dev
) &
FRONTEND_PID=$!

echo ""
echo "Both servers are starting up in the background!"
echo "Frontend will be available at: http://localhost:3000"
echo "Press Ctrl+C to stop both servers."
echo ""

# Wait for both background processes
wait $BACKEND_PID $FRONTEND_PID
