#!/bin/bash

# 检查 Node.js 是否安装
check_node() {
    if ! command -v node &> /dev/null; then
        echo "错误：Node.js 未安装，请先安装 Node.js。"
        exit 1
    fi
    echo "Node.js 已安装，版本信息如下："
    node --version
}

# 检查 npm 是否安装
check_npm() {
    if ! command -v npm &> /dev/null; then
        echo "错误：npm 未安装，请先安装 npm。"
        exit 1
    fi
    echo "npm 已安装，版本信息如下："
    npm --version
}

# 安装依赖
install_dependencies() {
    echo "正在安装项目依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "错误：依赖安装失败，请检查网络或 npm 配置。"
        exit 1
    fi
    echo "依赖安装成功。"
}

# 清理并创建静态资源目录
prepare_static_resources() {
    echo "正在清理并准备静态资源..."
    rm -rf public
    mkdir -p public
    cp index.html public/
    cp next_class.html public/
    cp app.js public/
    cp next_class.js public/ # 确保新增的 next_class.js 被复制
    cp css/style.css public/ # 复制样式文件
    cp js/edit.js public/
    cp js/edit_time.js public/
    cp edit.html public/ # 新增：复制 edit.html
    cp edit_time.html public/ # 新增：复制 edit_time.html
    echo "静态资源已复制到 public 目录。"
}

# 设置端口环境变量
set_port() {
    if [ -z "$PORT" ]; then
        echo "未设置 PORT 环境变量，将使用默认端口 3000。"
        export PORT=3000
    else
        echo "已设置 PORT 环境变量，服务将运行在端口 $PORT。"
    fi
}

# 启动服务
start_server() {
    echo "正在启动服务..."
    nohup node server.js > server.log 2>&1 &
    echo $! > server.pid
    if [ $? -ne 0 ]; then
        echo "错误：服务启动失败，请检查 server.js 文件。"
        exit 1
    fi
    echo "服务已启动，PID: $(cat server.pid)"
    echo "日志文件：server.log"
}

# 主流程
main() {
    check_node
    check_npm
    install_dependencies
    prepare_static_resources
    set_port
    start_server
}

# 执行主流程
main