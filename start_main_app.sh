#!/bin/bash
# Get the directory of the currently running script
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# Change to the backend directory to run the python script
cd "$SCRIPT_DIR/backend"

echo "Starting main application (app.py) in the background..."
# Start the app in the background using nohup.
# All output (stdout/stderr) will now be handled by the logging setup within app.py
nohup python3 app.py &

echo "Main application started."
