const { execSync } = require('child_process'); // 引入 child_process 模块
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios'); // 替换 node-fetch 为 axios
require('dotenv').config(); // 加载环境变量

const app = express();

// 动态获取端口，默认为 3000
const PORT = process.env.PORT || 12000;

// 中间件
app.use(bodyParser.json());

// 引入日志中间件
const loggerMiddleware = require('./loggerMiddleware');
app.use(loggerMiddleware);

// 静态文件服务：新增对 .well-known 的支持
const path = require('path');
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));
app.use(express.static(path.join(__dirname, 'public')));

// AI接口调用函数
async function callAIModel(userInput) {
    console.log("调用 AI 接口，处理用户输入...");
    try {
        const apiUrl = 'https://wcode.net/api/gpt/v1/chat/completions';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sk-518.hoDkp2YdOZdewAwO0u7NzZGW5Kqh1AIwYX3KqOI1q5ht6aNt'
        };
        const data = {
            model: "qwen2.5-72b-instruct",
            messages: [
                {
                    role: "user",
                    content: `你需要将我输入的数据解析成如下的格式，不需要多一点内容，也不能少一点，，如没有下列json中的数据填空即可，如果出现区分单双周的课需要将原先的n-m周改变为n,n+2,n+4,...m，一定要注意区分开单双周，单周为单数双周为双数，而不区分单双周的为n-m，当day，timeslot，weeks无法读取时不要输出该课程，请尽全力课程数据课程数据，如果确实某一项数据则直接不填写整个课程内容，例如某课不存在可供填写的weeks，则不要填写整个课程相关的任何数据\n格式如下:\n["code": "课程代码","name": "课程名称","teachers": ["老师名称"],"schedules": [{"weeks": "如果不分单双周填写为n-m，如果区分单双周填写为n,n+2,n+4","day": "3","time_slot": "9-10","campus": "校区名称","building": "某教学楼","classroom": "301"}], {"code": "课程代码","name": "课程名称","teachers": ["老师名称"],"schedules": [{"weeks": "1-17","day": "2","time_slot": "7-8","campus": "校区名称","building": "某教学楼","classroom": "105"},{"weeks": "1,3,5,7,9","day": "4","time_slot": "5-6","campus": "校区名称","building": "某教学楼","classroom": "105"}]}]\n数据内容如下: ${JSON.stringify(userInput, null, 2)}`
                }
            ]
        };

        // 使用 axios 发送 POST 请求
        const response = await axios.post(apiUrl, data, { 
            headers,
            timeout: 180000 // 设置超时时间为 3 分钟
        });

        console.log("AI 接口返回数据：", response.data);
        const responseData = response.data;

        // 增加对返回数据的初步校验
        if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message || !responseData.choices[0].message.content) {
            throw new Error("AI接口返回的数据缺少必要字段");
        }

        try {
            // 获取原始返回内容
            let rawContent = responseData.choices[0].message.content;

            // 新增：清理返回内容中的多余字符（如 ```json 标记）
            rawContent = rawContent.replace(/```json|```/g, '').trim();

            // 尝试解析清理后的数据
            const parsedData = JSON.parse(rawContent);

            // 新增：验证解析后的数据是否符合预期格式
            if (!Array.isArray(parsedData)) {
                throw new Error("解析后的数据不是数组格式");
            }

            return parsedData;
        } catch (error) {
            console.error("AI 接口返回的数据格式不正确，无法解析为JSON");
            console.error("原始返回数据：", responseData.choices[0].message.content); // 新增：记录原始返回数据
            console.error("解析错误详情：", error.message); // 新增：记录解析错误详情
            throw new Error("AI接口返回的数据格式不正确，无法解析为JSON，请检查返回内容是否符合预期");
        }
    } catch (error) {
        console.error("AI 接口调用失败：", error.message);
        throw new Error(`AI接口调用失败: ${error.message}`);
    }
}

// 路由：处理课程数据
app.post('/process-data', async (req, res) => {
    const { userInput } = req.body;
    console.log("收到 POST 请求，用户输入数据：", userInput);

    if (!userInput) {
        console.error("用户输入为空");
        return res.status(400).json({ success: false, message: "用户输入为空" });
    }

    try {
        // 调用AI模型处理用户输入
        const courses = await callAIModel(userInput);
        console.log("成功处理用户输入，返回课程数据：", courses);

        // 返回格式化后的JSON
        res.json({ success: true, courses });
    } catch (error) {
        console.error("处理用户输入时发生错误：", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 使用 helmet 中间件来强制 HTTPS
app.use(helmet());
app.use(helmet.hsts({
    maxAge: 31536000, // 一年
    includeSubDomains: true,
    preload: true
}));

// 添加 HTTPS 配置
const https = require('https');
const fs = require('fs');

// 使用Let's Encrypt证书路径
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/www.psilab.top/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/www.psilab.top/fullchain.pem')
};

// 创建HTTPS服务器（监听8443端口）
https.createServer(sslOptions, app)
    .listen(8443, () => {
        console.log(`HTTPS服务运行在8443端口`);
    });
