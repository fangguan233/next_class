import os
import platform
import subprocess
import json
import time
import threading
import glob
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, render_template
from dotenv import load_dotenv

# --- Configuration ---
load_dotenv()
ADMIN_PORT = int(os.getenv('ADMIN_PORT', 5001))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PID_FILE = os.path.join(SCRIPT_DIR, 'process_info.json')
LOG_DIR = os.path.join(SCRIPT_DIR, 'logs')
MAIN_APP_SCRIPT = os.path.join(SCRIPT_DIR, 'app.py')
SHARE_CONFIG_DIR = os.path.join(SCRIPT_DIR, 'shared_configs')
SHARE_CONFIG_EXPIRATION_HOURS = int(os.getenv('SHARE_CONFIG_EXPIRATION_HOURS', 24))

# --- Flask App Initialization ---
app = Flask(__name__, template_folder='templates', static_folder='static')


# --- Core Process Management Functions ---

def get_process_info():
    """Reads PID and log path from the status file."""
    if not os.path.exists(PID_FILE):
        return None
    try:
        with open(PID_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return None

def is_process_running(pid):
    """Checks if a process with the given PID is running."""
    if pid is None:
        return False
    system = platform.system()
    try:
        if system == "Windows":
            # The 'tasklist' command is more reliable than 'os.kill' on Windows.
            # It returns output if the process exists.
            output = subprocess.check_output(
                ["tasklist", "/fi", f"pid eq {pid}"],
                stderr=subprocess.STDOUT
            )
            return str(pid) in output.decode('utf-8', errors='ignore')
        else: # Linux, macOS
            # os.kill with signal 0 is a standard way to check for process existence.
            os.kill(pid, 0)
            return True
    except (subprocess.CalledProcessError, OSError):
        # CalledProcessError for tasklist, OSError for os.kill
        return False

def start_main_process():
    """Starts the main application by executing the appropriate start script."""
    if is_process_running(get_process_info().get('pid') if get_process_info() else None):
        return {"success": False, "message": "Main application is already running."}

    system = platform.system()
    script_path = ""
    
    # The start scripts are in the parent directory of SCRIPT_DIR (which is 'backend')
    project_root = os.path.dirname(SCRIPT_DIR)

    if system == "Windows":
        script_path = os.path.join(project_root, 'start_main_app.cmd')
    else: # Linux, macOS
        script_path = os.path.join(project_root, 'start_main_app.sh')

    if not os.path.exists(script_path):
        return {"success": False, "message": f"Start script not found at: {script_path}"}
        
    try:
        # Execute the script. On Linux, we might need to ensure it's executable.
        if system != "Windows":
            os.chmod(script_path, 0o755) # Make executable
        
        # Using Popen to run the script in a non-blocking way.
        # For Windows, `start` inside the .cmd does the trick.
        # For Linux, the .sh should handle backgrounding itself (e.g., with nohup or &).
        subprocess.Popen(script_path, shell=True, cwd=project_root)
        
        # Wait a moment for the app to start and write its PID file
        time.sleep(3) 
        return {"success": True, "message": f"Execution of {os.path.basename(script_path)} initiated."}
    except Exception as e:
        return {"success": False, "message": f"Failed to execute start script: {e}"}

def stop_main_process():
    """Stops the main application process."""
    info = get_process_info()
    if not info or not is_process_running(info.get('pid')):
        # If the file exists but process is dead, clean it up.
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        return {"success": False, "message": "Main application is not running or PID file is missing."}

    pid = info['pid']
    system = platform.system()
    
    try:
        if system == "Windows":
            subprocess.check_call(["taskkill", "/F", "/PID", str(pid)])
        else: # Linux, macOS
            os.kill(pid, 9) # SIGKILL
        
        # Cleanup is now handled by atexit in app.py, but we can double-check
        if os.path.exists(PID_FILE):
             os.remove(PID_FILE)

        return {"success": True, "message": f"Process {pid} stopped."}
    except Exception as e:
        return {"success": False, "message": f"Failed to stop process {pid}: {e}"}


# --- Watchdog for Auto-Restart ---

def watchdog_thread():
    """A daemon thread that monitors the main app and restarts it if it crashes."""
    print(" * Watchdog thread started. Monitoring main application...")
    while True:
        # We perform the check internally instead of calling the API endpoint
        # to avoid request overhead and potential deadlocks.
        info = get_process_info()
        if info: # PID file exists, check if the process is alive
            if not is_process_running(info.get('pid')):
                print("! Watchdog: Main app has crashed. Attempting to restart...")
                start_main_process()
        
        # Check every 15 seconds
        time.sleep(15)

# --- API Endpoints ---

@app.route('/api/admin/status', methods=['GET'])
def get_status():
    """API endpoint to get the status of the main application."""
    info = get_process_info()
    if not info:
        return jsonify({"status": "stopped", "pid": None, "start_time": None})

    pid = info.get('pid')
    if is_process_running(pid):
        return jsonify({"status": "running", "pid": pid, "start_time": info.get("start_time")})
    else:
        # Process is not running, but pid file exists. It has crashed.
        # Clean up the stale PID file.
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        return jsonify({"status": "crashed", "pid": pid, "start_time": info.get("start_time")})

@app.route('/api/admin/start', methods=['POST'])
def start_app():
    """API endpoint to start the main application."""
    result = start_main_process()
    return jsonify(result)

@app.route('/api/admin/stop', methods=['POST'])
def stop_app():
    """API endpoint to stop the main application."""
    result = stop_main_process()
    return jsonify(result)

@app.route('/api/admin/logs', methods=['GET'])
def get_logs():
    """API endpoint to get the latest log entries."""
    info = get_process_info()
    if not info or not info.get('log_path'):
        return jsonify({"success": False, "logs": "Log file not specified."}), 404

    log_path = info['log_path']
    if not os.path.exists(log_path):
        return jsonify({"success": False, "logs": f"Log file not found at: {log_path}"}), 404

    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            # Read last N lines for efficiency
            lines = f.readlines()
            last_100_lines = "".join(lines[-100:])
            return jsonify({"success": True, "logs": last_100_lines})
    except Exception as e:
        return jsonify({"success": False, "logs": f"Error reading log file: {e}"}), 500

# --- Share Code Management API ---

@app.route('/api/admin/share-codes', methods=['GET'])
def get_share_codes():
    """
    API endpoint to list all share codes by reading their internal metadata.
    """
    if not os.path.exists(SHARE_CONFIG_DIR):
        return jsonify([])

    codes = []
    now = time.time()

    for file_path in glob.glob(os.path.join(SHARE_CONFIG_DIR, "*.json")):
        try:
            basename = os.path.basename(file_path)
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            metadata = data.get("_metadata", {})
            created_at = metadata.get("created_at")
            expires_at = metadata.get("expires_at")
            if created_at is None: continue # Skip files without metadata

            # Calculate remaining time
            if expires_at == -1:
                expires_in_seconds = 'infinite' # Use a string literal for JSON compatibility
            else:
                expires_in_seconds = expires_at - now

            codes.append({
                "code": basename.split('_')[0],
                "filename": basename,
                "creation_time": datetime.fromtimestamp(created_at).strftime('%Y-%m-%d %H:%M:%S'),
                "expires_in_seconds": expires_in_seconds
            })
        except (json.JSONDecodeError, IndexError, KeyError):
            continue # Skip corrupted or malformed files
    
    return jsonify(sorted(codes, key=lambda x: x['creation_time'], reverse=True))

@app.route('/api/admin/share-codes/update-expiry', methods=['POST'])
def update_share_code_expiry():
    """
    API endpoint to update the expiry time by modifying the _metadata.expires_at field in the JSON file.
    """
    data = request.get_json()
    filename = data.get('filename')
    new_expiry_hours_str = data.get('new_expiry_hours')

    if not filename or new_expiry_hours_str is None:
        return jsonify({"success": False, "message": "Missing filename or new_expiry_hours."}), 400

    file_path = os.path.join(SHARE_CONFIG_DIR, filename)
    if not os.path.exists(file_path):
        return jsonify({"success": False, "message": "File not found."}), 404
        
    try:
        # Read the existing file content
        with open(file_path, 'r', encoding='utf-8') as f:
            file_data = json.load(f)
        
        if "_metadata" not in file_data:
            return jsonify({"success": False, "message": "File is missing _metadata field."}), 400
        # Calculate new expiry timestamp
        if new_expiry_hours_str == -1:
            new_expires_at = -1 # -1 represents infinity
            message = f"'{filename}' set to never expire."
        else:
            new_expiry_hours = float(new_expiry_hours_str)
            if new_expiry_hours < 0:
                return jsonify({"success": False, "message": "Expiry hours cannot be negative (except for -1)."}), 400
            
            new_expires_at = int(time.time() + new_expiry_hours * 3600)
            message = f"Expiry for '{filename}' updated to {new_expiry_hours} hours from now."

        # Update the metadata and write back to the file
        file_data["_metadata"]["expires_at"] = new_expires_at
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(file_data, f, indent=4, ensure_ascii=False)
            
        return jsonify({"success": True, "message": message})

    except (ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid value for new_expiry_hours. Must be a number or 'infinite'."}), 400
    except json.JSONDecodeError:
        return jsonify({"success": False, "message": "Could not parse file data."}), 500
    except Exception as e:
        return jsonify({"success": False, "message": f"An error occurred: {e}"}), 500


@app.route('/')
def index():
    """Serves the admin panel's HTML page."""
    return render_template('admin.html')

if __name__ == '__main__':
    # Ensure log directory exists
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)
# Start the watchdog thread
    monitor_thread = threading.Thread(target=watchdog_thread, daemon=True)
    monitor_thread.start()

    # Start the Flask application
    app.run(host='0.0.0.0', port=ADMIN_PORT, debug=True, use_reloader=False)
