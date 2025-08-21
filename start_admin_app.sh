#!/bin/bash
# Get the directory of the currently running script
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# Change to the backend directory to run the python script
cd "$SCRIPT_DIR/backend"

echo "Starting admin application (admin_app.py)..."
python3 admin_app.py
