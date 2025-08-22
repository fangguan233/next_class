import os
import platform
import subprocess
import json
import time
import threading
import glob
import logging
import warnings
from datetime import datetime, timedelta
import requests
from flask import Flask, jsonify, request, render_template
from dotenv import load_dotenv
from urllib3.exceptions import InsecureRequestWarning

# Suppress only the single InsecureRequestWarning from urllib3 needed for self-signed certs.
warnings.filterwarnings('ignore', category=InsecureRequestWarning)

# --- Configuration ---
load_dotenv()
ADMIN_PORT = int(os.getenv('ADMIN_PORT', 5001))
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PID_FILE = os.path.join(SCRIPT_DIR, 'process_info.json')
LOG_DIR = os.path.join(SCRIPT_DIR, 'logs')
MAIN_APP_SCRIPT = os.path.join(SCRIPT_DIR, 'app.py')
SHARE_CONFIG_DIR = os.path.join(SCRIPT_DIR, 'shared_configs')
SHARE_CONFIG_EXPIRATION_HOURS = int(os.getenv('SHARE_CONFIG_EXPIRATION_HOURS', 24))

# --- Custom Log Filter for Admin App ---
class AdminLogFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        # Filter out successful polling requests from the admin frontend
        if 'GET /api/admin/status HTTP/1.1" 200' in msg:
            return False
        if 'GET /api/admin/logs HTTP/1.1" 200' in msg:
            return False
        if 'GET /api/admin/share-codes HTTP/1.1" 200' in msg:
            return False
        return True

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

def check_service_health():
    """
    Performs a network health check on the main application.
    Returns True if healthy, False otherwise.
    """
    try:
        # Read .env to determine protocol and port
        enable_https = os.getenv('ENABLE_HTTPS', 'false').lower() == 'true'
        protocol = 'https' if enable_https else 'http'
        port = os.getenv('HTTPS_PORT', 443) if enable_https else os.getenv('HTTP_PORT', 2000)
        
        health_url = f"{protocol}://127.0.0.1:{port}/api/health"
        
        # Make the request with a short timeout.
        # `verify=False` is used to ignore SSL certificate validation for localhost checks.
        response = requests.get(health_url, timeout=3, verify=False)
        
        # Check for a 200 OK status and expected response
        if response.status_code == 200 and response.json().get("status") == "ok":
            return True
    except requests.exceptions.RequestException as e:
        # Any network-level error (timeout, connection refused, etc.)
        print(f"Health check failed: {e}")
    except (json.JSONDecodeError, KeyError):
        # The service responded, but not with the expected JSON
        print("Health check failed: Invalid JSON response.")
    return False

def is_process_running(pid):
    """
    Checks if a process with the given PID is running.
    Uses 'ps' command on Linux/macOS for better reliability, similar to stop.sh.
    """
    if pid is None:
        return False
    system = platform.system()
    try:
        if system == "Windows":
            # The 'tasklist' command is more reliable on Windows.
            output = subprocess.check_output(["tasklist", "/fi", f"pid eq {pid}"], stderr=subprocess.STDOUT)
            return str(pid) in output.decode('utf-8', errors='ignore')
        else:  # Linux, macOS
            # Using 'ps -p' is more robust than 'os.kill'. It returns a non-zero exit code if the process doesn't exist.
            subprocess.check_output(["ps", "-p", str(pid)], stderr=subprocess.STDOUT)
            return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        # CalledProcessError means the command ran but the process was not found.
        # FileNotFoundError would mean the 'ps' or 'tasklist' command doesn't exist.
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
    """A daemon thread that monitors the main app and restarts it if it crashes or becomes unresponsive."""
    print(" * Watchdog thread started. Monitoring main application...")
    while True:
        time.sleep(15) # Check every 15 seconds
        info = get_process_info()
        if not info:
            continue # Main app is stopped, nothing to do.

        pid = info.get('pid')
        process_is_alive = is_process_running(pid)
        service_is_healthy = False

        if process_is_alive:
            service_is_healthy = check_service_health()
        
        # Restart if the process has crashed OR if the service is unresponsive
        if not process_is_alive:
            print(f"! Watchdog: Main app process (PID: {pid}) has crashed. Attempting to restart...")
            start_main_process()
        elif not service_is_healthy:
            print(f"! Watchdog: Main app service (PID: {pid}) is unresponsive. Attempting to restart...")
            stop_main_process() # First, try to stop the unresponsive process gracefully
            time.sleep(2) # Give it a moment to die
            start_main_process()

# --- API Endpoints ---

@app.route('/api/admin/status', methods=['GET'])
def get_status():
    """API endpoint to get the status of the main application."""
    info = get_process_info()
    if not info:
        return jsonify({"status": "stopped", "pid": None, "start_time": None, "health": "unknown"})

    pid = info.get('pid')
    if is_process_running(pid):
        # Process is running, now check service health
        is_healthy = check_service_health()
        status = "running_healthy" if is_healthy else "running_unhealthy"
        return jsonify({"status": status, "pid": pid, "start_time": info.get("start_time"), "health": "ok" if is_healthy else "failed"})
    else:
        # Process is not running, but pid file exists. It has crashed.
        # Clean up the stale PID file.
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        return jsonify({"status": "crashed", "pid": pid, "start_time": info.get("start_time"), "health": "unknown"})

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
    """API endpoint to get the latest log entries with enhanced debugging."""
    info = get_process_info()
    if not info or not info.get('log_path'):
        return jsonify({"success": False, "logs": "Log file path not found in process_info.json."}), 404

    log_path = info['log_path']
    
    # Enhanced check with current working directory for debugging
    if not os.path.exists(log_path):
        current_working_dir = os.getcwd()
        error_message = (
            f"Log file not found at path: '{log_path}'.\n"
            f"Admin app's current working directory is: '{current_working_dir}'.\n"
            f"Please check if the path is absolute or relative and accessible from the CWD."
        )
        return jsonify({"success": False, "logs": error_message}), 404

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
    # --- Cleanup and Initialization ---
    print("Admin application starting...")
    
    # 1. Clean up stray .log files in the 'backend' directory upon start
    print("Cleaning up old log files in the root of the backend directory...")
    stray_logs = glob.glob(os.path.join(SCRIPT_DIR, '*.log'))
    for log_file in stray_logs:
        try:
            os.remove(log_file)
            print(f"Removed stray log file: {os.path.basename(log_file)}")
        except OSError as e:
            print(f"Error removing stray log file {os.path.basename(log_file)}: {e}")

    # 2. Ensure log directory for the admin app itself exists
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)
    
    # 3. Apply the custom log filter to Werkzeug's logger
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.addFilter(AdminLogFilter())

    # 4. Start the watchdog thread
    monitor_thread = threading.Thread(target=watchdog_thread, daemon=True)
    monitor_thread.start()

    # 5. Start the Flask application
    app.run(host='0.0.0.0', port=ADMIN_PORT, debug=True, use_reloader=False)
