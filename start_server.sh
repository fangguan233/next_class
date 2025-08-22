#!/bin/bash
# Script to start the Flask server in the background using nohup and manage PID.
# Navigate to the directory where this script is located
cd "$(dirname "$0")"
# Navigate to the backend directory
cd backend
PID_FILE="server.pid"
LOG_FILE="server.log"
# Check if server is already running by checking the PID file
if [ -f "$PID_FILE" ]; then
    echo "PID file found. Server might be running with PID $(cat "$PID_FILE"). Please run stop.sh first."
    exit 1
fi
echo "Searching for SSL certificates..."
# Check if certificate and key exist before starting
if [ ! -f "certificate.crt" ] || [ ! -f "private.key" ]; then
    echo "!!! CRITICAL ERROR: SSL certificate or key not found. !!!"
    echo "!!! Please ensure 'certificate.crt' and 'private.key' exist in the current directory. !!!"
    exit 1
fi
echo "SSL certificates found. Starting server in HTTPS mode in the background..."
# Execute the Flask app using python3 in the background with nohup
# Redirect stdout and stderr to the log file
nohup python3 app.py > "$LOG_FILE" 2>&1 &
# Get the PID of the last background process
PID=$!
# Write the PID to the PID file for the stop script to use
echo $PID > "$PID_FILE"
echo "Server started successfully in the background with PID: $PID"
echo "Output is being logged to $LOG_FILE"
