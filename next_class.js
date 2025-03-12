function generateWeeklySchedule() {
    const storedCourses = localStorage.getItem('courses');
    const storedStartDate = localStorage.getItem('startDate');
    if (!storedCourses || !storedStartDate) {
        document.getElementById('weekly-schedule').innerHTML = `<p style="color: red">错误：未找到课程数据，请先输入课程数据。</p>`;
        return;
    }

    try {
        let courses, startDate;
        try {
            courses = JSON.parse(storedCourses);
            startDate = new Date(storedStartDate);
            if (!Array.isArray(courses) || isNaN(startDate.getTime())) {
                throw new Error("课程数据或开学日期格式不正确");
            }
        } catch (parseError) {
            console.error("课程数据解析失败：", parseError.message);
            document.getElementById('weekly-schedule').innerHTML = `<p style="color: red">错误：课程数据或开学日期格式不正确，请检查本地存储。</p>`;
            return;
        }

        const now = new Date();
        const currentWeek = Math.ceil((now - startDate) / (7 * 24 * 60 * 60 * 1000)); // 计算当前周数

        const weeklySchedule = {};

        // 初始化每周课程表
        ['1', '2', '3', '4', '5', '6', '7'].forEach(day => {
            weeklySchedule[day] = [];
        });

        // 填充课程表
        courses.forEach(course => {
            course.schedules.forEach(schedule => {
                // 增强：增加严格校验
                if (!isValidClass(schedule)) {
                    console.warn('发现无效课程数据：', schedule);
                    return;
                }

                const weeks = parseWeeks(schedule.weeks); // 解析 weeks 字段，支持单周和范围格式
                if (weeks.includes(currentWeek)) { // 过滤掉不在当前周范围内的课程
                    weeklySchedule[schedule.day].push({
                        course: course.name,
                        time_slot: schedule.time_slot,
                        campus: schedule.campus || '未指定',
                        building: schedule.building,
                        classroom: schedule.classroom
                    });
                }
            });
        });

        // 对每周的课程按时间排序
        for (const day in weeklySchedule) {
            weeklySchedule[day].sort((a, b) => {
                const [aStart] = a.time_slot.split('-').map(Number);
                const [bStart] = b.time_slot.split('-').map(Number);
                return aStart - bStart;
            });
        }

        // 生成 HTML 表格
        let scheduleHtml = '<h3>本周课程表：</h3>';
        for (const [day, classes] of Object.entries(weeklySchedule)) {
            scheduleHtml += `<h4>周${day}：</h4>`;
            if (classes.length === 0) {
                scheduleHtml += '<p>无课程</p>';
            } else {
                scheduleHtml += `
                    <table border="1" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th>课程名称</th>
                                <th>上课时间</th>
                                <th>上课地点</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                classes.forEach(cls => {
                    scheduleHtml += `
                        <tr>
                            <td>${cls.course}</td>
                            <td>${cls.time_slot}节</td>
                            <td>${cls.campus} ${cls.building} ${cls.classroom}</td>
                        </tr>
                    `;
                });
                scheduleHtml += '</tbody></table>';
            }
        }

        document.getElementById('weekly-schedule').innerHTML = scheduleHtml;

    } catch (error) {
        console.error("生成本周课程表失败：", error.message);
        document.getElementById('weekly-schedule').innerHTML = `<p style="color: red">错误：${error.message}</p>`;
    }
}


// 新增：核心过滤函数
function isValidClass(cls) {
    return cls.weeks && 
           cls.day && 
           cls.time_slot && 
           /\d+-\d+/.test(cls.time_slot) && // 新增正则校验
           cls.campus && 
           cls.building && 
           cls.classroom &&
           cls.day.trim() !== '' && 
           cls.time_slot.trim() !== '';
}

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

// 重写：导出本地存储功能
function exportLocalStorage() {
    const storedCourses = localStorage.getItem('courses');
    const storedStartDate = localStorage.getItem('startDate');
    const storedTimeConfig = localStorage.getItem('timeConfig'); // 新增：获取 timeConfig

    if (!storedCourses || !storedStartDate) {
        alert('没有可导出的本地数据');
        return;
    }

    try {
        const data = {
            courses: JSON.parse(storedCourses),
            startDate: storedStartDate,
            timeConfig: JSON.parse(storedTimeConfig) // 新增：加入 timeConfig
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'local_data.json';
        a.click();
    } catch (error) {
        console.error("导出本地数据失败：", error.message);
        alert('导出本地数据失败，请检查数据格式');
    }
}

// 删除多余的未闭合代码块

// 确保 displayNextClass 函数完整定义
function displayNextClass() {
    const storedCourses = localStorage.getItem('courses');
    if (!storedCourses) {
        document.getElementById('result').innerHTML = `<p style="color: red">错误：未找到课程数据，请先输入课程数据。</p>`;
        return;
    }

    try {
        // 增加数据验证
        let courses;
        try {
            courses = JSON.parse(storedCourses);
            if (!Array.isArray(courses)) {
                throw new Error("课程数据格式不正确");
            }
        } catch (parseError) {
            console.error("课程数据解析失败：", parseError.message);
            document.getElementById('result').innerHTML = `<p style="color: red">错误：课程数据格式不正确，请检查本地存储。</p>`;
            return;
        }

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
        console.error("显示下一节课失败：", error.message);
        document.getElementById('result').innerHTML = `<p style="color: red">错误：${error.message}</p>`;
    }
}

// 重写：清除本地存储功能
function clearLocalStorage() {
    localStorage.removeItem('courses');
    localStorage.removeItem('startDate'); // 确保清除所有相关数据
    alert('本地存储已清除');
    window.location.href = '/index.html'; // 删除数据后跳转回 index.html
}

// 页面加载时自动显示下一节课信息
function displayNextClass() {
    const storedCourses = localStorage.getItem('courses');
    if (!storedCourses) {
        document.getElementById('result').innerHTML = `<p style="color: red">错误：未找到课程数据，请先输入课程数据。</p>`;
        return;
    }

    try {
        // 增加数据验证
        let courses;
        try {
            courses = JSON.parse(storedCourses);
            if (!Array.isArray(courses)) {
                throw new Error("课程数据格式不正确");
            }
        } catch (parseError) {
            console.error("课程数据解析失败：", parseError.message);
            document.getElementById('result').innerHTML = `<p style="color: red">错误：课程数据格式不正确，请检查本地存储。</p>`;
            return;
        }

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
        console.error("显示下一节课失败：", error.message);
        document.getElementById('result').innerHTML = `<p style="color: red">错误：${error.message}</p>`;
    }
}

// 初始化默认时间配置
function initializeTimeConfig() {
    try {
        if (!localStorage.getItem('timeConfig')) {
            const defaultConfig = {
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
            localStorage.setItem('timeConfig', JSON.stringify(defaultConfig));
        } else {
            // 增加配置有效性校验
            const config = JSON.parse(localStorage.getItem('timeConfig'));
            if (!config.time_slots) throw new Error("Invalid config");
        }
    } catch (e) {
        console.error("重置为默认时间配置");
        localStorage.removeItem('timeConfig');
        initializeTimeConfig(); // 递归调用重新初始化
    }
}

// 修改 getStartTime 函数以支持从 localStorage 获取时间配置
function getStartTime(timeSlot) {
    if (!timeSlot || typeof timeSlot !== 'string') {
        console.error("无效的 timeSlot 参数：", timeSlot);
        return [8, 0]; // 默认值
    }

    let timeConfig = JSON.parse(localStorage.getItem('timeConfig')) || {};
    const timeSlots = timeConfig.time_slots || []; // 关键修改点

    const [startSection] = timeSlot.split('-').map(Number);
    const timeSlotInfo = timeSlots.find(slot => slot.section === startSection);
    return timeSlotInfo ? timeSlotInfo.start.split(':').map(Number) : [8, 0];
}

// 新增：导入时间配置功能
function importTimeConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = function (e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = function () {
            try {
                const config = JSON.parse(reader.result);
                localStorage.setItem('timeConfig', JSON.stringify(config));
                alert('时间配置导入成功');
            } catch (error) {
                alert('配置文件格式错误');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// 页面加载时调用初始化函数
window.onload = function () {
    initializeTimeConfig();
    displayNextClass();
};

// 计算下一节课的逻辑
function findNextClass(courses) {
    // 新增数据校验
    if (!Array.isArray(courses)) {
        console.error("课程数据格式错误");
        return null;
    }

    // 过滤无效课程数据（新增 time_slot 校验）
    const validCourses = courses.filter(c => 
        c.schedules?.some(s => 
            s.day && 
            s.time_slot && 
            /\d+-\d+/.test(s.time_slot) // 验证 time_slot 格式
        )
    );

    // 获取存储的开学日期并计算当前周
    const storedStartDate = localStorage.getItem('startDate');
    if (!storedStartDate) {
        console.error("未找到存储的开学日期");
        return null;
    }
    const startDate = new Date(storedStartDate);

    // 修复1：正确的周数计算
    const now = new Date();
    const timeDiff = now - startDate;
    const currentWeek = Math.floor(timeDiff / (7 * 24 * 60 * 60 * 1000)) + 1; // 使用 floor+1

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

    // 新增：过滤掉任何包含空值的课程
    const validClasses = allClasses.filter(cls => 
        cls.weeks && cls.day && cls.time_slot && cls.campus && cls.building && cls.classroom
    );

    // 优化后的过滤逻辑
    const allValidClasses = validClasses.filter(cls => {
        const weeks = parseWeeks(cls.weeks);
        const classDay = parseInt(cls.day, 10);
        const [startHour, startMinute] = getStartTime(cls.time_slot);

        // 双重验证：周数正确且课程时间未过
        return weeks.includes(currentWeek) && 
               isFutureClass(classDay, startHour, startMinute, now);
    }).sort((a, b) => {
        // 新增有效性验证
        const aValid = isValidClass(a) && !isNaN(getStartTime(a.time_slot)[0]);
        const bValid = isValidClass(b) && !isNaN(getStartTime(b.time_slot)[0]);

        if (!aValid) return 1;  // 无效项排最后
        if (!bValid) return -1; // 有效项排前面

        // 原有排序逻辑
        const currentDay = now.getDay();
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
    const nextWeekClasses = allClasses
        .filter(cls => {
            const weeks = parseWeeks(cls.weeks);
            const [startHour, startMinute] = getStartTime(cls.time_slot);
            return weeks.includes(currentWeek + 1) && 
                   !isNaN(startHour) && 
                   !isNaN(startMinute);
        })
        .sort((a, b) => {
            // 按周次、星期、时间排序
            const dayDiff = a.day - b.day;
            if (dayDiff !== 0) return dayDiff;
            return a.time_slot.split('-')[0] - b.time_slot.split('-')[0];
        });
    return nextWeekClasses.length > 0 ? nextWeekClasses[0] : null;
}

// 同步 displayResult 函数
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

// 同步 filterCurrentWeekClass 函数
function filterCurrentWeekClass(cls, currentWeek, now) {
    const weeks = parseWeeks(cls.weeks);
    if (!weeks.includes(currentWeek)) return false;

    // 原有时间比较逻辑
    const classDay = parseInt(cls.day, 10);
    const [startHour, startMinute] = getStartTime(cls.time_slot);
    return isFutureClass(classDay, startHour, startMinute, now);
}

// 修复时间判断函数
function isFutureClass(day, hour, minute, now) {
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const classTime = hour * 60 + minute;

    // 转换为0-6（周一=0，周日=6）
    const adjustedDay = (day + 6) % 7; // 原数据周一=1需要转换
    const adjustedCurrentDay = (currentDay + 6) % 7;

    // 跨周比较逻辑
    if (adjustedDay > adjustedCurrentDay) return true;
    if (adjustedDay === adjustedCurrentDay) {
        return classTime > currentTime;
    }
    return false;
}
