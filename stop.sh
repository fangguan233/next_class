#!/bin/bash

PID_FILE="backend/server.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    echo "Stopping server with PID: $PID"
    
    # Check if the process is still running
    if ps -p $PID > /dev/null; then
        kill $PID
        echo "Server stopped."
    else
        echo "Process with PID $PID not found. Maybe it was already stopped."
    fi
    
    rm "$PID_FILE"
else
    echo "PID file not found. Is the server running?"
fi
