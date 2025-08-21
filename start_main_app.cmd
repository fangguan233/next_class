@echo off
REM Get the directory of the currently running script
set SCRIPT_DIR=%~dp0

REM Change to the backend directory to run the python script
cd /D "%SCRIPT_DIR%backend"

echo "Starting main application (app.py)..."
python app.py
