@echo off
echo Starting Flask Server...

REM Navigate to the backend directory
cd backend

REM Install dependencies
echo Installing/updating dependencies...
python -m pip install -r requirements.txt --upgrade

REM Start the Flask server
echo Starting server on http://127.0.0.1:5000
python app.py

REM Pause the script to see the output
pause
