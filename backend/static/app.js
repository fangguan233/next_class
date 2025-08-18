// =================================================================================
// 全局状态管理
// =================================================================================
let selectedFiles = []; // 用于存储用户选择的图片文件

// =================================================================================
// 主处理函数（由“导入数据”按钮触发）
// =================================================================================
async function processData() {
    const button = document.querySelector('button[onclick="processData()"]');
    
    // 检查是否已有数据，并提示用户
    const existingCourses = localStorage.getItem('courses');
    if (existingCourses && JSON.parse(existingCourses).length > 0) {
        if (!confirm("您已存有课程数据，此操作将覆盖所有已有数据，确定要继续吗？")) {
            return; // 用户取消操作
        }
    }

    // 检查开学日期
    const startDateInput = document.getElementById('start-date').value;
    if (!startDateInput) {
        showToast("错误：请选择开学第一天。");
        return;
    }
    const startDate = new Date(startDateInput);
    if (startDate.getDay() !== 1) { // 检查是否为周一
        showToast("错误：请选择周一作为开学第一天。");
        return;
    }

    // 逻辑分发：判断是处理图片还是文本
    if (selectedFiles.length > 0) {
        await processImageData(button);
    } else {
        await processTextData(button);
    }
}

// =================================================================================
// 文本数据处理
// =================================================================================
async function processTextData(button) {
    const userInput = document.getElementById('inputArea').value.trim();
    if (!userInput) {
        showToast("错误：请输入课程数据。");
        return;
    }

    button.disabled = true;
    button.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        正在处理...
    `;

    try {
        const response = await fetch('/api/process-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userInput, startDate: document.getElementById('start-date').value })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `服务器返回错误：${response.status}`);
        }
        const data = await response.json();
        // 如果操作不成功，但返回了课程数据（例如AI修正失败），则跳转到编辑页
        if (!data.success) {
            if (data.courses) {
                handleFailedImportWithData(data.courses, data.message);
            } else {
                throw new Error(data.message || '未知错误');
            }
        } else {
            handleSuccessfulImport(data.courses);
        }

    } catch (error) {
        console.error("文本处理失败：", error.message);
        showToast(`处理失败: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            导入数据
        `;
    }
}

// =================================================================================
// 图片数据处理
// =================================================================================
async function processImageData(button) {
    // 风险提示
    const userConfirmation = confirm(
        "图片识别准确度相对较低，几乎处于不可用的状态。目前处于开发测试阶段，可能需要您在导入后进行手动修正。\n\n为了获得最佳效果，我们强烈建议您使用格式化的文本数据进行导入。\n\n您确定要继续使用图片导入吗？\n\n后续将使用ocr+大模型替换现有的多模态模型识别"
    );
    if (!userConfirmation) {
        showToast("图片导入已取消。");
        return;
    }

    button.disabled = true;
    button.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        正在识别...
    `;

    try {
        const base64Images = await Promise.all(selectedFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });
        }));

        const response = await fetch('/api/process-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: base64Images })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `服务器返回错误：${response.status}`);
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message);
        }

        handleSuccessfulImport(data.courses);

    } catch (error) {
        console.error("图片处理失败：", error.message);
        showToast(`识别失败: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
            导入数据
        `;
    }
}

// =================================================================================
// 导入成功/失败后的处理逻辑
// =================================================================================
function handleFailedImportWithData(courses, message) {
    console.warn("AI修正失败，但仍保存数据并跳转到编辑页:", message);
    
    // 保存数据，以便用户可以手动编辑
    localStorage.setItem('courses', JSON.stringify(courses));
    const startDateInput = document.getElementById('start-date').value;
    if (startDateInput) {
        localStorage.setItem('startDate', new Date(startDateInput).toISOString());
    }
    // 可以考虑也保存一个默认的 timeConfig
    if (!localStorage.getItem('timeConfig')) {
        const defaultTimeConfig = { config_id: "default", time_slots: [ { section: 1, start: "08:20", end: "09:05" }, { section: 2, start: "09:10", end: "09:55" }, { section: 3, start: "10:10", end: "10:55" }, { section: 4, start: "11:00", end: "11:45" }, { section: 5, start: "13:45", end: "14:30" }, { section: 6, start: "14:35", end: "15:20" }, { section: 7, start: "15:35", end: "16:20" }, { section: 8, start: "16:25", end: "17:10" }, { section: 9, start: "18:30", end: "19:15" }, { section: 10, start: "19:25", end: "20:10" }, { section: 11, start: "20:20", end: "21:05" }, { section: 12, start: "21:15", end: "22:00" } ] };
        localStorage.setItem('timeConfig', JSON.stringify(defaultTimeConfig));
    }

    // 存储警告信息，以便在编辑页面显示
    sessionStorage.setItem('conflict_warning', message);

    // 清理输入
    document.getElementById('inputArea').value = '';
    selectedFiles = [];
    renderThumbnails();

    showToast("AI修正失败，请手动检查。正在跳转...");
    setTimeout(() => {
window.location.href = 'edit.html';
    }, 1500);
}

function handleSuccessfulImport(courses) {
    const startDateInput = document.getElementById('start-date').value;

    const filteredCourses = courses.filter(course => 
        course.schedules?.some(schedule => isValidClass(schedule))
    );

    // 在保存前进行冲突检测
    const conflictResult = detectConflicts(filteredCourses);

    // 无论是否有冲突，都先保存数据，以便用户可以在编辑页面看到并修复
    const defaultTimeConfig = {
        config_id: "default",
        time_slots: [
            { section: 1, start: "08:20", end: "09:05" }, { section: 2, start: "09:10", end: "09:55" },
            { section: 3, start: "10:10", end: "10:55" }, { section: 4, start: "11:00", end: "11:45" },
            { section: 5, start: "13:45", end: "14:30" }, { section: 6, start: "14:35", end: "15:20" },
            { section: 7, start: "15:35", end: "16:20" }, { section: 8, start: "16:25", end: "17:10" },
            { section: 9, start: "18:30", end: "19:15" }, { section: 10, start: "19:25", end: "20:10" },
            { section: 11, start: "20:20", end: "21:05" }, { section: 12, start: "21:15", end: "22:00" }
        ]
    };
    localStorage.setItem('timeConfig', JSON.stringify(defaultTimeConfig));
    localStorage.setItem('courses', JSON.stringify(filteredCourses));
    localStorage.setItem('startDate', new Date(startDateInput).toISOString());

    // 清理输入
    document.getElementById('inputArea').value = '';
    selectedFiles = [];
    renderThumbnails();

    if (conflictResult.hasConflict) {
        // 如果有冲突，存储冲突信息并跳转到编辑页
        sessionStorage.setItem('conflict_warning', conflictResult.message);
        showToast("检测到课程冲突！正在跳转到编辑页面...");
        setTimeout(() => {
            window.location.href = 'edit.html';
        }, 1500);
    } else {
        // 如果没有冲突，正常跳转
        showToast("导入成功！正在跳转...");
        setTimeout(() => {
            window.location.href = 'next_class.html';
        }, 1000);
    }
}


// =================================================================================
// 图片选择与预览
// =================================================================================
function handleFileSelection(event) {
    const MAX_IMAGE_COUNT = 50;
    const files = event.target.files;
    
    if (files.length > 0) {
        const potentialTotal = selectedFiles.length + files.length;
        if (potentialTotal > MAX_IMAGE_COUNT) {
            showToast(`错误：最多只能上传 ${MAX_IMAGE_COUNT} 张图片。`);
            // 清空文件选择器的值，防止用户再次选择相同的文件而无法触发 change 事件
            event.target.value = '';
            return;
        }
        // 将新文件添加到暂存区
        selectedFiles.push(...Array.from(files));
        renderThumbnails();
    }
    // 清空选择，以便用户可以再次选择相同的文件
    event.target.value = '';
}

function renderThumbnails() {
    const container = document.getElementById('image-preview-container');
    container.innerHTML = ''; // 清空现有预览

    if (selectedFiles.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'relative group';

            const img = document.createElement('img');
            img.src = reader.result;
            img.className = 'w-full h-full object-cover rounded-md aspect-square';
            
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '&times;';
            removeBtn.className = 'absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity';
            removeBtn.onclick = () => {
                selectedFiles.splice(index, 1); // 从数组中移除
                renderThumbnails(); // 重新渲染
            };

            thumbWrapper.appendChild(img);
            thumbWrapper.appendChild(removeBtn);
            container.appendChild(thumbWrapper);
        };
    });
}


// =================================================================================
// 页面初始化与事件绑定
// =================================================================================
async function checkFeatureFlags() {
    try {
        const response = await fetch('/api/feature-flags');
        if (!response.ok) return; // 如果接口请求失败，则保持默认UI

        const data = await response.json();
        if (data.success && data.features) {
            // 根据后端返回的状态控制图片上传功能的显示
            const imageUploadSection = document.getElementById('image-upload-section');
            if (imageUploadSection && !data.features.image_processing) {
                imageUploadSection.style.display = 'none';
            }
        }
    } catch (error) {
        console.error("无法获取功能开关状态:", error);
    }
}

if (window.location.pathname.endsWith('/') || window.location.pathname.endsWith('index.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        // 检查功能开关
        checkFeatureFlags();

        const uploadIcon = document.getElementById('image-upload-icon');
        const imageImporter = document.getElementById('image-importer');

        if (uploadIcon && imageImporter) {
            uploadIcon.addEventListener('click', () => imageImporter.click());
            imageImporter.addEventListener('change', handleFileSelection);
        }
    });
}


// =================================================================================
// 冲突检测逻辑
// =================================================================================
function detectConflicts(courses) {
    const calendar = new Map(); // 使用 Map 存储更详细的冲突信息
    const conflicts = new Map(); // 存储课程间的冲突关系

    // 辅助函数：解析周数，支持 "1-16"、"1,3,5"、"1-8(单)" 等格式
    function parseWeeks(weeksStr) {
        if (!weeksStr || typeof weeksStr !== 'string') return [];
        const weeks = new Set();
        weeksStr.split(',').forEach(part => {
            const singleMatch = part.match(/(\d+)-(\d+)\(单\)/);
            const doubleMatch = part.match(/(\d+)-(\d+)\(双\)/);
            const rangeMatch = part.match(/(\d+)-(\d+)/);

            if (singleMatch) {
                const start = parseInt(singleMatch[1]);
                const end = parseInt(singleMatch[2]);
                for (let i = start; i <= end; i++) if (i % 2 !== 0) weeks.add(i);
            } else if (doubleMatch) {
                const start = parseInt(doubleMatch[1]);
                const end = parseInt(doubleMatch[2]);
                for (let i = start; i <= end; i++) if (i % 2 === 0) weeks.add(i);
            } else if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                for (let i = start; i <= end; i++) weeks.add(i);
            } else if (!isNaN(parseInt(part))) {
                weeks.add(parseInt(part));
            }
        });
        return Array.from(weeks);
    }

    courses.forEach(course => {
        if (!course.schedules) return;
        course.schedules.forEach(schedule => {
            const weeks = parseWeeks(schedule.weeks);
            const day = schedule.day;
            const timeParts = schedule.time_slot.split('-').map(Number);
            
            if (weeks.length > 0 && day && timeParts.length === 2) {
                for (let week = weeks[0]; week <= weeks[weeks.length-1]; week++) {
                    if (!weeks.includes(week)) continue; // 跳过不连续的周
                    for (let slot = timeParts[0]; slot <= timeParts[1]; slot++) {
                        const key = `${week}-${day}-${slot}`;
                        if (calendar.has(key)) {
                            const existingCourse = calendar.get(key);
                            // 避免同一课程的内部冲突（比如一个课程在同一时间有多个地点）
                            if (existingCourse.name !== course.name) {
                                // 记录冲突对
                                const pair1 = `${existingCourse.name}|${course.name}`;
                                const pair2 = `${course.name}|${existingCourse.name}`;
                                if (!conflicts.has(pair1) && !conflicts.has(pair2)) {
                                    conflicts.set(pair1, true);
                                }
                            }
                        } else {
                            calendar.set(key, { name: course.name });
                        }
                    }
                }
            }
        });
    });

    if (conflicts.size > 0) {
        let message = "检测到以下课程存在时间冲突，请进入编辑页面进行调整：\n\n";
        conflicts.forEach((_, pair) => {
            const [courseA, courseB] = pair.split('|');
            message += `- '${courseA}' 与 '${courseB}'\n`;
        });
        return { hasConflict: true, message: message };
    }

    return { hasConflict: false };
}


// =================================================================================
// 辅助函数和旧有功能
// =================================================================================

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

    const weeks = new Set();
    weeksStr.split(',').forEach(part => {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            const stepMatch = part.match(/\(单\)/) ? 2 : (part.match(/\(双\)/) ? 2 : 1);
            const offset = (part.match(/\(单\)/) && start % 2 === 0) ? 1 : ((part.match(/\(双\)/) && start % 2 !== 0) ? 1 : 0);
            
            for (let i = start + offset; i <= end; i += stepMatch) {
                weeks.add(i);
            }
        } else {
            weeks.add(Number(part));
        }
    });
    return Array.from(weeks).sort((a, b) => a - b);
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

// --- 课程表导出为图片 ---

// 辅助函数：判断周数的奇偶性
function getWeekType(weeks) {
    if (weeks.length === 0) return 'none';
    const isAllOdd = weeks.every(w => w % 2 !== 0);
    const isAllEven = weeks.every(w => w % 2 === 0);
    if (isAllOdd) return 'single';
    if (isAllEven) return 'double';
    return 'all'; // 包含单双周的常规课程
}

// 辅助函数：格式化周数显示
function formatWeeks(weeks) {
    if (!weeks || weeks.length === 0) return '';

    const sortedWeeks = [...weeks].sort((a, b) => a - b);
    if (sortedWeeks.length === 1) return `${sortedWeeks[0]}周`;

    const type = getWeekType(sortedWeeks);

    // 策略1：处理纯单周或纯双周的情况
    if (type === 'single' || type === 'double') {
        const step = 2;
        const suffix = type === 'single' ? '单周' : '双周';
        const ranges = [];
        let start = sortedWeeks[0];

        for (let i = 1; i < sortedWeeks.length; i++) {
            if (sortedWeeks[i] - sortedWeeks[i-1] !== step) {
                let end = sortedWeeks[i-1];
                ranges.push(start === end ? `${start}` : `${start}-${end}`);
                start = sortedWeeks[i];
            }
        }
        ranges.push(start === sortedWeeks[sortedWeeks.length-1] ? `${start}` : `${start}-${sortedWeeks[sortedWeeks.length-1]}`);
        return `${ranges.join(',')}${suffix}`;
    }

    // 策略2：处理混合周或普通周的情况（步长为1）
    const ranges = [];
    let start = sortedWeeks[0];
    for (let i = 1; i < sortedWeeks.length; i++) {
        if (sortedWeeks[i] !== sortedWeeks[i-1] + 1) {
            let end = sortedWeeks[i-1];
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = sortedWeeks[i];
        }
    }
    ranges.push(start === sortedWeeks[sortedWeeks.length-1] ? `${start}` : `${start}-${sortedWeeks[sortedWeeks.length-1]}`);
    return `${ranges.join(',')}周`;
}


async function generateScheduleImage(title, isFullSchedule) {
    const storedCourses = localStorage.getItem('courses');
    const storedTimeConfig = localStorage.getItem('timeConfig');
    const storedStartDate = localStorage.getItem('startDate');

    if (!storedCourses || !storedTimeConfig || !storedStartDate) {
        showToast("错误：缺少课程数据，无法生成图片。");
        return;
    }

    showToast("正在生成课程表图片，请稍候...");

    // 强制亮色模式截图
    const isDarkMode = document.documentElement.classList.contains('dark');
    if (isDarkMode) {
        document.documentElement.classList.remove('dark');
    }

    const courses = JSON.parse(storedCourses);
    const timeConfig = JSON.parse(storedTimeConfig);
    const startDate = new Date(storedStartDate);
    const now = new Date();
    const currentWeek = Math.floor((now - startDate) / (1000 * 60 * 60 * 24 * 7)) + 1;

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '1200px';
    container.style.padding = '20px';
    container.style.background = 'linear-gradient(135deg, #e0f7fa, #f8f9fa)'; // 淡蓝色渐变背景
    container.style.fontFamily = 'sans-serif';
    document.body.appendChild(container);

    const table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gridTemplateColumns = '80px repeat(7, 1fr)';
    table.style.border = '1px solid #ddd';
    table.style.gridGap = '1px';
    table.style.backgroundColor = '#ddd';

    const days = ['时间', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    days.forEach(day => {
        const headerCell = document.createElement('div');
        headerCell.textContent = day;
        headerCell.style.padding = '10px';
        headerCell.style.fontWeight = 'bold';
        headerCell.style.textAlign = 'center';
        headerCell.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
        table.appendChild(headerCell);
    });

    const maxSlots = timeConfig.time_slots.length;
    const courseGrid = Array.from({ length: maxSlots }, () => 
        Array.from({ length: 7 }, () => ({ single: null, double: null, all: null, occupied: new Set() }))
    );
    
    const colors = ['#FADADD', '#D4E4F7', '#D5F0D4', '#FBF0D5', '#E6D4F7', '#F7D4D4', '#D4F7F7'];
    let colorIndex = 0;

    courses.forEach(course => {
        course.schedules.forEach(schedule => {
            const weeks = parseWeeks(schedule.weeks);
            if (isFullSchedule || weeks.includes(currentWeek)) {
                const dayIndex = parseInt(schedule.day, 10) - 1;
                if (dayIndex < 0 || dayIndex >= 7) return;

                const weekType = getWeekType(weeks);
                const timeParts = schedule.time_slot.split('-').map(Number);
                const startSlot = timeParts[0] - 1;
                const endSlot = timeParts[1] - 1;
                const duration = endSlot - startSlot + 1;

                const courseData = {
                    name: course.name.replace(/（/g, '(').replace(/）/g, ')'), // 修复括号
                    teachers: course.teachers.join(', '),
                    location: `${schedule.building} ${schedule.classroom}`,
                    weeks: formatWeeks(weeks), // 使用新的格式化函数
                    duration: duration,
                    color: colors[colorIndex % colors.length]
                };

                if (courseGrid[startSlot][dayIndex][weekType] === null) {
                    courseGrid[startSlot][dayIndex][weekType] = courseData;
                    for (let i = 1; i < duration; i++) {
                        if (startSlot + i < maxSlots) {
                            courseGrid[startSlot + i][dayIndex].occupied.add(weekType);
                        }
                    }
                    colorIndex++;
                }
            }
        });
    });

    for (let i = 0; i < maxSlots; i++) {
        const timeCell = document.createElement('div');
        timeCell.innerHTML = `
            <div style="font-weight: bold;">第${timeConfig.time_slots[i].section}节</div>
            <div style="font-size: 12px;">${timeConfig.time_slots[i].start}-${timeConfig.time_slots[i].end}</div>
        `;
        timeCell.style.padding = '5px';
        timeCell.style.textAlign = 'center';
        timeCell.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
        timeCell.style.fontSize = '14px';
        table.appendChild(timeCell);

        for (let j = 0; j < 7; j++) {
            const cellData = courseGrid[i][j];
            
            if (cellData.occupied.has('all') || (cellData.occupied.has('single') && cellData.occupied.has('double'))) continue;
            if (isFullSchedule && cellData.occupied.has('single') && !cellData.single) continue;
            if (isFullSchedule && cellData.occupied.has('double') && !cellData.double) continue;
            if (!isFullSchedule && cellData.occupied.size > 0) continue;

            const gridCell = document.createElement('div');
            gridCell.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
            gridCell.style.border = '1px solid #ddd';
            gridCell.style.display = 'flex';
            gridCell.style.padding = '0';
            gridCell.style.overflow = 'hidden';
            gridCell.style.justifyContent = 'center';
            gridCell.style.alignItems = 'center';

            const singleCourse = cellData.single;
            const doubleCourse = cellData.double;
            const allWeekCourse = cellData.all;

            if (isFullSchedule) {
                if (allWeekCourse) {
                    gridCell.style.gridRow = `span ${allWeekCourse.duration}`;
                    gridCell.appendChild(createCourseHTML(allWeekCourse, true));
                    gridCell.style.backgroundColor = allWeekCourse.color;
                } else {
                    let hasContent = false;
                    const duration = singleCourse ? singleCourse.duration : (doubleCourse ? doubleCourse.duration : 1);
                    gridCell.style.gridRow = `span ${duration}`;

                    if (singleCourse) {
                        const subCell = createCourseHTML(singleCourse, true);
                        subCell.style.width = doubleCourse ? '50%' : '100%';
                        subCell.style.backgroundColor = singleCourse.color;
                        subCell.style.borderRight = doubleCourse ? '1px solid #ddd' : 'none';
                        gridCell.appendChild(subCell);
                        hasContent = true;
                    }
                    if (doubleCourse) {
                        const subCell = createCourseHTML(doubleCourse, true);
                        subCell.style.width = singleCourse ? '50%' : '100%';
                        subCell.style.backgroundColor = doubleCourse.color;
                        // 强制居中
                        subCell.style.display = 'flex';
                        subCell.style.justifyContent = 'center';
                        subCell.style.alignItems = 'center';
                        gridCell.appendChild(subCell);
                        hasContent = true;
                    }
                    if (!hasContent) {
                        gridCell.innerHTML = '&nbsp;';
                    }
                }
            } else { // 本周课表逻辑
                const weekIsOdd = currentWeek % 2 !== 0;
                const courseToShow = allWeekCourse || (weekIsOdd ? singleCourse : doubleCourse);
                if (courseToShow) {
                    gridCell.style.gridRow = `span ${courseToShow.duration}`;
                    gridCell.appendChild(createCourseHTML(courseToShow, false));
                    gridCell.style.backgroundColor = courseToShow.color;
                } else {
                    gridCell.innerHTML = '&nbsp;';
                }
            }
            
            table.appendChild(gridCell);
        }
    }
    
    function createCourseHTML(course, showWeeks) {
        const div = document.createElement('div');
        div.style.padding = '8px';
        div.style.fontSize = '12px';
        div.style.height = '100%';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.textAlign = 'center';
        div.style.lineHeight = '1.4';
        
        div.innerHTML = `
            <div style="font-weight: bold;">${course.name}</div>
            <div>${course.teachers}</div>
            <div>@ ${course.location}</div>
            ${showWeeks ? `<div style="margin-top: 4px; font-size: 11px;">${course.weeks}</div>` : ''}
        `;
        return div;
    }

    container.appendChild(table);

    // --- 添加包含GitHub信息和二维码的页脚 ---
    const footer = document.createElement('div');
    footer.id = 'image-footer';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.marginTop = '20px';
    footer.style.paddingTop = '10px';
footer.style.borderTop = '1px solid #ddd';

    const githubInfo = document.createElement('div');
    githubInfo.style.display = 'flex';
    githubInfo.style.alignItems = 'center';
    githubInfo.style.fontSize = '14px';
githubInfo.style.color = '#555';
    githubInfo.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" style="margin-right: 8px;" viewBox="0 0 16 16">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span>如果喜欢本项目请 Star: github.com/fangguan233/next_class</span>
    `;

    const qrcodeContainer = document.createElement('div');
    qrcodeContainer.id = 'image-qrcode';
    
    footer.appendChild(githubInfo);
    footer.appendChild(qrcodeContainer);
    container.appendChild(footer);

    // 生成二维码
    new QRCode(qrcodeContainer, {
        text: window.location.href,
        width: 80,
        height: 80,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // 使用微小的延迟确保二维码渲染完成
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            backgroundColor: null // 使用容器的背景
        });

        const finalCanvas = document.createElement('canvas');
        const ctx = finalCanvas.getContext('2d');
        const titleHeight = 80;
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height + titleHeight;

        // 绘制背景渐变
        const gradient = ctx.createLinearGradient(0, 0, 0, finalCanvas.height);
        gradient.addColorStop(0, '#e0f7fa');
        gradient.addColorStop(1, '#f8f9fa');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        // 绘制标题
        ctx.fillStyle = 'black';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, finalCanvas.width / 2, titleHeight / 2 + 15);
        
        // 绘制课程表内容 (包含页脚)
        ctx.drawImage(canvas, 0, titleHeight);

        const link = document.createElement('a');
        link.download = `${title}.png`;
        link.href = finalCanvas.toDataURL('image/png');
        link.click();
        
        showToast("图片已开始下载！");

    } catch (error) {
        console.error('生成图片失败:', error);
        showToast("错误：生成图片失败，请检查控制台。");
    } finally {
        document.body.removeChild(container);
        // 恢复暗色模式
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
}
    }
}
