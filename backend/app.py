import os
import json
from flask import Flask, request, jsonify, send_from_directory, Blueprint
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

    # 从环境变量中获取端口，如果未设置则默认为 5000
    port = int(os.environ.get('FLASK_RUN_PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
