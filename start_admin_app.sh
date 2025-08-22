#!/bin/bash
# Get the directory of the currently running script
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PID_FILE="$SCRIPT_DIR/backend/admin.pid"

# Change to the backend directory
cd "$SCRIPT_DIR/backend"

# Define log file path
LOG_DIR="logs"
ADMIN_LOG_FILE="$LOG_DIR/admin_app.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Start the admin app in the background, redirecting output to a log file
nohup python3 admin_app.py > "$ADMIN_LOG_FILE" 2>&1 &

# Save the PID of the last background process
echo $! > "$PID_FILE"

echo "Admin application started. Logs are being written to backend/$ADMIN_LOG_FILE"
