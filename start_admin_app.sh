#!/bin/bash
# Get the directory of the currently running script
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PID_FILE="$SCRIPT_DIR/backend/admin.pid"
# Change to the backend directory
cd "$SCRIPT_DIR/backend"
# Start the admin app in the background using nohup
nohup python3 admin_app.py &> /dev/null &
# Save the PID of the last background process
echo $! > "$PID_FILE"
echo "Admin application started."