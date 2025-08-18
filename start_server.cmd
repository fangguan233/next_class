@echo off
echo Starting Flask Server...

REM Navigate to the backend directory
cd backend

REM Start the Flask server
echo Starting server on http://127.0.0.1:2000
python app.py

REM Pause the script to see the output
pause
