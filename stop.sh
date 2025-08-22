#!/bin/bash
# --- Define PID File Paths ---
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
MAIN_APP_INFO_FILE="$SCRIPT_DIR/backend/process_info.json"
ADMIN_APP_PID_FILE="$SCRIPT_DIR/backend/admin.pid"
# --- Stop Main Application ---
if [ -f "$MAIN_APP_INFO_FILE" ]; then
    # Extract PID from the JSON file using a simple tool like grep/sed
    PID=$(grep -o '"pid": [0-9]*' "$MAIN_APP_INFO_FILE" | sed 's/"pid": //')
    
    if [ -n "$PID" ] && ps -p "$PID" > /dev/null; then
        echo "Stopping main application (PID: $PID) and its children..."
        # Use pkill to kill the parent process and all its children
        pkill -P "$PID"
        # Also kill the parent itself
        kill "$PID"
        echo "Main application stopped."
    else
        echo "Main application process not found, but cleaning up info file."
    fi
    # Remove the info file regardless
    rm "$MAIN_APP_INFO_FILE"
else
    echo "Main application is not running (no process_info.json found)."
fi
# --- Stop Admin Application ---
if [ -f "$ADMIN_APP_PID_FILE" ]; then
    PID=$(cat "$ADMIN_APP_PID_FILE")
    if [ -n "$PID" ] && ps -p "$PID" > /dev/null; then
        echo "Stopping admin application (PID: $PID)..."
        kill "$PID"
        echo "Admin application stopped."
    else
        echo "Admin application process not found, but cleaning up PID file."
    fi
    # Remove the PID file
    rm "$ADMIN_APP_PID_FILE"
else
    echo "Admin application is not running (no admin.pid found)."
fi
echo "All services stopped."
