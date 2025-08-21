#!/bin/bash
# Get the directory of the currently running script
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PID_FILE="$SCRIPT_DIR/backend/admin.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    kill "$PID"
    rm "$PID_FILE"
    echo "Admin application stopped."
else
    echo "Admin application is not running."
fi
