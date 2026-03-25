import os
import json
import re
import uuid
import requests
from flask import Flask, request, jsonify, send_from_directory, Blueprint, Response
from dotenv import load_dotenv
from openai import OpenAI
import random
import string
import time
import glob
from apscheduler.schedulers.background import BackgroundScheduler
from werkzeug.utils import secure_filename
import logging
from datetime import datetime
import atexit
import sys
import faulthandler
import signal

# 加载 .env 文件中的环境变量
load_dotenv()

# --- App and Process Configuration ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PID_FILE = os.path.join(SCRIPT_DIR, 'process_info.json')
LOG_DIR = os.path.join(SCRIPT_DIR, 'logs')
HEARTBEAT_FILE = os.path.join(LOG_DIR, 'heartbeat.json')
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv('HEARTBEAT_INTERVAL_SECONDS', 60))
HEARTBEAT_LOG_EACH = os.getenv('HEARTBEAT_LOG_EACH', 'false').lower() == 'true'

# 配置
app = Flask(__name__, static_folder='static')
ENABLE_IMAGE_PROCESSING = os.getenv('ENABLE_IMAGE_PROCESSING', 'false').lower() == 'true'

# 全局 ETag，在应用启动时生成
APP_ETAG = str(uuid.uuid4())
APP_START_TIME = time.time()

# --- Custom Log Filter ---
class HealthCheckFilter(logging.Filter):
    def filter(self, record):
        # Return False to prevent a log record from being processed.
        # This will filter out successful health check logs.
        return 'GET /api/health HTTP/1.1" 200' not in record.getMessage()

# --- Logging Setup ---
class StreamToLogger:
    """
    A helper class to redirect stdout/stderr to a logger instance.
    """
    def __init__(self, logger, level):
        self.logger = logger
        self.level = level
        self.linebuf = ''
    def write(self, buf):
        for line in buf.rstrip().splitlines():
            self.logger.log(self.level, line.rstrip())

    def flush(self):
        pass

def setup_logging():
    """
    Configures logging to a file and redirects stdout/stderr to the same file.
    This ensures that all output (including prints) goes to the log.
    """
    log_filename = f"app_{datetime.now().strftime('%Y-%m-%d')}.log"
    log_filepath = os.path.join(LOG_DIR, log_filename)
    
    # Ensure log directory exists
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)
        
    # Configure the root logger
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_filepath, encoding='utf-8'),
            logging.StreamHandler() # Keep console output as well
        ]
    )
    
    # Redirect stdout and stderr to the logging system
    stdout_logger = logging.getLogger('STDOUT')
    sys.stdout = StreamToLogger(stdout_logger, logging.INFO)
    
    stderr_logger = logging.getLogger('STDERR')
    sys.stderr = StreamToLogger(stderr_logger, logging.ERROR)

    return log_filepath

def setup_crash_logging():
    crash_filename = f"crash_{datetime.now().strftime('%Y-%m-%d')}.log"
    crash_filepath = os.path.join(LOG_DIR, crash_filename)
    crash_file = open(crash_filepath, 'a', buffering=1, encoding='utf-8')
    faulthandler.enable(file=crash_file, all_threads=True)

    def _existing_signals(signal_names):
        for name in signal_names:
            sig = getattr(signal, name, None)
            if sig is None:
                continue
            yield sig

    if hasattr(faulthandler, "register"):
        for sig in _existing_signals(("SIGSEGV", "SIGFPE", "SIGILL", "SIGBUS", "SIGTERM", "SIGINT")):
            try:
                faulthandler.register(sig, file=crash_file, all_threads=True)
            except (ValueError, OSError, RuntimeError):
                continue
    else:
        logging.warning("faulthandler.register() is unavailable; skipping signal registration.")

    def _handle_signal(signum, frame):
        logging.critical(f"Received signal {signum}, terminating.")
        faulthandler.dump_traceback(file=crash_file, all_threads=True)
        raise SystemExit(1)

    for sig in _existing_signals(("SIGTERM", "SIGINT", "SIGQUIT", "SIGHUP")):
        try:
            signal.signal(sig, _handle_signal)
        except (ValueError, OSError, AttributeError):
            continue

    def _log_unhandled_exception(exctype, value, tb):
        logging.critical("Unhandled exception", exc_info=(exctype, value, tb))
        faulthandler.dump_traceback(file=crash_file, all_threads=True)
        sys.__excepthook__(exctype, value, tb)

    sys.excepthook = _log_unhandled_exception
    return crash_filepath, crash_file

def _get_memory_rss_mb():
    try:
        status_path = '/proc/self/status'
        if not os.path.exists(status_path):
            return None
        with open(status_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('VmRSS:'):
                    parts = line.split()
                    if len(parts) >= 2:
                        kb = float(parts[1])
                        return round(kb / 1024, 2)
    except Exception:
        return None
    return None

def write_heartbeat(status="running"):
    now = time.time()
    data = {
        "pid": os.getpid(),
        "status": status,
        "timestamp": now,
        "uptime_seconds": int(now - APP_START_TIME),
        "memory_rss_mb": _get_memory_rss_mb(),
    }
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(HEARTBEAT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        if HEARTBEAT_LOG_EACH:
            logging.info(f"Heartbeat updated: {data}")
    except Exception as e:
        logging.warning(f"Failed to write heartbeat: {e}")

def check_previous_heartbeat():
    if not os.path.exists(HEARTBEAT_FILE):
        return
    try:
        with open(HEARTBEAT_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        last_ts = float(data.get("timestamp", 0))
        last_status = str(data.get("status", ""))
        age = time.time() - last_ts if last_ts else None
        if age is not None and age < max(HEARTBEAT_INTERVAL_SECONDS * 2, 120) and last_status != "stopped":
            logging.warning(f"Previous process likely exited unexpectedly (last heartbeat {int(age)}s ago, status={last_status}).")
    except Exception as e:
        logging.warning(f"Failed to read previous heartbeat: {e}")

# --- PID and Status File Management ---
def write_pid_file(log_path):
    """Writes process information to the status file."""
    pid = os.getpid()
    info = {
        "pid": pid,
        "status": "running",
        "log_path": os.path.abspath(log_path),
        "start_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    with open(PID_FILE, 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=4)
    logging.info(f"Application started with PID: {pid}. Status file '{PID_FILE}' created.")

def remove_pid_file():
    """Removes the status file upon clean exit."""
    try:
        write_heartbeat(status="stopped")
    except Exception:
        pass
    if os.path.exists(PID_FILE):
        os.remove(PID_FILE)
        logging.info(f"Application shutting down. Status file '{PID_FILE}' removed.")

# Register the cleanup function to be called on exit
atexit.register(remove_pid_file)

share_bp = Blueprint('share', __name__, url_prefix='/api/share')
SHARE_CONFIG_DIR = os.path.join(SCRIPT_DIR, 'shared_configs')
SHARE_CONFIG_EXPIRATION_HOURS = int(os.getenv('SHARE_CONFIG_EXPIRATION_HOURS', 24))
SHARE_RATE_LIMIT_SECONDS = int(os.getenv('SHARE_RATE_LIMIT_SECONDS', 60))

os.makedirs(SHARE_CONFIG_DIR, exist_ok=True)

# 用于存储每个IP的最后分享时间
share_timestamps = {}

AI_REQUEST_TIMEOUT = float(os.getenv("AI_REQUEST_TIMEOUT", "90"))
AI_ASSISTANT_MAX_CONTEXT_CHARS = int(os.getenv("AI_ASSISTANT_MAX_CONTEXT_CHARS", "800000"))
AI_ASSISTANT_MAX_IMAGE_CHARS = int(os.getenv("AI_ASSISTANT_MAX_IMAGE_CHARS", "8000000"))
AI_MODEL = os.getenv("AI_MODEL")
AI_API_KEY = os.getenv("DASHSCOPE_API_KEY")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")

missing_ai_env_vars = []
if not AI_MODEL:
    missing_ai_env_vars.append("AI_MODEL")
if not AI_API_KEY:
    missing_ai_env_vars.append("DASHSCOPE_API_KEY")
if missing_ai_env_vars:
    raise RuntimeError(
        f"Missing required environment variables: {', '.join(missing_ai_env_vars)}. "
        "Please configure them in backend/.env."
    )

client = OpenAI(
    api_key=AI_API_KEY,
    base_url=AI_BASE_URL,
    timeout=AI_REQUEST_TIMEOUT,
)

def _safe_chat_completion(**kwargs):
    extra_body = kwargs.get("extra_body")
    if not isinstance(extra_body, dict):
        extra_body = {}
    else:
        extra_body = dict(extra_body)

    extra_body.pop("thinking_budget", None)
    extra_body["enable_thinking"] = False
    kwargs["extra_body"] = extra_body

    try:
        return client.chat.completions.create(**kwargs)
    except BaseException as e:
        logging.exception("AI chat completion failed")
        raise ConnectionError(f"AI chat completion failed: {e}") from e

async def call_ai_model(user_input):
    """
    调用通义千问 Qwen3.5-Plus 模型来解析课程数据。
    """
    print(f"调用 {AI_MODEL} AI 接口，处理用户输入...")

    # 构建 few-shot 提示
    system_prompt = f"""
    你是一个专业的课程表数据解析助手。请将用户输入的文本解析为严格的JSON格式。
    输出的JSON必须是一个包含多个课程对象的数组。每个课程对象包含 'code', 'name', 'teachers', 和 'schedules' 字段。
    'schedules' 是一个数组，包含一个或多个上课安排对象。
    
    - 对于连续的周数，格式为 "n-m"。
    - 对于单周，格式为 "n,n+2,n+4,..."。
    - 对于双周，格式为 "n,n+2,n+4,..."。
    - 如果缺少任何关键信息（如周数、星期、节次），请直接忽略该门课程，不要包含在结果中。
    - 确保输出的是纯粹的JSON字符串，不包含任何额外的解释或```json标记。

    示例 1:
    输入: "课程代码: CS101, 课程名称: 计算机科学导论, 教师: 张三, 上课安排: 1-16周, 周三, 3-4节, 主校区, 教学楼A, 101室"
    输出: {json.dumps([{"code": "CS101", "name": "计算机科学导论", "teachers": ["张三"], "schedules": [{"weeks": "1-16", "day": "3", "time_slot": "3-4", "campus": "主校区", "building": "教学楼A", "classroom": "101"}]}], ensure_ascii=False)}

    示例 2 (单双周):
    输入: "线性代数(MATH202), 李四, 1-8周(单), 周一, 1-2节, 东校区, 理科楼, 203"
    输出: {json.dumps([{"code": "MATH202", "name": "线性代数", "teachers": ["李四"], "schedules": [{"weeks": "1,3,5,7", "day": "1", "time_slot": "1-2", "campus": "东校区", "building": "理科楼", "classroom": "203"}]}], ensure_ascii=False)}

    示例 3 (多个上课时间):
    输入: "大学物理, 王五, 周二5-6节(1-8周), 周四7-8节(1-8周), 西校区, 物理楼, 305"
    输出: {json.dumps([{"code": "PHY101", "name": "大学物理", "teachers": ["王五"], "schedules": [{"weeks": "1-8", "day": "2", "time_slot": "5-6", "campus": "西校区", "building": "物理楼", "classroom": "305"}, {"weeks": "1-8", "day": "4", "time_slot": "7-8", "campus": "西校区", "building": "物理楼", "classroom": "305"}]}], ensure_ascii=False)}
    """

    try:
        completion = _safe_chat_completion(
            model=AI_MODEL,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': f"请解析以下课程数据: {user_input}"}
            ],
            response_format={"type": "json_object"},
        )

        response_content = completion.choices[0].message.content
        print("AI 接口返回数据：", response_content)

        # 解析返回的JSON字符串
        parsed_data = json.loads(response_content)

        # 验证返回的数据结构
        if not isinstance(parsed_data, list):
             # 有时模型会返回一个包含courses键的对象，尝试从中提取
            if isinstance(parsed_data, dict) and 'courses' in parsed_data and isinstance(parsed_data['courses'], list):
                return parsed_data['courses']
            raise ValueError("解析后的数据不是预期的数组格式")
            
        return parsed_data

    except Exception as e:
        print(f"AI 接口调用或解析失败：{e}")
        raise ConnectionError(f"AI接口调用或解析失败: {e}")

# --- 后端冲突检测与AI自我修正 ---

def parse_weeks(weeks_str):
    """从字符串解析周数，返回一个周数的集合。"""
    if not isinstance(weeks_str, str):
        return set()
    
    weeks = set()
    parts = weeks_str.replace('，', ',').split(',')
    for part in parts:
        part = part.strip()
        single_match = re.match(r'(\d+)-(\d+)\(单\)', part)
        double_match = re.match(r'(\d+)-(\d+)\(双\)', part)
        range_match = re.match(r'(\d+)-(\d+)', part)

        try:
            if single_match:
                start, end = map(int, single_match.groups())
                for i in range(start, end + 1):
                    if i % 2 != 0: weeks.add(i)
            elif double_match:
                start, end = map(int, double_match.groups())
                for i in range(start, end + 1):
                    if i % 2 == 0: weeks.add(i)
            elif range_match:
                start, end = map(int, range_match.groups())
                for i in range(start, end + 1):
                    weeks.add(i)
            elif part.isdigit():
                weeks.add(int(part))
        except ValueError:
            continue # 忽略无法解析的部分
    return weeks

def detect_backend_conflicts(courses):
    """
    在后端对课程列表进行冲突检测。
    返回一个元组 (has_conflict: bool, conflict_report: str)。
    """
    calendar = {}  # key: f"{week}-{day}-{slot}", value: course_name
    conflict_pairs = set()
    if not isinstance(courses, list):
        return False, ""

    for course in courses:
        course_name = course.get("name", "未知课程")
        schedules = course.get("schedules", [])
        if not isinstance(schedules, list): continue
        for schedule in schedules:
            try:
                weeks = parse_weeks(schedule.get("weeks", ""))
                day = int(schedule.get("day", 0))
                time_slot = schedule.get("time_slot", "")
                if not time_slot or '-' not in time_slot: continue
                start_slot, end_slot = map(int, time_slot.split('-'))

                for week in weeks:
                    for slot in range(start_slot, end_slot + 1):
                        key = f"{week}-{day}-{slot}"
                        if key in calendar:
                            conflicting_course_name = calendar[key]
                            if conflicting_course_name != course_name:
                                pair = tuple(sorted((course_name, conflicting_course_name)))
                                conflict_pairs.add(pair)
                        else:
                            calendar[key] = course_name
            except (ValueError, TypeError, AttributeError):
                continue

    if not conflict_pairs:
        return False, ""

    report_lines = ["检测到以下课程对之间存在时间冲突:"]
    for pair in conflict_pairs:
        report_lines.append(f"- 课程 '{pair[0]}' 与 '{pair[1]}' 存在时间重叠。")
    
    return True, "\n".join(report_lines)

def build_correction_prompt(original_prompt, last_json_response, conflict_report):
    """构建用于修正错误的Prompt。"""
    return f"""
    你上次对我请求的回复中包含了时间冲突。请修正它。
    注意:如果缺少任何关键信息之一或更多（周数、星期、节次），请直接忽略该门课程，不要包含在结果中!!!
    
    这是我的原始请求：
    ---
    {original_prompt}
    ---
    
    这是你上次返回的、包含错误的JSON数据：
    ---
    {json.dumps(last_json_response, ensure_ascii=False, indent=2)}
    ---

    这是基于你的回复生成的冲突报告：
    ---
    {conflict_report}
    ---

    请仔细参考原始图片和上述冲突报告，重新生成一份完整的、没有时间冲突的课程表JSON。
    请务必确保所有课程的时间安排不再重叠。
    最终的输出必须是纯粹的、格式正确的JSON字符串，不包含任何额外的解释或标记。
    如果缺少任何关键信息之一或更多（周数、星期、节次），请直接忽略该门课程，不要包含在结果中!!!
    """

async def call_vision_model_with_correction(base64_images):
    """
    调用视觉模型，并内建一个自我修正循环来处理冲突。
    """
    initial_prompt = """
    你是一个专业的课程表图片解析助手。请仔细识别用户上传的所有课程表图片中的全部课程信息，并将它们合并、去重后，解析为单一的、严格的JSON格式。
    如果多张图片包含同一门课程，请将它们的上课安排合并到同一课程对象的 'schedules' 数组中。
    如果缺少任何关键信息之一或更多（周数、星期、节次），请直接忽略该门课程，不要包含在结果中!!!
    输出的JSON必须是一个包含多个课程对象的数组。每个课程对象必须包含 'code', 'name', 'teachers', 和 'schedules' 字段。
    'schedules' 是一个数组，包含一个或多个上课安排对象。
    如果缺少任何关键信息之一或更多（周数、星期、节次），请直接忽略该门课程，不要包含在结果中!!!
    
    - 'code': 课程代码，如果图片中没有，可以留空或基于课程名称生成一个。
    - 'name': 课程名称，必须准确识别。
    - 'teachers': 教师姓名，必须是一个数组。
    - 'schedules': 上课安排，每个对象包含:
        - 'weeks': 周数信息。对于连续周（如1-16周），格式为 "1-16"；对于单周（如1,3,5...周），格式为 "1,3,5,7,9,11,13,15"；对于双周（如2,4,6...周），格式为 "2,4,6,8,10,12,14,16"。请务必将单双周展开为逗号分隔的数字列表。对于不连续的周（如1-6周和8-17周），格式为 "1,2,3,4,5,6,8,9,10,11,12,13,14,15,16,17"。
        - 'day': 星期几，必须是 "1" 到 "7" 的数字字符串，其中1代表周一，7代表周日。
        - 'time_slot': 节次，格式为 "开始节-结束节"，例如 "1-2"。
        - 'campus': 校区，如果图片中有。
        - 'building': 教学楼，如果图片中有。
        - 'classroom': 教室，如果图片中有。

    - 如果图片中的一门课程在多个时间段上课，请为每个时间段在 'schedules' 数组中创建一个独立的对象。
    - 如果图片中某项信息不清晰或缺失，请尽力推断或留空，但不要编造。
    - 最终的输出必须是纯粹的、格式正确的JSON字符串，不包含任何额外的解释、注释或 markdown 的 ```json 标记。
    - 如果缺少任何关键信息之一或更多（周数、星期、节次），请直接忽略该门课程，不要包含在结果中!!!
    - 请特别注意：图片中的课程表可能以表格形式呈现，请仔细识别每一行和每一列对应的信息。
    - 如果图片中有多个课程表，请分别识别并合并所有课程。
    - 请确保识别的课程名称、教师姓名、上课时间等信息与图片内容完全一致。
    """
    
    max_retries = 2
    last_courses_response = None
    
    for i in range(max_retries + 1):
        print(f"--- 开始第 {i+1} 次尝试 ---")
        
        # 1. 构建 Prompt 和 Content
        prompt_to_use = initial_prompt
        if i > 0 and last_courses_response:
            prompt_to_use = build_correction_prompt(initial_prompt, last_courses_response, last_conflict_report)

        content = []
        for base64_image in base64_images:
            if ',' in base64_image: img_data = base64_image.split(',')[1]
            else: img_data = base64_image
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_data}"}})
        content.append({"type": "text", "text": prompt_to_use})

        # 2. 调用AI模型
        try:
            answer_content = ""

            completion = _safe_chat_completion(
                model=AI_MODEL,
                messages=[{"role": "user", "content": content}],
                stream=True,
            )

            for chunk in completion:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta.content is not None:
                    answer_content += delta.content

            full_response = answer_content
            print(f"第 {i+1} 次尝试，AI返回: {full_response[:200]}...")

            if full_response.strip().startswith("```json"):
                cleaned_response = full_response.strip()[7:-3].strip()
            else:
                cleaned_response = full_response.strip()
            
            courses = json.loads(cleaned_response)
            # 兼容模型返回 {"courses": [...]} 的情况
            if isinstance(courses, dict) and 'courses' in courses:
                courses = courses['courses']

        except Exception as e:
            print(f"第 {i+1} 次尝试失败: {e}")
            if i == max_retries: # 如果是最后一次尝试失败，则抛出异常
                 raise ConnectionError(f"AI在第{i+1}次尝试中调用或解析失败: {e}")
            last_courses_response = {"error": "AI response parsing failed"}
            last_conflict_report = "AI响应格式错误，无法解析JSON。"
            continue # 继续下一次重试

        last_courses_response = courses

        # 3. 冲突检测
        has_conflict, conflict_report = detect_backend_conflicts(courses)
        last_conflict_report = conflict_report

        # 4. 判断结果
        if not has_conflict:
            print("修正成功，无冲突。")
            return {"success": True, "courses": courses}
        
        print(f"第 {i+1} 次尝试后发现冲突: {conflict_report}")

    # 如果循环结束仍有冲突
    print("达到最大重试次数，修正失败。")
    final_message = f"AI自动修正失败，请根据以下报告手动检查：\n\n{last_conflict_report}"
    return {"success": False, "courses": last_courses_response, "message": final_message}

@app.route('/api/process-image', methods=['POST'])
async def process_image():
    """
    处理来自前端的图片数据请求，并启动AI自我修正流程。
    """
    if not ENABLE_IMAGE_PROCESSING:
        return jsonify({"success": False, "message": "当前图片处理功能已经禁用，请前往env修改配置"}), 403

    req_data = request.get_json()
    base64_images = req_data.get('images')
    
    if not base64_images or not isinstance(base64_images, list) or len(base64_images) == 0:
        return jsonify({"success": False, "message": "没有提供图片数据"}), 400

    try:
        result = await call_vision_model_with_correction(base64_images)
        return jsonify(result)
    except Exception as e:
        print(f"处理图片时发生严重错误：{e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/feature-flags', methods=['GET'])
def feature_flags():
    """返回后端功能开关的状态。"""
    return jsonify({
         "success": True,
        "features": {
            "image_processing": ENABLE_IMAGE_PROCESSING
        }
    })

@app.route('/api/etag', methods=['GET'])
def get_etag():
    """返回当前应用会话的ETag、开发者模式状态和应用版本号。"""
    dev_mode = os.getenv('DEV_MODE', 'false').lower() == 'true'
    app_version = os.getenv('APP_VERSION', '0.0.0')
    return jsonify({
        "success": True, 
        "etag": APP_ETAG,
        "dev_mode": dev_mode,
        "app_version": app_version
    })

@app.route('/api/site-info', methods=['GET'])
def get_site_info():
    """返回站点的额外信息，如ICP备案号。"""
    icp_license = os.getenv('ICP_LICENSE', '')
    return jsonify({
        "success": True,
        "icp_license": icp_license
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    """A lightweight endpoint to confirm the service is responsive."""
    return jsonify({"status": "ok"}), 200


@app.route('/api/process-data', methods=['POST'])
async def process_data():
    """
    处理来自前端的数据请求。
    """
    req_data = request.get_json()
    user_input = req_data.get('userInput')
    start_date = req_data.get('startDate')

    print("收到 POST 请求，详细信息：")
    print(f"  用户输入数据：{user_input[:100]}...")  # 只打印前100个字符，避免日志过长
    print(f"  开学日期：{start_date}")

    if not user_input:
        print("用户输入为空")
        return jsonify({"success": False, "message": "用户输入为空"}), 400

    try:
        # 覆盖模式
        print("覆盖模式：忽略现有课程数据，准备解析新数据...")
        print("开始 AI 解析课程表...")
        courses = await call_ai_model(user_input)
        print("AI 解析课程表完成，返回课程数据：", courses)
        return jsonify({"success": True, "courses": courses})
    except (ValueError, ConnectionError) as e:
        print(f"处理用户输入时发生错误：{e}")
        return jsonify({"success": False, "message": str(e)}), 500

# --- AI Assistant (per-course operations, with optional timeConfig change) ---

def _coerce_int(value):
    try:
        return int(value)
    except Exception:
        return None

_DAY_CHAR_TO_NUM = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "日": 7,
    "天": 7,
    "七": 7,
}

_DAY_ENGLISH_TO_NUM = {
    "mon": 1,
    "monday": 1,
    "tue": 2,
    "tues": 2,
    "tuesday": 2,
    "wed": 3,
    "weds": 3,
    "wednesday": 3,
    "thu": 4,
    "thur": 4,
    "thurs": 4,
    "thursday": 4,
    "fri": 5,
    "friday": 5,
    "sat": 6,
    "saturday": 6,
    "sun": 7,
    "sunday": 7,
}

def _dedupe_ints_keep_order(values):
    seen = set()
    out = []
    for v in values:
        if v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out

def _parse_day_token(token):
    if token is None:
        return None
    s = str(token).strip()
    if not s:
        return None

    lower = s.lower()
    if lower in _DAY_ENGLISH_TO_NUM:
        return _DAY_ENGLISH_TO_NUM[lower]

    n = _coerce_int(s)
    if n is not None and 1 <= n <= 7:
        return n

    normalized = s
    normalized = normalized.replace("星期", "").replace("周", "").replace("礼拜", "").replace("週", "")
    normalized = normalized.strip()
    n2 = _coerce_int(normalized)
    if n2 is not None and 1 <= n2 <= 7:
        return n2
    if normalized in _DAY_CHAR_TO_NUM:
        return _DAY_CHAR_TO_NUM[normalized]

    return None

def _expand_days(day_value):
    """
    Returns a list of weekday numbers [1..7] (Mon..Sun).
    Accepts: int/str, list, ranges (1-5), comma lists (1,3,5),
    and common Chinese phrases (每天/工作日/周一到周五/周末).
    """
    if day_value is None:
        return []

    if isinstance(day_value, list):
        expanded = []
        for item in day_value:
            expanded.extend(_expand_days(item))
        return _dedupe_ints_keep_order([d for d in expanded if isinstance(d, int) and 1 <= d <= 7])

    s = str(day_value).strip()
    if not s:
        return []

    compact = s.replace(" ", "").replace("，", ",").replace("、", ",")

    # Special phrases
    if any(k in compact for k in ("每天", "每日", "天天", "全周", "周一到周日", "周一至周日", "周一-周日", "周一~周日")):
        return [1, 2, 3, 4, 5, 6, 7]
    if any(k in compact for k in ("工作日", "周一到周五", "周一至周五", "周一-周五", "周一~周五")):
        return [1, 2, 3, 4, 5]
    if "周末" in compact:
        return [6, 7]

    # Numeric ranges: 1-5 / 1~5 / 1到5 / 1至5
    m = re.fullmatch(r"([1-7])(?:-|~|到|至)([1-7])", compact)
    if m:
        start = int(m.group(1))
        end = int(m.group(2))
        if start <= end:
            return list(range(start, end + 1))
        return list(range(start, 8)) + list(range(1, end + 1))

    # Chinese ranges: 周一-周五 / 周一到周日
    if any(d in compact for d in ("-", "~", "到", "至")):
        chars = re.findall(r"[一二三四五六日天七]", compact)
        if len(chars) == 2:
            start = _DAY_CHAR_TO_NUM.get(chars[0])
            end = _DAY_CHAR_TO_NUM.get(chars[1])
            if start is not None and end is not None:
                if start <= end:
                    return list(range(start, end + 1))
                return list(range(start, 8)) + list(range(1, end + 1))

    # Comma separated: 1,3,5 or 周一,周三,周五
    if "," in compact:
        parts = [p for p in compact.split(",") if p]
        expanded = []
        for p in parts:
            n = _parse_day_token(p)
            if n is not None:
                expanded.append(n)
                continue
            chars = re.findall(r"[一二三四五六日天七]", p)
            expanded.extend([_DAY_CHAR_TO_NUM.get(ch) for ch in chars if _DAY_CHAR_TO_NUM.get(ch) is not None])
        return _dedupe_ints_keep_order([d for d in expanded if isinstance(d, int) and 1 <= d <= 7])

    # Compact forms: 周一三五 / 一三五 / TueThu (rare)
    chars = re.findall(r"[一二三四五六日天七]", compact)
    if chars:
        expanded = [_DAY_CHAR_TO_NUM.get(ch) for ch in chars if _DAY_CHAR_TO_NUM.get(ch) is not None]
        return _dedupe_ints_keep_order([d for d in expanded if isinstance(d, int) and 1 <= d <= 7])

    n = _parse_day_token(compact)
    return [n] if (n is not None and 1 <= n <= 7) else []

def _normalize_schedule(schedule):
    if not isinstance(schedule, dict):
        return None
    return {
        "weeks": str(schedule.get("weeks", "")).strip(),
        "day": str(schedule.get("day", "")).strip(),
        "time_slot": str(schedule.get("time_slot", "")).strip(),
        "campus": str(schedule.get("campus", "")).strip(),
        "building": str(schedule.get("building", "")).strip(),
        "classroom": str(schedule.get("classroom", "")).strip(),
    }

def _normalize_schedule_entries(schedule):
    """
    Normalize a schedule into one or more schedule entries.
    Supports multi-day input like:
    - day: "每天" / "工作日" / "周一到周五"
    - day: "1-5" / "1,3,5"
    - day: [1,2,3] / ["周一","周二"]
    - days: [...] (alias)
    """
    if not isinstance(schedule, dict):
        return []

    base = {
        "weeks": str(schedule.get("weeks", "")).strip(),
        "time_slot": str(schedule.get("time_slot", "")).strip(),
        "campus": str(schedule.get("campus", "")).strip(),
        "building": str(schedule.get("building", "")).strip(),
        "classroom": str(schedule.get("classroom", "")).strip(),
    }

    day_value = schedule.get("day")
    if day_value is None and "days" in schedule:
        day_value = schedule.get("days")

    days = _expand_days(day_value)
    if not days:
        return []

    items = []
    for day in days:
        item = dict(base)
        item["day"] = str(day)
        items.append(item)

    # Deduplicate (keep order)
    seen = set()
    unique = []
    for it in items:
        key = (it.get("weeks"), it.get("day"), it.get("time_slot"), it.get("campus"), it.get("building"), it.get("classroom"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)
    return unique

def _normalize_course(course):
    if not isinstance(course, dict):
        return None
    teachers = course.get("teachers", [])
    if not isinstance(teachers, list):
        teachers = []
    schedules = course.get("schedules", [])
    if isinstance(schedules, dict):
        schedules = [schedules]
    elif not isinstance(schedules, list):
        schedules = []
    normalized_schedules = []
    for s in schedules:
        normalized_schedules.extend(_normalize_schedule_entries(s))

    return {
        "code": str(course.get("code", "")).strip(),
        "name": str(course.get("name", "")).strip(),
        "teachers": [str(t).strip() for t in teachers if str(t).strip()],
        "schedules": normalized_schedules,
    }

def _time_to_minutes(time_str):
    if not isinstance(time_str, str):
        return None
    m = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", time_str.strip())
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))

def _normalize_exam(exam):
    if not isinstance(exam, dict):
        return None
    title = str(exam.get("title", "")).strip()
    date = str(exam.get("date", "")).strip()
    start_time = str(exam.get("startTime", "")).strip()
    end_time = str(exam.get("endTime", "")).strip()
    location = str(exam.get("location", "")).strip()
    notes = str(exam.get("notes", "")).strip()

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        return None

    start_minutes = _time_to_minutes(start_time)
    end_minutes = _time_to_minutes(end_time)
    if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
        return None

    course_id = exam.get("courseId", None)
    course_id = _coerce_int(course_id) if course_id not in (None, "") else None

    return {
        "title": title,
        "date": date,
        "startTime": start_time,
        "endTime": end_time,
        "location": location,
        "courseId": course_id,
        "notes": notes,
    }

def _normalize_time_config(time_config):
    if not isinstance(time_config, dict):
        return None
    slots = time_config.get("time_slots")
    if not isinstance(slots, list):
        return None

    normalized_slots = []
    for slot in slots:
        if not isinstance(slot, dict):
            continue
        section = _coerce_int(slot.get("section"))
        if section is None:
            continue
        normalized_slots.append({
            "section": section,
            "start": str(slot.get("start", "")).strip(),
            "end": str(slot.get("end", "")).strip(),
        })

    if not normalized_slots:
        return None

    return {
        "config_id": str(time_config.get("config_id", "assistant")).strip() or "assistant",
        "time_slots": normalized_slots,
    }

def _build_ai_assistant_system_prompt():
    return """
你是一个“课程表 AI 助手”，专门在现有课程表基础上，生成“逐课程”的修改建议。

你必须只输出一个 JSON 对象，不要输出任何额外文字、Markdown、代码块。

输出 JSON Schema:
{
  "operations": [
    {
      "operation": "add" | "remove" | "alter",
      "id": number,              // remove/alter 必填
      "course": { ... },         // add 必填（完整课程对象）
      "changes": { ... },        // alter 必填（仅包含需要修改的字段）
      "reason": string           // 可选（建议写上原因/依据）
    }
  ],
  "examOperations": [
    {
      "operation": "add" | "remove" | "alter",
      "id": number,              // remove/alter 必填
      "exam": { ... },           // add 必填（完整考试对象）
      "changes": { ... },        // alter 必填（仅包含需要修改的字段）
      "reason": string           // 可选（建议写上原因/依据）
    }
  ],
  "timeConfigChange": {
    "timeConfig": { "config_id": string, "time_slots": [ { "section": number, "start": string, "end": string } ] },
    "reason": string
  } | null
}

课程对象 schema:
{
  "code": string,
  "name": string,
  "teachers": string[],
  "schedules": [
    { "weeks": string, "day": string, "time_slot": string, "campus": string, "building": string, "classroom": string }
  ]
}

考试对象 schema（真实时间，不受 timeConfig 限制）:
{
  "title": string,
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "location": string,
  "courseId": number | null,
  "notes": string
}

startDate (from user context):
- startDate is the week-1 Monday date string (usually ISO like "2025-02-24T00:00:00.000Z" or "2025-02-24").
- When computing dates, use only the date part as local date; do not shift by timezone.
- 如用户用“第N周 周X/星期X”描述考试日期，基于 startDate 计算：date = week1Monday + (N-1)*7 + (day-1) 天。例：第18周 周三 => startDate + 17*7 + 2 天。
- 如 startDate 缺失或用户未提供具体星期/日期，请返回空的 examOperations 并在 reason 里说明需要更多信息。
- 如用户给出明确日期，优先使用该日期。

硬性规则:
- 你必须根据用户意图自行选择 add / remove / alter，可在一次返回中混合多种 operation。
- 每条 operation 只允许操作一门课（逐课程），不要一次改整个课程表。
- remove/alter 必须通过课程 id 指定目标。
- 如果提供了 targetCourseId：只允许对该 id 生成 remove/alter（不要对其他 id 进行删除/修改）。
- 如果 allowTimeConfig=false：timeConfigChange 必须为 null。
- 任何情况下都不允许修改开学日期（startDate 不允许修改）。
- 如信息不够确定，宁可返回空 operations（[]），并把 reason 写清楚
- 课程id如果未指定，请输出一个8位的，不重复的，从00000001开始的课程id作为课程的唯一标识符
- 'weeks': 周数信息。对于连续周（如1-16周），格式为 "1-16"；对于单周（如1,3,5...周），格式为 "1,3,5,7,9,11,13,15"；对于双周（如2,4,6...周），格式为 "2,4,6,8,10,12,14,16"。请务必将单双周展开为逗号分隔的数字列表。对于不连续的周（如1-6周和8-17周），格式为 "1,2,3,4,5,6,8,9,10,11,12,13,14,15,16,17"。注意，如果用户未明确指定第几周开始或结束课程课程，请设置为第一周开始到第30周结束
- 'day': 星期几，取值为 1-7（周一=1，周日=7），必须可被解析为数字。
- 一个课程可以有多个 schedules；当用户表达多个上课日（如“每天/工作日/周一三五/1-5”），请生成多条 schedule（或把 day 写成 [1,2,3] / "1-5"，系统会自动展开为多条 schedule）。
- 如果 alter 修改了 schedules：请输出“修改后的完整 schedules 列表”（包含未改动的项），避免把原有安排覆盖丢失。
- 考试日程使用真实日期与 24 小时制时间，必须输出合法的 date/startTime/endTime。
- 考试日程既可以独立（courseId=null），也可以关联课程（courseId=课程id）。
"""

async def _call_ai_assistant(existing_courses, existing_exams, user_input, target_course_id, allow_time_config, time_config, start_date, images):
    system_prompt = _build_ai_assistant_system_prompt()

    context_courses = existing_courses
    if target_course_id is not None:
        context_courses = [c for c in existing_courses if _coerce_int(c.get("id")) == target_course_id]

    user_context = {
        "targetCourseId": target_course_id,
        "allowTimeConfig": bool(allow_time_config),
        "existingCourses": context_courses,
        "existingExams": existing_exams,
        "timeConfig": time_config if allow_time_config else None,
        "startDate": start_date,
        "userInput": user_input,
    }
    user_text = json.dumps(user_context, ensure_ascii=False)
    if len(user_text) > AI_ASSISTANT_MAX_CONTEXT_CHARS:
        raise ValueError("AI assistant context too large")

    use_images = isinstance(images, list) and len(images) > 0
    model = AI_MODEL

    if use_images:
        content = []
        for base64_image in images[:3]:
            if not base64_image:
                continue
            if ',' in base64_image:
                img_data = base64_image.split(',', 1)[1]
            else:
                img_data = base64_image
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_data}"}})
        content.append({"type": "text", "text": user_text})

        completion = _safe_chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content},
            ],
            response_format={"type": "json_object"},
        )
    else:
        completion = _safe_chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text},
            ],
            response_format={"type": "json_object"},
        )

    response_content = completion.choices[0].message.content
    try:
        return json.loads(response_content)
    except Exception:
        cleaned = str(response_content).strip()
        cleaned = re.sub(r"^```json", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"^```", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned, flags=re.IGNORECASE).strip()
        return json.loads(cleaned)

def _normalize_assistant_result(raw, target_course_id, allow_time_config):
    if not isinstance(raw, dict):
        return {"operations": [], "examOperations": [], "timeConfigChange": None}

    operations = raw.get("operations", [])
    if not isinstance(operations, list):
        operations = []

    normalized_ops = []
    for op in operations:
        if not isinstance(op, dict):
            continue
        operation = op.get("operation")
        if operation not in ("add", "remove", "alter"):
            continue

        reason = str(op.get("reason", "")).strip()

        if operation == "add":
            course = _normalize_course(op.get("course"))
            if course is None:
                continue
            normalized_ops.append({"operation": "add", "course": course, "reason": reason})
            continue

        op_id = _coerce_int(op.get("id"))
        if op_id is None:
            continue
        if target_course_id is not None and op_id != target_course_id:
            continue

        if operation == "remove":
            normalized_ops.append({"operation": "remove", "id": op_id, "reason": reason})
            continue

        # alter
        changes = op.get("changes")
        if not isinstance(changes, dict):
            continue

        allowed_keys = {"code", "name", "teachers", "schedules"}
        filtered = {}
        for k, v in changes.items():
            if k not in allowed_keys:
                continue
            if k in ("code", "name"):
                filtered[k] = str(v).strip()
            elif k == "teachers":
                if isinstance(v, list):
                    filtered[k] = [str(t).strip() for t in v if str(t).strip()]
            elif k == "schedules":
                if isinstance(v, dict):
                    v = [v]
                if isinstance(v, list):
                    schedules = []
                    for s in v:
                        schedules.extend(_normalize_schedule_entries(s))
                    if schedules:
                        filtered[k] = schedules

        if not filtered:
            continue

        normalized_ops.append({"operation": "alter", "id": op_id, "changes": filtered, "reason": reason})

    exam_operations = raw.get("examOperations", [])
    if not isinstance(exam_operations, list):
        exam_operations = []

    normalized_exam_ops = []
    for op in exam_operations:
        if not isinstance(op, dict):
            continue
        operation = op.get("operation")
        if operation not in ("add", "remove", "alter"):
            continue

        reason = str(op.get("reason", "")).strip()

        if operation == "add":
            exam = _normalize_exam(op.get("exam"))
            if exam is None:
                continue
            normalized_exam_ops.append({"operation": "add", "exam": exam, "reason": reason})
            continue

        op_id = _coerce_int(op.get("id"))
        if op_id is None:
            continue

        if operation == "remove":
            normalized_exam_ops.append({"operation": "remove", "id": op_id, "reason": reason})
            continue

        changes = op.get("changes")
        if not isinstance(changes, dict):
            continue

        allowed_keys = {"title", "date", "startTime", "endTime", "location", "courseId", "notes"}
        filtered = {}
        for k, v in changes.items():
            if k not in allowed_keys:
                continue
            if k == "title" or k == "location" or k == "notes":
                filtered[k] = str(v).strip()
            elif k == "date":
                date_val = str(v).strip()
                if re.match(r"^\d{4}-\d{2}-\d{2}$", date_val):
                    filtered[k] = date_val
            elif k in ("startTime", "endTime"):
                time_val = str(v).strip()
                if _time_to_minutes(time_val) is not None:
                    filtered[k] = time_val
            elif k == "courseId":
                filtered[k] = _coerce_int(v) if v not in (None, "") else None

        if not filtered:
            continue

        normalized_exam_ops.append({"operation": "alter", "id": op_id, "changes": filtered, "reason": reason})

    # timeConfigChange
    time_config_change = None
    if allow_time_config:
        raw_tc = raw.get("timeConfigChange")
        if isinstance(raw_tc, dict):
            tc = _normalize_time_config(raw_tc.get("timeConfig"))
            if tc is not None:
                time_config_change = {
                    "timeConfig": tc,
                    "reason": str(raw_tc.get("reason", "")).strip(),
                }

    return {"operations": normalized_ops, "examOperations": normalized_exam_ops, "timeConfigChange": time_config_change}

@app.route('/api/ai-assistant', methods=['POST'])
async def ai_assistant():
    req_data = request.get_json() or {}

    user_input = str(req_data.get("userInput", "") or "").strip()
    images = req_data.get("images", []) or []

    if (not user_input) and (not images):
        return jsonify({"success": False, "message": "Empty user input"}), 400

    if images:
        if not ENABLE_IMAGE_PROCESSING:
            return jsonify({"success": False, "message": "Image processing is disabled"}), 403
        if not isinstance(images, list) or len(images) > 3:
            return jsonify({"success": False, "message": "Too many images (max 3)"}), 400
        total_image_chars = sum(len(str(img or "")) for img in images)
        if total_image_chars > AI_ASSISTANT_MAX_IMAGE_CHARS:
            return jsonify({"success": False, "message": "Images are too large"}), 413

    existing_courses = req_data.get("existingCourses", [])
    if not isinstance(existing_courses, list):
        existing_courses = []

    existing_exams = req_data.get("existingExams", [])
    if not isinstance(existing_exams, list):
        existing_exams = []

    target_course_id = req_data.get("targetCourseId")
    target_course_id = _coerce_int(target_course_id) if target_course_id is not None else None

    allow_time_config = bool(req_data.get("allowTimeConfig", False))
    time_config = req_data.get("timeConfig") if allow_time_config else None
    start_date = req_data.get("startDate")
    if start_date is not None:
        start_date = str(start_date).strip() or None

    try:
        raw_result = await _call_ai_assistant(
            existing_courses=existing_courses,
            existing_exams=existing_exams,
            user_input=user_input,
            target_course_id=target_course_id,
            allow_time_config=allow_time_config,
            time_config=time_config,
            start_date=start_date,
            images=images,
        )
        normalized = _normalize_assistant_result(
            raw=raw_result,
            target_course_id=target_course_id,
            allow_time_config=allow_time_config,
        )
        return jsonify({"success": True, **normalized})

    except ValueError as e:
        logging.warning(f"AI assistant rejected input: {e}")
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        logging.exception("AI assistant failed")
        return jsonify({"success": False, "message": f"AI assistant failed: {str(e)}"}), 500

@app.route('/sw.js')
def service_worker():
    """
    动态生成 service-worker.js 文件，将 ETag 作为缓存名称。
    """
    try:
        with open(os.path.join(app.static_folder, 'service-worker.js'), 'r', encoding='utf-8') as f:
            sw_content = f.read()
        
        # 将占位符替换为真实的 ETag
        sw_content = sw_content.replace('%%CACHE_NAME%%', f'next-class-cache-{APP_ETAG}')
        
        return Response(sw_content, mimetype='application/javascript')
    except FileNotFoundError:
        return "Service worker template not found.", 404

# 用于SSL证书HTTP验证的路由
@app.route('/.well-known/pki-validation/<path:filename>')
def serve_pki_validation(filename):
    """
    提供 /.well-known/pki-validation/ 目录下的文件，用于SSL证书验证。    """
    validation_dir = os.path.join(app.static_folder, '.well-known', 'pki-validation')
    return send_from_directory(validation_dir, filename)

# 根路由，用于智能调度
@app.route('/')
def index():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Loading...</title>
        <script>
            try {
                const storedCourses = localStorage.getItem('courses');
                if (storedCourses && JSON.parse(storedCourses).length > 0) {
                    window.location.replace('/next_class.html');
                } else {
                    window.location.replace('/index.html');
                }
            } catch (e) {
                // 如果数据损坏，也跳转到 index.html
                window.location.replace('/index.html');
            }
        </script>
    </head>
    <body>
        <p>Loading...</p>
    </body>
    </html>
    """

# 提供其他静态文件的路由，并为核心HTML注入版本号
@app.route('/<path:path>')
def serve_static(path):
    # 核心HTML文件列表，需要注入版本号
    core_html_files = ['index.html', 'next_class.html', 'edit.html', 'edit_time.html', 'push_admin.html']
    
    if path in core_html_files:
        try:
            # 读取HTML文件内容
            with open(os.path.join(app.static_folder, path), 'r', encoding='utf-8') as f:
                html_content = f.read()

            # 获取版本号
            app_version = os.getenv('APP_VERSION', '0.0.0')
            
            # 注入版本号到 <head> 标签中
            # 我们使用一个简单的字符串替换。在HTML的</head>之前插入meta标签。
            meta_tag = f'<meta name="app-version" content="{app_version}">'
            html_content = html_content.replace('</head>', f'    {meta_tag}\n</head>')
            
            return Response(html_content, mimetype='text/html')
        except FileNotFoundError:
            return "File not found", 404
    
    # 对于非核心文件，正常提供
    return send_from_directory(app.static_folder, path)

# --- 分享功能 ---

def generate_share_code():
    """生成一个唯一的6位数字分享码。"""
    while True:
        code = ''.join(random.choices(string.digits, k=6))
        # 检查是否有同名文件（忽略时间戳）
        if not glob.glob(os.path.join(SHARE_CONFIG_DIR, f"{code}_*.json")):
            return code

@share_bp.route('/generate-code', methods=['POST'])
def get_share_code():
    """生成并返回一个新的分享码。"""
    share_code = generate_share_code()
    return jsonify({"success": True, "share_code": share_code})

@share_bp.route('/upload', methods=['POST'])
def upload_share_file():
    """
    上传分享文件，并在文件中嵌入过期时间元数据。
    """
    # 速率限制
    ip_address = request.remote_addr
    last_share_time = share_timestamps.get(ip_address, 0)
    current_time = time.time()

    if current_time - last_share_time < SHARE_RATE_LIMIT_SECONDS:
        remaining_time = int(SHARE_RATE_LIMIT_SECONDS - (current_time - last_share_time))
        return jsonify({"success": False, "message": f"操作过于频繁，请在 {remaining_time} 秒后重试。"}), 429

    if 'file' not in request.files:
        return jsonify({"success": False, "message": "没有文件部分"}), 400
    file = request.files['file']
    share_code = request.form.get('share_code')

    if file.filename == '' or not share_code:
        return jsonify({"success": False, "message": "没有选择文件或缺少分享码"}), 400

    try:
        # 读取上传的课程数据
        courses_data = json.load(file)

        # 检查并修复可能由Admin端编辑导致的数据嵌套问题
        if isinstance(courses_data, dict) and '_metadata' in courses_data and 'courses' in courses_data:
            logging.warning("Detected nested data structure in share upload. Extracting inner 'courses' data.")
            courses_data = courses_data['courses']
        
        # 计算过期时间戳
        if SHARE_CONFIG_EXPIRATION_HOURS > 0:
            expires_at = int(current_time + SHARE_CONFIG_EXPIRATION_HOURS * 3600)
        else:
            expires_at = -1 # -1 表示永不过期
        
        # 构建新的文件内容，包含元数据
        new_content = {
            "_metadata": {
                "created_at": int(current_time),
                "expires_at": expires_at
            },
            "courses": courses_data
        }
        
        # 使用时间戳命名文件以避免冲突
        timestamp = int(current_time)
        filename = f"{share_code}_{timestamp}.json"
        file_path = os.path.join(SHARE_CONFIG_DIR, filename)

        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(new_content, f, indent=4, ensure_ascii=False)

        # 更新分享时间戳
        share_timestamps[ip_address] = current_time
        return jsonify({"success": True, "message": "文件上传成功"})

    except json.JSONDecodeError:
        return jsonify({"success": False, "message": "上传的文件不是有效的JSON格式。"}), 400
    except Exception as e:
        logging.error(f"Error during file upload: {e}")
        return jsonify({"success": False, "message": "服务器内部错误。"}), 500

@share_bp.route('/get/<code>', methods=['GET'])
def get_share_file(code):
    """
    根据分享码下载文件，并先检查其内部的过期时间。
    """
    files = glob.glob(os.path.join(SHARE_CONFIG_DIR, f"{code}_*.json"))
    if not files:
        return jsonify({"success": False, "message": "分享码不存在或已过期"}), 404

    # 返回最新的文件
    latest_file_path = max(files, key=os.path.getctime)
    
    try:
        with open(latest_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        expires_at = data.get("_metadata", {}).get("expires_at")
        
        # 检查是否过期 (-1代表永不过期)
        if expires_at != -1 and expires_at is not None and time.time() > expires_at:
            # 文件已过期，但可能清理任务还没来得及删除
            return jsonify({"success": False, "message": "分享码已过期。"}), 404
            
        # 返回课程数据，对前端隐藏元数据
        # 直接返回课程数组的JSON，而不是一个包含它的对象
        return jsonify(data.get("courses", []))

    except (json.JSONDecodeError, FileNotFoundError):
        return jsonify({"success": False, "message": "分享数据损坏或丢失。"}), 500

# --- 文件清理任务 ---

def cleanup_expired_files():
    """
    清理过期的分享文件。
    该逻辑现在基于每个文件内部的 _metadata.expires_at 时间戳。
    """
    try:
        now = time.time()
        for file_path in glob.glob(os.path.join(SHARE_CONFIG_DIR, "*.json")):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                expires_at = data.get("_metadata", {}).get("expires_at")
                
                # 如果 expires_at 存在, 不等于-1, 且小于当前时间，则删除文件
                if expires_at is not None and expires_at != -1 and now > expires_at:
                    os.remove(file_path)
                    # No logging info for successful cleanup to reduce noise
            except (json.JSONDecodeError, FileNotFoundError, KeyError):
                # 如果文件损坏或格式不符，也考虑删除，避免累积垃圾文件
                logging.warning(f"Share file {os.path.basename(file_path)} is corrupted or malformed. Deleting it.")
                try:
                    os.remove(file_path)
                except OSError as e:
                    logging.error(f"Could not delete corrupted file {os.path.basename(file_path)}: {e}")
                continue
            except OSError as e:
                logging.error(f"Error accessing or removing file {os.path.basename(file_path)}: {e}")
                continue
    except Exception as e:
        logging.error(f"An unexpected error occurred during file cleanup: {e}")

app.register_blueprint(share_bp)


if __name__ == '__main__':
    # 1. Setup Logging
    log_file_path = setup_logging()
    crash_log_path, crash_log_file = setup_crash_logging()
    logging.info(f"Crash log file initialized at: {crash_log_path}")

    # Add the custom filter to Flask's default logger to suppress health check logs
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.addFilter(HealthCheckFilter())

    # 2. Write PID file
    # In debug mode with reloader, this ensures it runs only in the child process.
    # In production (or without reloader), it runs directly.
    if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        write_pid_file(log_file_path)
        check_previous_heartbeat()
        write_heartbeat()

        # 3. Start background cleanup task only in the correct process
        scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
        # For testing purposes, let's run it more frequently. In production, this can be hours=1.
        scheduler.add_job(func=cleanup_expired_files, trigger="interval", minutes=1)
        scheduler.add_job(
            func=write_heartbeat,
            trigger="interval",
            seconds=max(10, HEARTBEAT_INTERVAL_SECONDS),
            id="heartbeat",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=30
        )
        scheduler.start()
        logging.info("Started background task for cleaning up expired share files (runs every 1 minute).")
        # It's good practice to shut down the scheduler cleanly on exit
        atexit.register(lambda: scheduler.shutdown())

    # 4. Server run mode configuration
    ENABLE_HTTPS_FLAG = os.getenv('ENABLE_HTTPS', 'false').lower() == 'true'
    HTTP_PORT_CONFIG = int(os.getenv('HTTP_PORT', 2000))
    HTTPS_PORT_CONFIG = int(os.getenv('HTTPS_PORT', 443))

    ssl_context = None
    port = HTTP_PORT_CONFIG

    if ENABLE_HTTPS_FLAG:
        logging.info("HTTPS mode is enabled in .env file.")
        ssl_cert_path = 'certificate.crt'
        ssl_key_path = 'private.key'
        
        if not os.path.exists(ssl_cert_path) or not os.path.exists(ssl_key_path):
            logging.critical("CRITICAL ERROR: SSL certificate or key not found for HTTPS mode.")
            logging.critical(f"Please ensure '{ssl_cert_path}' and '{ssl_key_path}' exist, or set ENABLE_HTTPS=false in .env.")
            exit(1)

        logging.info("Loading SSL context from files.")
        ssl_context = (ssl_cert_path, ssl_key_path)
        port = HTTPS_PORT_CONFIG
    else:
        logging.info("HTTPS mode is disabled in .env file.")

    logging.info(f"Starting server on port {port}. ETag for this session: {APP_ETAG}")
    
    # 5. Run Flask App
    # use_reloader=True is not recommended for long-running stability.
    app.run(
        debug=True,
        host='0.0.0.0',
        port=port,
        use_reloader=False, # Disabled for stability in long-running scenarios
        ssl_context=ssl_context
    )
