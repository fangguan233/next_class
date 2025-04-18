# next_class
属于大学生的课程表查看工具
简明的优雅的查看你的下一节课是什么。
拥有良好简单的ui可供使用
利用ai可以自动识别任意文字版的课程表（哪怕是你从教务系统粘下来的纯文本，只要有逻辑都可以识别）
# 体验项目
http://www.psilab.top:12000
# 部署服务器代码
当前版本你需要将next_class文件夹上传至服务器/www/wwwroot/
你需要配置app.js 25行服务器地址为你的服务器地址
配置server.js 24行开始配置你的api调用方式
# 启动服务器
使用sh deploy.sh 启动服务器，默认端口3000
也可以
PORT=你的端口号 ./deploy.sh
示例：使用 8080 端口
PORT=8080 ./deploy.sh

