// 防止重复点击并显示提示信息
async function processData() {
    const button = document.querySelector('button[onclick="processData()"]');
    button.disabled = true; // 禁用按钮
    button.innerHTML = "正在处理，请稍候..."; // 提示用户

    try {
        const userInput = document.getElementById('inputArea').value.trim();
        const startDateInput = document.getElementById('start-date').value;
        const resultDiv = document.getElementById('result');
        const jsonView = document.getElementById('jsonView');

        if (!userInput || !startDateInput) {
            resultDiv.innerHTML = `<p style="color: red">错误：请输入课程数据并选择开学第一天。</p>`;
            return;
        }

        const startDate = new Date(startDateInput);
        if (startDate.getDay() !== 1) { // 检查是否为周一
            resultDiv.innerHTML = `<p style="color: red">错误：请选择周一作为开学第一天。</p>`;
            return;
        }

        // 调用后端接口
        const response = await fetch('http://www.example.top:12000/process-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userInput, startDate: startDate.toISOString() })
        });

        if (!response.ok) {
            throw new Error(`服务器返回错误：${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message);
        }

        const courses = data.courses;

        // 增强：过滤无效课程数据
        const filteredCourses = courses.filter(course => 
            course.schedules?.some(schedule => isValidClass(schedule))
        );

        // 写入默认 time_slots 配置到本地存储
        const defaultTimeConfig = {
            config_id: "default",
            time_slots: [
                { section: 1, start: "08:20", end: "09:05" },
                { section: 2, start: "09:10", end: "09:55" },
                { section: 3, start: "10:10", end: "10:55" },
                { section: 4, start: "11:00", end: "11:45" },
                { section: 5, start: "13:45", end: "14:30" },
                { section: 6, start: "14:35", end: "15:20" },
                { section: 7, start: "15:35", end: "16:20" },
                { section: 8, start: "16:25", end: "17:10" },
                { section: 9, start: "18:30", end: "19:15" },
                { section: 10, start: "19:25", end: "20:10" },
                { section: 11, start: "20:20", end: "21:05" },
                { section: 12, start: "21:15", end: "22:00" }
            ]
        };
        localStorage.setItem('timeConfig', JSON.stringify(defaultTimeConfig));

        // 将课程表数据存储到本地存储
        localStorage.setItem('courses', JSON.stringify(filteredCourses));
        localStorage.setItem('startDate', startDate.toISOString());

        // 显示原始JSON
        jsonView.innerHTML = `<h3>格式化结果：</h3><pre>${JSON.stringify(filteredCourses, null, 2)}</pre>`;

        // 计算下一节课
        const nextClass = findNextClass(filteredCourses);
        displayResult(nextClass);

        // 新增：显示提交成功的提示信息
        resultDiv.innerHTML = `<p style="color: green">提交成功！</p>` + resultDiv.innerHTML;

    } catch (error) {
        console.error("处理数据失败：", error.message);
        resultDiv.innerHTML = `<p style="color: red">错误：${error.message}</p>`;
    } finally {
        button.disabled = false; // 恢复按钮状态
        button.innerHTML = "查询下一节课"; // 恢复按钮文本
    }
}

// 核心过滤函数
function isValidClass(cls) {
    return cls.weeks && cls.day && cls.time_slot && 
           cls.campus && cls.building && cls.classroom &&
           typeof cls.weeks === 'string' &&
           typeof cls.day === 'string' &&
           typeof cls.time_slot === 'string';
}

// 修复后的findNextClass函数
function findNextClass(courses) {
    const now = new Date();
    const currentDay = now.getDay(); // 0-6（周日-周六）
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // 获取存储的开学日期并计算当前周
    const storedStartDate = localStorage.getItem('startDate');
    if (!storedStartDate) {
        console.error("未找到存储的开学日期");
        return null;
    }
    const startDate = new Date(storedStartDate);

    // 修复：正确的周数计算
    const timeDiff = now - startDate;
    const currentWeek = Math.max(1, Math.floor(timeDiff / (7 * 24 * 60 * 60 * 1000)) + 1);

    // 增强课程过滤逻辑
    if (!Array.isArray(courses)) {
        console.error("课程数据格式错误");
        return null;
    }

    const validCourses = courses.filter(c => 
        c.schedules?.some(s => s.day && s.time_slot)
    );

    // 将课程数据转换为可比较的时间格式
    const allClasses = validCourses.flatMap(course => 
        course.schedules.map(schedule => ({
            ...schedule,
            course: course.name,
            campus: schedule.campus,
            building: schedule.building,
            classroom: schedule.classroom
        }))
    );

    // 增强：使用 isValidClass 进行过滤
    const validClasses = allClasses.filter(cls => isValidClass(cls));

    // 优化后的过滤逻辑
    const allValidClasses = validClasses.filter(cls => {
        const weeks = parseWeeks(cls.weeks);
        const classDay = parseInt(cls.day, 10);
        const [startHour, startMinute] = getStartTime(cls.time_slot);

        // 双重验证：周数正确且课程时间未过
        return weeks.includes(currentWeek) && 
               isFutureClass(classDay, startHour, startMinute, now);
    }).sort((a, b) => {
        // 优先当天剩余课程
        const isAToday = a.day === currentDay;
        const isBToday = b.day === currentDay;

        if (isAToday && !isBToday) return -1;
        if (!isAToday && isBToday) return 1;

        // 同天按时间排序
        if (a.day === b.day) {
            return (a.time_slot.split('-')[0] - b.time_slot.split('-')[0]);
        }
        return a.day - b.day;
    });

    // 优先返回当天课程
    if (allValidClasses.length > 0) {
        return allValidClasses[0];
    }

    // 处理跨周逻辑
    const nextWeekClasses = validClasses
        .filter(cls => {
            const weeks = parseWeeks(cls.weeks);
            return weeks.includes(currentWeek + 1);
        })
        .sort((a, b) => {
            // 按周次、星期、时间排序
            const dayDiff = a.day - b.day;
            if (dayDiff !== 0) return dayDiff;
            return a.time_slot.split('-')[0] - b.time_slot.split('-')[0];
        });
    return nextWeekClasses.length > 0 ? nextWeekClasses[0] : null;
}

// 解析 weeks 字段
function parseWeeks(weeksStr) {
    if (!weeksStr || typeof weeksStr !== 'string') {
        console.warn("weeks字段为空或无效，跳过解析");
        return [];
    }

    const weeks = [];
    const parts = weeksStr.split(',');

    parts.forEach(part => {
        if (part.includes('-')) {
            // 处理范围格式，如 "1-5"
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    weeks.push(i);
                }
            } else {
                console.warn(`无效的范围格式: ${part}`);
            }
        } else {
            // 处理单周格式，如 "3"
            const week = Number(part);
            if (!isNaN(week)) {
                weeks.push(week);
            } else {
                console.warn(`无效的单周格式: ${part}`);
            }
        }
    });

    return weeks;
}

// 获取时间段的开始时间
function getStartTime(timeSlot) {
    if (!timeSlot || typeof timeSlot !== 'string') {
        console.error("无效的 timeSlot 参数：", timeSlot);
        return [8, 0]; // 默认值
    }

    const [startSection] = timeSlot.split('-').map(Number);
    const defaultTimeSlots = [
        { section: 1, start: "00:00" },
        { section: 2, start: "08:55" },
        { section: 3, start: "09:50" },
        { section: 4, start: "10:45" },
        { section: 5, start: "11:40" },
        { section: 6, start: "12:35" },
        { section: 7, start: "13:30" },
        { section: 8, start: "14:25" },
        { section: 9, start: "15:20" },
        { section: 10, start: "16:15" },
        { section: 11, start: "17:10" },
        { section: 12, start: "18:05" }
    ];

    const timeSlotInfo = defaultTimeSlots.find(slot => slot.section === startSection);
    return timeSlotInfo ? timeSlotInfo.start.split(':').map(Number) : [8, 0];
}

// 判断课程是否在未来
function isFutureClass(day, hour, minute, now) {
    if (isNaN(day) || isNaN(hour) || isNaN(minute)) {
        console.error('无效的时间参数', { day, hour, minute });
        return false;
    }

    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const classTime = hour * 60 + minute;

    // 转换为0-6（周一=0，周日=6）
    const adjustedDay = (day + 6) % 7;
    const adjustedCurrentDay = (currentDay + 6) % 7;

    // 跨周比较逻辑
    if (adjustedDay > adjustedCurrentDay) return true;
    if (adjustedDay === adjustedCurrentDay) {
        return classTime > currentTime;
    }
    return false;
}

// 显示下一节课信息
function displayResult(nextClass) {
    const resultDiv = document.getElementById('result');
    
    if (nextClass) {
        let notice = '';
        const currentWeek = Math.ceil((new Date() - new Date(localStorage.getItem('startDate'))) / (7 * 24 * 60 * 60 * 1000));
        
        // 判断是否是下周课程
        if (parseWeeks(nextClass.weeks)[0] > currentWeek) {
            notice = '<p style="color:#666">（提示：当前显示的是下周第一节课）</p>';
        }

        resultDiv.innerHTML = `
            <h3>下一节课信息：</h3>
            ${notice}
            <p>课程名称：${nextClass.course}</p>
            <p>上课时间：周${nextClass.day} ${nextClass.time_slot}节</p>
            <p>上课地点：${nextClass.campus || '未指定'} ${nextClass.building} ${nextClass.classroom}</p>
        `;
    } else {
        resultDiv.innerHTML = "<p>近期没有后续课程安排</p>";
    }
}

// 页面加载时自动显示下一节课信息
function displayNextClass() {
    const storedCourses = localStorage.getItem('courses');
    if (!storedCourses) {
        document.getElementById('result').innerHTML = `<p style="color: red">错误：未找到课程数据，请先输入课程数据。</p>`;
        return;
    }

    try {
        const courses = JSON.parse(storedCourses);
        const nextClass = findNextClass(courses);

        if (nextClass) {
            document.getElementById('result').innerHTML = `
                <h3>下一节课信息：</h3>
                <p>课程名称：${nextClass.course}</p>
                <p>上课时间：周${nextClass.day} ${nextClass.time_slot}节</p>
                <p>上课地点：${nextClass.campus} ${nextClass.building} ${nextClass.classroom}</p>
            `;
        } else {
            document.getElementById('result').innerHTML = "<p>今天没有后续课程了</p>";
        }

        generateWeeklySchedule();
    } catch (error) {
        document.getElementById('result').innerHTML = `<p style="color: red">错误：课程数据解析失败。</p>`;
    }
}

// 新增函数：生成本周课程表
function generateWeeklySchedule() {
    const storedCourses = localStorage.getItem('courses');
    if (!storedCourses) {
        return;
    }

    try {
        const courses = JSON.parse(storedCourses);
        const now = new Date();
        const currentDay = now.getDay(); // 0-6（周日-周六）
        const startDate = new Date(localStorage.getItem('startDate'));
        const daysOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

        // 计算本周的开始日期
        const weekStartDate = new Date(startDate);
        weekStartDate.setDate(startDate.getDate() + (currentDay - startDate.getDay()));

        const scheduleDiv = document.getElementById('schedule');
        scheduleDiv.innerHTML = '';

        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStartDate);
            day.setDate(weekStartDate.getDate() + i);
            const dayOfWeek = daysOfWeek[day.getDay()];
            let dayClasses = courses.flatMap(course => 
                course.schedules.filter(schedule => schedule.day === day.getDay()).map(schedule => ({
                    ...schedule,
                    course: course.name,
                    campus: schedule.campus,
                    building: schedule.building,
                    classroom: schedule.classroom
                }))
            );

            // 新增：过滤掉任何包含空值的课程
            dayClasses = dayClasses.filter(cls => 
                cls.weeks && cls.day && cls.time_slot && cls.campus && cls.building && cls.classroom
            );

            // 按照 time_slot 排序课程
            dayClasses.sort((a, b) => {
                const [aStart] = a.time_slot.split('-').map(Number);
                const [bStart] = b.time_slot.split('-').map(Number);
                return aStart - bStart;
            });

            if (dayClasses.length > 0) {
                scheduleDiv.innerHTML += `<h3>${dayOfWeek} (${day.toISOString().split('T')[0]})</h3>`;
                dayClasses.forEach(cls => {
                    scheduleDiv.innerHTML += `
                        <p>课程名称：${cls.course}</p>
                        <p>上课时间：${cls.time_slot}节</p>
                        <p>上课地点：${cls.campus || '未指定'} ${cls.building} ${cls.classroom}</p>
                    `;
                });
            }
        }
    } catch (error) {
        console.error("生成本周课程表失败：", error.message);
    }
}

// 新增：删除本地存储功能
function clearLocalStorage() {
    localStorage.removeItem('courses');
    localStorage.removeItem('startDate');
    alert('本地存储已清除');
    window.location.href = '/index.html'; // 删除数据后跳转回 index.html
}

// 重写：导出本地存储功能
function exportLocalStorage() {
    const storedCourses = localStorage.getItem('courses');
    const storedStartDate = localStorage.getItem('startDate');
    const storedTimeConfig = localStorage.getItem('timeConfig'); // 新增：获取 timeConfig

    // 验证本地存储数据是否存在
    if (!storedCourses || !storedStartDate) {
        alert('没有可导出的本地数据，请先输入课程数据并设置开学日期。');
        return;
    }

    try {
        // 解析并验证数据格式
        const parsedCourses = JSON.parse(storedCourses);
        if (!Array.isArray(parsedCourses)) {
            throw new Error("课程数据格式不正确");
        }

        const data = {
            courses: parsedCourses,
            startDate: storedStartDate,
            timeConfig: JSON.parse(storedTimeConfig) // 新增：加入 timeConfig
        };

        // 创建下载链接
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const link = document.createElement('a');
        link.href = jsonString;
        link.download = 'local_data.json';
        link.click();

        alert('本地数据已成功导出为 local_data.json 文件');
    } catch (error) {
        console.error("导出本地数据失败：", error.message);
        alert(`导出本地数据失败：${error.message}`);
    }
}

// 新增：导入本地存储功能
function importLocalStorage() {
    const fileInput = document.getElementById('import-file');
    const resultDiv = document.getElementById('result');

    if (!fileInput.files.length) {
        alert('请选择一个有效的 .json 文件');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function (event) {
        try {
            const content = event.target.result;
            const data = JSON.parse(content);

            // 验证数据格式，允许部分字段缺失
            if (!data.courses || !Array.isArray(data.courses)) {
                throw new Error("导入的数据中缺少有效的 'courses' 字段");
            }
            if (!data.startDate || typeof data.startDate !== 'string') {
                throw new Error("导入的数据中缺少有效的 'startDate' 字段");
            }

            // 如果 timeConfig 缺失，使用默认值
            const defaultTimeConfig = {
                config_id: "default",
                time_slots: [
                    { section: 1, start: "08:20", end: "09:05" },
                    { section: 2, start: "09:10", end: "09:55" },
                    { section: 3, start: "10:10", end: "10:55" },
                    { section: 4, start: "11:00", end: "11:45" },
                    { section: 5, start: "13:45", end: "14:30" },
                    { section: 6, start: "14:35", end: "15:20" },
                    { section: 7, start: "15:35", end: "16:20" },
                    { section: 8, start: "16:25", end: "17:10" },
                    { section: 9, start: "18:30", end: "19:15" },
                    { section: 10, start: "19:25", end: "20:10" },
                    { section: 11, start: "20:20", end: "21:05" },
                    { section: 12, start: "21:15", end: "22:00" }
                ]
            };
            const timeConfig = data.timeConfig && typeof data.timeConfig === 'object' 
                ? data.timeConfig 
                : defaultTimeConfig;

            // 存储到本地存储
            localStorage.setItem('courses', JSON.stringify(data.courses));
            localStorage.setItem('startDate', data.startDate);
            localStorage.setItem('timeConfig', JSON.stringify(timeConfig));

            alert('本地数据已成功导入');
            window.location.reload(); // 刷新页面以应用新数据
        } catch (error) {
            console.error("导入本地数据失败：", error.message);
            resultDiv.innerHTML = `<p style="color: red">错误：${error.message}</p>`;
        }
    };

    reader.onerror = function () {
        resultDiv.innerHTML = `<p style="color: red">错误：文件读取失败</p>`;
    };

    reader.readAsText(file);
}

// 绑定文件输入框的 change 事件
document.getElementById('import-file').addEventListener('change', importLocalStorage);

// 新增：页面加载时检查本地存储并跳转
window.onload = function() {
    if (window.location.pathname.endsWith('/index.html') || window.location.pathname === '/') {
        console.log("当前页面为 index.html，检查本地存储并跳转");
        const storedCourses = localStorage.getItem('courses');
        if (storedCourses) {
            try {
                JSON.parse(storedCourses); // 确保数据有效
                console.log("本地存储数据有效，准备跳转到 /next_class.html");
                window.location.href = '/next_class.html'; // 修改为绝对路径
            } catch (error) {
                console.error("本地存储数据无效，不跳转");
            }
        } else {
            console.log("本地存储中未找到课程数据，不跳转");
        }
    }
};

// 新增函数：解析 weeks 字段
function parseWeeks(weeksStr) {
    // 如果输入为空或无效，返回空数组
    if (!weeksStr || typeof weeksStr !== 'string') {
        console.warn("weeks字段为空或无效，跳过解析");
        return [];
    }

    const weeks = [];
    const parts = weeksStr.split(',');

    parts.forEach(part => {
        if (part.includes('-')) {
            // 处理范围格式，如 "1-5"
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    weeks.push(i);
                }
            } else {
                console.warn(`无效的范围格式: ${part}`);
            }
        } else {
            // 处理单周格式，如 "3"
            const week = Number(part);
            if (!isNaN(week)) {
                weeks.push(week);
            } else {
                console.warn(`无效的单周格式: ${part}`);
            }
        }
    });

    return weeks;
}
