// 防止重复点击并显示提示信息
async function processData() {
    const button = document.querySelector('button[onclick="processData()"]');
    
    // 检查是否已有数据，并提示用户
    const existingCourses = localStorage.getItem('courses');
    if (existingCourses && JSON.parse(existingCourses).length > 0) {
        if (!confirm("您已存有课程数据，此操作将覆盖所有已有数据，确定要继续吗？")) {
            return; // 用户取消操作
        }
    }

    button.disabled = true; // 禁用按钮
    button.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        正在处理...
    `; // 提示用户

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
        const response = await fetch('/api/process-data', {
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
        resultDiv.innerHTML = `<p style="color: green">提交成功！正在跳转...</p>` + resultDiv.innerHTML;
        
        // 成功后跳转到课程表页面
        window.location.href = 'next_class.html';

    } catch (error) {
        console.error("处理数据失败：", error.message);
        resultDiv.innerHTML = `<p style="color: red">错误：${error.message}</p>`;
    } finally {
        button.disabled = false; // 恢复按钮状态
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            导入文本数据
        `; // 恢复按钮文本
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


// 新增：跳转到课程界面
function goToNextClass() {
    const storedCourses = localStorage.getItem('courses');
    if (storedCourses && JSON.parse(storedCourses).length > 0) {
        window.location.href = 'next_class.html';
    } else {
        alert('没有课程数据，请先导入数据。');
    }
}

// 新增：删除本地存储功能
function clearLocalStorage() {
    if (confirm("确定要清除所有本地课程数据吗？此操作不可逆。")) {
        localStorage.removeItem('courses');
        localStorage.removeItem('startDate');
        localStorage.removeItem('timeConfig');
        alert('本地存储已清除');
        window.location.reload(); // 重新加载页面以更新状态
    }
}

// --- 弹窗控制 ---
const modal = document.getElementById('shareModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalActions = document.getElementById('modalActions');

function showModal(title, body, actions) {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalActions.innerHTML = '';
    actions.forEach(action => {
        const button = document.createElement('button');
        button.textContent = action.text;
        // 修复暗色模式UI Bug
        let baseClass = "px-4 py-2 rounded transition-all duration-200";
        if (action.type === 'primary') {
            button.className = `${baseClass} bg-light-btn dark:bg-blue-700 text-white dark:hover:bg-blue-600`;
        } else {
            button.className = `${baseClass} bg-gray-300 dark:bg-gray-600 dark:text-gray-200 text-gray-800 dark:hover:bg-gray-500`;
        }
        button.onclick = action.handler;
        modalActions.appendChild(button);
    });
    modal.classList.add('visible');
}

function hideModal() {
    modal.classList.remove('visible');
}

// 新增：分享课程表功能
async function shareSchedule() {
    const storedCourses = localStorage.getItem('courses');
    const storedStartDate = localStorage.getItem('startDate');
    const storedTimeConfig = localStorage.getItem('timeConfig');

    if (!storedCourses || !storedStartDate) {
        showModal('分享失败', '<p>没有可分享的本地数据。</p>', [
            { text: '关闭', class: 'px-4 py-2 bg-gray-300 rounded', handler: hideModal }
        ]);
        return;
    }

    try {
        // 1. 请求分享码
        const codeResponse = await fetch('/api/share/generate-code', { method: 'POST' });
        if (!codeResponse.ok) throw new Error('获取分享码失败');
        const { share_code } = await codeResponse.json();

        // 2. 准备上传数据
        const data = {
            courses: JSON.parse(storedCourses),
            startDate: storedStartDate,
            timeConfig: JSON.parse(storedTimeConfig)
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const formData = new FormData();
        formData.append('file', blob, `${share_code}.json`);
        formData.append('share_code', share_code);

        // 3. 上传文件
        const uploadResponse = await fetch('/api/share/upload', {
            method: 'POST',
            body: formData
        });

        if (!uploadResponse.ok) {
            // 检查是否是速率限制错误
            if (uploadResponse.status === 429) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.message || '操作过于频繁，请稍后重试。');
            }
            throw new Error('上传分享文件失败');
        }

        // 4. 显示成功信息
        showModal('分享成功', `
            <p>您的分享码是：</p>
            <p class="text-3xl font-bold my-4">${share_code}</p>
            <p class="text-sm text-gray-500">（分享码有效期24小时）</p>
        `, [
            { text: '复制', type: 'primary', handler: () => copyToClipboard(share_code) },
            { text: '关闭', type: 'secondary', handler: hideModal }
        ]);

    } catch (error) {
        console.error("分享失败：", error.message);
        showModal('分享失败', `<p>${error.message}</p>`, [
            { text: '关闭', class: 'px-4 py-2 bg-gray-300 rounded', handler: hideModal }
        ]);
    }
}

// 新增：通过分享码导入功能
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000); // 2秒后自动消失
}

function copyToClipboard(text) {
    // 优先使用 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('已复制到剪贴板');
        }).catch(err => {
            console.error('使用 Clipboard API 复制失败:', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        // 回退到 document.execCommand
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // 避免在屏幕上闪烁
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast('已复制到剪贴板');
        } else {
            showToast('复制失败，请手动复制');
        }
    } catch (err) {
        console.error('使用 execCommand 复制失败:', err);
        showToast('复制失败，请手动复制');
    }

    document.body.removeChild(textArea);
}

// 新增：通过分享码导入功能
function importWithShareCode() {
    showModal('通过分享码导入', `
        <input type="text" id="shareCodeInput" class="w-full p-2 border rounded bg-white dark:bg-gray-800 dark:text-gray-200" placeholder="请输入6位分享码" maxlength="6">
    `, [
        { text: '导入', type: 'primary', handler: async () => {
            // 添加覆盖警告
            const existingCourses = localStorage.getItem('courses');
            if (existingCourses && JSON.parse(existingCourses).length > 0) {
                if (!confirm("此操作将覆盖您当前的课程表，确定要继续吗？")) {
                    return; // 用户取消操作
                }
            }

            const shareCode = document.getElementById('shareCodeInput').value;
            if (!shareCode || !/^\d{6}$/.test(shareCode)) {
                showToast("请输入有效的6位数字分享码。");
                return;
            }

            try {
                const response = await fetch(`/api/share/get/${shareCode}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error("分享码不存在或已过期。");
                    }
                    throw new Error(`服务器错误 (HTTP ${response.status})`);
                }

                const data = await response.json();

                if (!data.courses || !data.startDate) {
                    throw new Error("分享的数据格式不正确。");
                }

                localStorage.setItem('courses', JSON.stringify(data.courses));
                localStorage.setItem('startDate', data.startDate);
                if (data.timeConfig) {
                    localStorage.setItem('timeConfig', JSON.stringify(data.timeConfig));
                }

                hideModal();
                showToast("导入成功！");
                window.location.href = 'next_class.html';

            } catch (error) {
                console.error("通过分享码导入失败：", error.message);
                showToast(`导入失败：${error.message}`);
            }
        }},
        { text: '取消', type: 'secondary', handler: hideModal }
    ]);
}
