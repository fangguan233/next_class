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

# 加载 .env 文件中的环境变量
load_dotenv()

# 配置
app = Flask(__name__, static_folder='static')
ENABLE_IMAGE_PROCESSING = os.getenv('ENABLE_IMAGE_PROCESSING', 'false').lower() == 'true'

# 全局 ETag，在应用启动时生成
APP_ETAG = str(uuid.uuid4())
print(f" * ETag for this session: {APP_ETAG}")

share_bp = Blueprint('share', __name__, url_prefix='/api/share')
SHARE_CONFIG_DIR = os.path.join(os.path.dirname(__file__), 'shared_configs')
SHARE_CONFIG_EXPIRATION_HOURS = int(os.getenv('SHARE_CONFIG_EXPIRATION_HOURS', 24))
SHARE_RATE_LIMIT_SECONDS = int(os.getenv('SHARE_RATE_LIMIT_SECONDS', 60))

os.makedirs(SHARE_CONFIG_DIR, exist_ok=True)

# 用于存储每个IP的最后分享时间
share_timestamps = {}

# 初始化 OpenAI 客户端
client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY", "sk-e83a06366967454fb25e705edbb77df5"), # 优先使用环境变量，否则使用提供的key
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

async def call_ai_model(user_input):
    """
    调用通义千问Qwen-Coder模型来解析课程数据。
    """
    print("调用 Qwen-Coder AI 接口，处理用户输入...")

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
        completion = client.chat.completions.create(
            model="qwen3-coder-plus",
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
        - 'day': 星期几，必须是 "1" 到 "7" 的数字字符串。
        - 'time_slot': 节次，格式为 "开始节-结束节"，例如 "1-2"。- 'campus': 校区，如果图片中有。
        - 'building': 教学楼，如果图片中有。
        - 'classroom': 教室，如果图片中有。

    - 如果图片中的一门课程在多个时间段上课，请为每个时间段在 'schedules' 数组中创建一个独立的对象。
    - 如果图片中某项信息不清晰或缺失，请尽力推断或留空，但不要编造。
    - 最终的输出必须是纯粹的、格式正确的JSON字符串，不包含任何额外的解释、注释或 markdown 的 ```json 标记。
    - 如果缺少任何关键信息之一或更多（周数、星期、节次），请直接忽略该门课程，不要包含在结果中!!!
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
            completion = client.chat.completions.create(
                model="qvq-max-latest",
                messages=[{"role": "user", "content": content}],
                stream=True
            )
            full_response = "".join(
                chunk.choices[0].delta.content
                for chunk in completion
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content
            )
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
    """返回当前应用会话的ETag。"""
    return jsonify({"success": True, "etag": APP_ETAG})

@app.route('/api/site-info', methods=['GET'])
def get_site_info():
    """返回站点的额外信息，如ICP备案号。"""
    icp_license = os.getenv('ICP_LICENSE', '')
    return jsonify({
        "success": True,
        "icp_license": icp_license
    })


@app.route('/api/process-data', methods=['POST'])
async def process_data():
    """
    处理来自前端的数据请求。
    """
    req_data = request.get_json()
    user_input = req_data.get('userInput')
    print("收到 POST 请求，用户输入数据：", user_input)

    if not user_input:
        print("用户输入为空")
        return jsonify({"success": False, "message": "用户输入为空"}), 400

    try:
        # 调用AI模型处理用户输入
        courses = await call_ai_model(user_input)
        print("成功处理用户输入，返回课程数据：", courses)
        return jsonify({"success": True, "courses": courses})
    except (ValueError, ConnectionError) as e:
        print(f"处理用户输入时发生错误：{e}")
        return jsonify({"success": False, "message": str(e)}), 500

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

# 提供其他静态文件的路由
@app.route('/<path:path>')
def serve_static(path):
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
    """上传分享文件。"""
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

    if file and share_code:
        # 更新分享时间戳
        share_timestamps[ip_address] = current_time
        
        # 使用时间戳命名文件
        timestamp = int(time.time())
        filename = f"{share_code}_{timestamp}.json"
        file.save(os.path.join(SHARE_CONFIG_DIR, filename))
        return jsonify({"success": True, "message": "文件上传成功"})

@share_bp.route('/get/<code>', methods=['GET'])
def get_share_file(code):
    """根据分享码下载文件。"""
    files = glob.glob(os.path.join(SHARE_CONFIG_DIR, f"{code}_*.json"))
    if not files:
        return jsonify({"success": False, "message": "分享码不存在或已过期"}), 404
    
    # 返回最新的文件
    latest_file = max(files, key=os.path.getctime)
    return send_from_directory(SHARE_CONFIG_DIR, os.path.basename(latest_file))

# --- 文件清理任务 ---

def cleanup_expired_files():
    """清理过期的分享文件。"""
    if SHARE_CONFIG_EXPIRATION_HOURS == 0:
        return # 0表示永不过期

    now = time.time()
    expiration_seconds = SHARE_CONFIG_EXPIRATION_HOURS * 3600
    
    for filename in os.listdir(SHARE_CONFIG_DIR):
        if '_' in filename and filename.endswith('.json'):
            try:
                timestamp = int(filename.split('_')[1].split('.')[0])
                if (now - timestamp) > expiration_seconds:
                    os.remove(os.path.join(SHARE_CONFIG_DIR, filename))
                    print(f"删除了过期的分享文件: {filename}")
            except (ValueError, IndexError):
                continue # 文件名格式不正确，跳过

app.register_blueprint(share_bp)


if __name__ == '__main__':
    # 启动后台清理任务
    scheduler = BackgroundScheduler()
    scheduler.add_job(func=cleanup_expired_files, trigger="interval", hours=1)
    scheduler.start()

    # --- 服务器运行模式配置 ---
    # 从 .env 文件加载配置
    ENABLE_HTTPS_FLAG = os.getenv('ENABLE_HTTPS', 'false').lower() == 'true'
    HTTP_PORT_CONFIG = int(os.getenv('HTTP_PORT', 2000))
    HTTPS_PORT_CONFIG = int(os.getenv('HTTPS_PORT', 443))

    ssl_context = None
    port = HTTP_PORT_CONFIG

    if ENABLE_HTTPS_FLAG:
        print(" * HTTPS mode is enabled in .env file.")
        ssl_cert_path = 'certificate.crt'
        ssl_key_path = 'private.key'
        
        # 检查证书文件是否存在
        if not os.path.exists(ssl_cert_path) or not os.path.exists(ssl_key_path):
            print("!!! CRITICAL ERROR: SSL certificate or key not found for HTTPS mode. !!!")
            print(f"!!! Please ensure '{ssl_cert_path}' and '{ssl_key_path}' exist in the backend directory, or set ENABLE_HTTPS=false in .env. !!!")
            exit(1)

        print(" * Loading SSL context from files.")
        ssl_context = (ssl_cert_path, ssl_key_path)
        port = HTTPS_PORT_CONFIG
        print(f" * Starting server in HTTPS mode on port {port}.")
    else:
        print(" * HTTPS mode is disabled in .env file.")
        print(f" * Starting server in HTTP mode on port {port}.")

    # 运行 Flask 应用
    # 注意：use_reloader=False 是为了确保后台任务（如scheduler）在debug模式下不会被执行两次。
    # 如果您不需要后台任务，可以将其设置为 True 以获得更好的开发体验。
    app.run(
        debug=True, 
        host='0.0.0.0', 
        port=port, 
        use_reloader=False, 
        ssl_context=ssl_context
    )
