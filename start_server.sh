#!/bin/bash

echo "Starting Flask Server in Conda Base Environment..."

# Initialize Conda for this shell session
eval "$(conda shell.bash hook)"

# Activate the base conda environment
conda activate base

# Navigate to the backend directory
cd backend || exit

# Install dependencies using the environment's pip
echo "Installing/updating dependencies..."
pip install -r requirements.txt --upgrade

# Start the Flask server in the background
export FLASK_RUN_PORT=1000
echo "Starting server on http://127.0.0.1:$FLASK_RUN_PORT"
nohup python app.py &

# Get the process ID (PID) of the last background command
PID=$!
echo "Server started with PID: $PID"

# Save the PID to a file
echo $PID > server.pid

echo "Server PID saved to server.pid. Check nohup.out for logs."
