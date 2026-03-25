// 页面加载时自动执行
const DAY_CHAR_TO_NUM = {
    '一': 1,
    '二': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '日': 7,
    '天': 7,
    '七': 7
};

const DAY_ENGLISH_TO_NUM = {
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    weds: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
    sun: 7,
    sunday: 7
};

function dedupeIntsKeepOrder(values) {
    const seen = new Set();
    const out = [];
    values.forEach(v => {
        if (seen.has(v)) return;
        seen.add(v);
        out.push(v);
    });
    return out;
}

function parseDayToken(token) {
    if (token === null || token === undefined) return null;
    const raw = String(token).trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (DAY_ENGLISH_TO_NUM[lower]) return DAY_ENGLISH_TO_NUM[lower];
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 1 && num <= 7) return num;
    let normalized = raw.replace(/星期|周|礼拜|週/g, '').trim();
    const num2 = Number(normalized);
    if (Number.isFinite(num2) && num2 >= 1 && num2 <= 7) return num2;
    if (DAY_CHAR_TO_NUM[normalized]) return DAY_CHAR_TO_NUM[normalized];
    return null;
}

function expandScheduleDays(dayValue) {
    if (dayValue === null || dayValue === undefined) return [];
    if (Array.isArray(dayValue)) {
        const expanded = [];
        dayValue.forEach(item => expanded.push(...expandScheduleDays(item)));
        return dedupeIntsKeepOrder(expanded.filter(d => Number.isFinite(d) && d >= 1 && d <= 7));
    }

    const raw = String(dayValue).trim();
    if (!raw) return [];

    const compact = raw.replace(/\s+/g, '').replace(/，|、/g, ',');

    if (/(每天|每日|天天|全周|周一到周日|周一至周日|周一-周日|周一~周日)/.test(compact)) {
        return [1, 2, 3, 4, 5, 6, 7];
    }
    if (/(工作日|周一到周五|周一至周五|周一-周五|周一~周五)/.test(compact)) {
        return [1, 2, 3, 4, 5];
    }
    if (compact.includes('周末')) {
        return [6, 7];
    }

    const numericRange = compact.match(/^([1-7])(?:-|~|到|至)([1-7])$/);
    if (numericRange) {
        const start = Number(numericRange[1]);
        const end = Number(numericRange[2]);
        if (start <= end) return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        return [...Array.from({ length: 7 - start + 1 }, (_, i) => start + i), ...Array.from({ length: end }, (_, i) => i + 1)];
    }

    if (/(?:-|~|到|至)/.test(compact)) {
        const chars = compact.match(/[一二三四五六日天七]/g) || [];
        if (chars.length === 2) {
            const start = DAY_CHAR_TO_NUM[chars[0]];
            const end = DAY_CHAR_TO_NUM[chars[1]];
            if (start && end) {
                if (start <= end) return Array.from({ length: end - start + 1 }, (_, i) => start + i);
                return [...Array.from({ length: 7 - start + 1 }, (_, i) => start + i), ...Array.from({ length: end }, (_, i) => i + 1)];
            }
        }
    }

    if (compact.includes(',')) {
        const parts = compact.split(',').filter(Boolean);
        const expanded = [];
        parts.forEach(part => {
            const parsed = parseDayToken(part);
            if (parsed) {
                expanded.push(parsed);
                return;
            }
            const chars = part.match(/[一二三四五六日天七]/g) || [];
            chars.forEach(ch => {
                const mapped = DAY_CHAR_TO_NUM[ch];
                if (mapped) expanded.push(mapped);
            });
        });
        return dedupeIntsKeepOrder(expanded.filter(d => Number.isFinite(d) && d >= 1 && d <= 7));
    }

    const compactChars = compact.match(/[一二三四五六日天七]/g) || [];
    if (compactChars.length) {
        const expanded = compactChars.map(ch => DAY_CHAR_TO_NUM[ch]).filter(Boolean);
        return dedupeIntsKeepOrder(expanded.filter(d => Number.isFinite(d) && d >= 1 && d <= 7));
    }

    const parsed = parseDayToken(compact);
    return parsed ? [parsed] : [];
}

function normalizeScheduleEntries(schedule) {
    if (!schedule || typeof schedule !== 'object') return { entries: [], changed: false };

    const base = {
        weeks: "",
        time_slot: "1-2",
        campus: "",
        building: "",
        classroom: "",
        ...schedule
    };

    let dayValue;
    if (Object.prototype.hasOwnProperty.call(schedule, 'day')) {
        dayValue = schedule.day;
    } else if (Object.prototype.hasOwnProperty.call(schedule, 'days')) {
        dayValue = schedule.days;
    } else {
        dayValue = "1";
    }

    const days = expandScheduleDays(dayValue);
    if (!days.length) {
        const fallbackDay = dayValue === null || dayValue === undefined ? "" : String(dayValue).trim();
        return { entries: [{ ...base, day: fallbackDay }], changed: false };
    }

    const entries = days.map(day => ({ ...base, day: String(day) }));
    let changed = Array.isArray(dayValue) || days.length !== 1;
    if (!changed) {
        const rawDay = dayValue === null || dayValue === undefined ? "" : String(dayValue).trim();
        if (rawDay !== String(days[0])) changed = true;
    }
    return { entries, changed };
}

function normalizeCourses(rawCourses) {
    if (!Array.isArray(rawCourses)) return { courses: [], changed: false };
    let changed = false;
    const normalized = rawCourses.map(course => {
        const scheduleList = Array.isArray(course?.schedules) ? course.schedules : [];
        let expanded = [];
        scheduleList.forEach(s => {
            const result = normalizeScheduleEntries(s);
            if (result.changed) changed = true;
            if (result.entries.length) expanded = expanded.concat(result.entries);
        });
        const seen = new Set();
        const unique = expanded.filter(item => {
            const key = `${item.weeks}|${item.day}|${item.time_slot}|${item.campus}|${item.building}|${item.classroom}`;
            if (seen.has(key)) {
                changed = true;
                return false;
            }
            seen.add(key);
            return true;
        });
        if (unique.length !== scheduleList.length) changed = true;
        return { ...course, schedules: unique };
    });
    return { courses: normalized, changed };
}

function getNormalizedCourses() {
    const storedCourses = localStorage.getItem('courses');
    const rawCourses = storedCourses ? JSON.parse(storedCourses) : [];
    const result = normalizeCourses(rawCourses);
    if (result.changed) {
        localStorage.setItem('courses', JSON.stringify(result.courses));
    }
    return result.courses;
}

document.addEventListener('DOMContentLoaded', function() {
    // The anti-flicker script in the HTML head now handles the initial theme.

    // 显示下一节课和本周课程表
    displayNextClass();
    initializeCustomWeekSelector(); // 使用新的自定义周数选择器
    initializeWeather(); // 新增：初始化天气功能
    displayIcpLicense(); // 显示ICP备案号
});

// --- 天气功能 ---

let currentLocation = '116.41,39.92'; // 默认北京

function initializeWeather() {
    const hourlyBtn = document.getElementById('hourly-btn');
    const dailyBtn = document.getElementById('daily-btn');
    const weatherContent = document.getElementById('weather-content');
    let currentView = localStorage.getItem('weatherView') || 'hourly'; // 从本地存储读取状态

    const checkWidthAndApplyLayout = () => {
        const isNarrow = window.innerWidth < 420; // 设定一个阈值，例如420px
        if (currentView === 'daily' && !isNarrow) {
            weatherContent.classList.add('justify-center');
        } else {
            weatherContent.classList.remove('justify-center');
        }
    };

    const updateButtonsAndLayout = () => {
        if (currentView === 'hourly') {
            hourlyBtn.classList.add('bg-light-btn', 'text-white');
            hourlyBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600');
            dailyBtn.classList.remove('bg-light-btn', 'text-white');
            dailyBtn.classList.add('bg-gray-300', 'dark:bg-gray-600');
        } else {
            dailyBtn.classList.add('bg-light-btn', 'text-white');
            dailyBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600');
            hourlyBtn.classList.remove('bg-light-btn', 'text-white');
            hourlyBtn.classList.add('bg-gray-300', 'dark:bg-gray-600');
        }
        checkWidthAndApplyLayout(); // 每次更新按钮时都检查布局
    };

    const fetchAndRender = () => {
        if (currentView === 'hourly') {
            getHourlyWeather(currentLocation);
        } else {
            getDailyWeather(currentLocation);
        }
    };

    hourlyBtn.addEventListener('click', () => {
        if (currentView !== 'hourly') {
            currentView = 'hourly';
            localStorage.setItem('weatherView', currentView); // 保存状态
            updateButtonsAndLayout();
            fetchAndRender();
        }
    });

    dailyBtn.addEventListener('click', () => {
        if (currentView !== 'daily') {
            currentView = 'daily';
            localStorage.setItem('weatherView', currentView); // 保存状态
            updateButtonsAndLayout();
            fetchAndRender();
        }
    });

    // 初始化
    updateButtonsAndLayout(); // 根据存储的状态更新按钮和布局

    window.addEventListener('resize', checkWidthAndApplyLayout); // 监听窗口大小变化

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { longitude, latitude } = position.coords;
                currentLocation = `${longitude.toFixed(2)},${latitude.toFixed(2)}`;
                fetchAndRender();
            },
            (error) => {
                console.warn('获取地理位置失败，使用默认位置。', error.message);
                fetchAndRender();
            }
        );
    } else {
        console.warn('浏览器不支持地理位置，使用默认位置。');
        fetchAndRender();
    }
}

async function getHourlyWeather(location) {
    const weatherContainer = document.getElementById('weather-container');
    const weatherContent = document.getElementById('weather-content');

    const renderError = (message) => {
        weatherContent.innerHTML = `<p class="text-red-500">${message}</p>`;
        weatherContainer.classList.remove('hidden');
    };

    const render = (hourlyData) => {
        const now = new Date();
        const futureHourlyData = hourlyData.filter(hour => new Date(hour.fxTime) > now);

        if (futureHourlyData.length === 0) {
            renderError("当前无未来24小时天气预报数据。");
            return;
        }

        weatherContent.innerHTML = '';
        futureHourlyData.forEach(hour => {
            const d = new Date(hour.fxTime);
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const time = d.getHours() + ':00';
            const displayTime = `${month}/${day} ${time}`;
            const card = `
                <div class="flex-shrink-0 w-28 text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg transition-transform duration-200 ease-in-out hover:scale-105">
                    <p class="text-sm font-medium">${displayTime}</p>
                    <img src="https://icons.qweather.com/assets/icons/${hour.icon}.svg" alt="${hour.text}" class="w-10 h-10 mx-auto my-1 weather-icon">
                    <p class="text-lg font-bold">${hour.temp}°C</p>
                    <p class="text-xs">${hour.text}</p>
                </div>
            `;
            weatherContent.innerHTML += card;
        });
        weatherContainer.classList.remove('hidden');
    };

    try {
        const apiKey = "921d41d032274310ab1fe3c774dcff13";
        const url = `https://devapi.qweather.com/v7/grid-weather/24h?location=${location}&key=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`天气服务响应错误 (HTTP ${response.status})`);
        
        const data = await response.json();
        if (data.code !== "200") throw new Error(`API错误: ${data.code}`);
        
        render(data.hourly);

    } catch (error) {
        console.error('获取每小时天气失败:', error);
        renderError('无法获取每小时天气数据。');
    }
}

async function getDailyWeather(location) {
    const weatherContainer = document.getElementById('weather-container');
    const weatherContent = document.getElementById('weather-content');

    const renderError = (message) => {
        weatherContent.innerHTML = `<p class="text-red-500">${message}</p>`;
        weatherContainer.classList.remove('hidden');
    };

    const render = (dailyData) => {
        weatherContent.innerHTML = '';
        dailyData.forEach(day => {
            const d = new Date(day.fxDate);
            const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
            const card = `
                <div class="flex-shrink-0 w-32 text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg transition-transform duration-200 ease-in-out hover:scale-105">
                    <p class="text-sm font-medium">${day.fxDate.substring(5)} (${dayOfWeek})</p>
                    <img src="https://icons.qweather.com/assets/icons/${day.iconDay}.svg" alt="${day.textDay}" class="w-10 h-10 mx-auto my-1 weather-icon">
                    <p class="text-lg font-bold">${day.tempMin}° / ${day.tempMax}°C</p>
                    <p class="text-xs">${day.textDay}</p>
                </div>
            `;
            weatherContent.innerHTML += card;
        });
        weatherContainer.classList.remove('hidden');
    };

    try {
        const apiKey = "921d41d032274310ab1fe3c774dcff13";
        const url = `https://devapi.qweather.com/v7/weather/3d?location=${location}&key=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`天气服务响应错误 (HTTP ${response.status})`);
        
        const data = await response.json();
        if (data.code !== "200") throw new Error(`API错误: ${data.code}`);
        
        render(data.daily);

    } catch (error) {
        console.error('获取每日天气失败:', error);
        renderError('无法获取每日天气数据。');
    }
}

// 找到下一节课
function findNextClass(courses) {
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // 将周日(0)映射为7
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const storedStartDate = localStorage.getItem('startDate');
    if (!storedStartDate) {
        console.error("未找到开学日期");
        return null;
    }
    const startDate = new Date(storedStartDate);
    const timeDiff = now - startDate;
    const currentWeek = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 7)) + 1;

    let allClasses = [];
    courses.forEach(course => {
        course.schedules.forEach(schedule => {
            const weeks = parseWeeks(schedule.weeks);
            if (weeks.includes(currentWeek)) {
                allClasses.push({
                    ...schedule,
                    courseName: course.name,
                    teachers: course.teachers
                });
            }
        });
    });

    // 筛选出今天及以后的课程
    const futureClasses = allClasses.filter(cls => {
        const classDay = parseInt(cls.day, 10);
        const startTime = getTimeInMinutes(cls.time_slot.split('-')[0]);
        return classDay > currentDay || (classDay === currentDay && startTime > currentTime);
    });

    // 如果今天还有课，按时间排序
    if (futureClasses.length > 0) {
        futureClasses.sort((a, b) => {
            const dayA = parseInt(a.day, 10);
            const dayB = parseInt(b.day, 10);
            if (dayA !== dayB) {
                return dayA - dayB;
            }
            const timeA = getTimeInMinutes(a.time_slot.split('-')[0]);
            const timeB = getTimeInMinutes(b.time_slot.split('-')[0]);
            return timeA - timeB;
        });
        return futureClasses[0];
    }

    // 如果今天没课了，找下一周的课
    let nextWeekClasses = [];
    courses.forEach(course => {
        course.schedules.forEach(schedule => {
            const weeks = parseWeeks(schedule.weeks);
            if (weeks.includes(currentWeek + 1)) {
                nextWeekClasses.push({
                    ...schedule,
                    courseName: course.name,
                    teachers: course.teachers
                });
            }
        });
    });

    if (nextWeekClasses.length > 0) {
        nextWeekClasses.sort((a, b) => {
            const dayA = parseInt(a.day, 10);
            const dayB = parseInt(b.day, 10);
            if (dayA !== dayB) {
                return dayA - dayB;
            }
            const timeA = getTimeInMinutes(a.time_slot.split('-')[0]);
            const timeB = getTimeInMinutes(b.time_slot.split('-')[0]);
            return timeA - timeB;
        });
        return { ...nextWeekClasses[0], isNextWeek: true };
    }

    return null;
}

function parseExamDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dt = new Date(`${dateStr}T${timeStr}`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
}

function isExamExpired(exam) {
    const end = parseExamDateTime(exam?.date, exam?.endTime);
    if (!end) return false;
    return Date.now() > end.getTime() + 24 * 60 * 60 * 1000;
}

function isExamHidden(exam) {
    return !!exam?.hidden || isExamExpired(exam);
}

const EXAM_VISIBLE_LEAD_DAYS = 14;

function isExamWithinDisplayWindow(exam) {
    const start = parseExamDateTime(exam?.date, exam?.startTime);
    if (!start) return false;
    const diffMs = start.getTime() - Date.now();
    return diffMs <= EXAM_VISIBLE_LEAD_DAYS * 24 * 60 * 60 * 1000;
}

function getVisibleExams() {
    const storedExams = localStorage.getItem('exams');
    const exams = storedExams ? JSON.parse(storedExams) : [];
    if (!Array.isArray(exams)) return [];
    return exams.filter(e => !isExamHidden(e) && isExamWithinDisplayWindow(e));
}

function getActiveExams() {
    const storedExams = localStorage.getItem('exams');
    const exams = storedExams ? JSON.parse(storedExams) : [];
    if (!Array.isArray(exams)) return [];
    return exams.filter(e => !isExamHidden(e));
}

function findNextExam(exams) {
    const now = new Date();
    const candidates = [];
    exams.forEach(exam => {
        const start = parseExamDateTime(exam.date, exam.startTime);
        const end = parseExamDateTime(exam.date, exam.endTime);
        if (!start || !end) return;
        const isOngoing = now >= start && now <= end;
        const isUpcoming = start >= now;
        if (isOngoing || isUpcoming) {
            candidates.push({ ...exam, start, end, isOngoing });
        }
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.start - b.start);
    return candidates[0];
}


// 显示下一节课信息
function displayNextClass() {
    try {
        const courses = getNormalizedCourses();
        const nextClass = findNextClass(courses);
        const exams = getVisibleExams();
        const nextExam = findNextExam(exams);
        const resultDiv = document.getElementById('result');

        if (nextClass || nextExam) {
            let timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
            if (!timeConfig || !timeConfig.time_slots) timeConfig = { time_slots: [] }; // Fallback

            let examHtml = '';
            if (nextExam) {
                const courseName = nextExam.courseId != null
                    ? (courses.find(c => c.id === nextExam.courseId)?.name || `课程 #${nextExam.courseId}`)
                    : '不关联课程';
                const statusText = nextExam.isOngoing ? '正在进行' : '即将开始';
                examHtml = `
                    <div class="mb-4 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-left">
                        <div class="text-xs text-yellow-700 dark:text-yellow-200 mb-1">${statusText}</div>
                        <div class="text-lg font-semibold text-yellow-900 dark:text-yellow-100">${nextExam.title || '考试'}</div>
                        <div class="text-sm text-yellow-800 dark:text-yellow-200 mt-1">${nextExam.date} ${nextExam.startTime}-${nextExam.endTime}</div>
                        <div class="text-sm text-yellow-800 dark:text-yellow-200">地点：${nextExam.location || '未填写'}</div>
                        <div class="text-xs text-yellow-700 dark:text-yellow-200">关联：${courseName}</div>
                    </div>
                `;
            }

            let classHtml = '';
            if (nextClass) {
                const timeSlot = nextClass.time_slot.split('-').map(Number);
                const startSlot = timeConfig.time_slots[timeSlot[0] - 1];
                const endSlot = timeConfig.time_slots[timeSlot[1] - 1];

                const startTime = startSlot ? startSlot.start : '未知';
                const endTime = endSlot ? endSlot.end : '未知';
                const dayOfWeek = ['一', '二', '三', '四', '五', '六', '日'][nextClass.day - 1];

                let notice = '';
                if (nextClass.isNextWeek) {
                    notice = `<p class="text-sm text-gray-500 dark:text-gray-400 mb-2">(下周)</p>`;
                }

                classHtml = `
                    ${notice}
                    <h2 class="text-2xl font-bold text-light-accent dark:text-dark-accent mb-2">${nextClass.courseName}</h2>
                    <p class="text-lg"><strong>时间:</strong> 周${dayOfWeek} ${startTime} - ${endTime}</p>
                    <p class="text-lg"><strong>地点:</strong> ${nextClass.campus} ${nextClass.building} ${nextClass.classroom}</p>
                    <p class="text-lg"><strong>教师:</strong> ${nextClass.teachers.join(', ')}</p>
                `;
            }

            resultDiv.innerHTML = examHtml + classHtml;
        } else {
            resultDiv.innerHTML = `<p class="text-xl font-semibold">本周和下周都没有课或考试了 🎉</p>`;
        }
    } catch (error) {
        console.error("解析或显示课程数据时出错:", error);
        document.getElementById('result').innerHTML = `<p class="text-red-500">错误：数据格式不正确。</p>`;
    }
}

// 新增：初始化自定义周数选择器
function initializeCustomWeekSelector() {
    const storedStartDate = localStorage.getItem('startDate');
    const courses = getNormalizedCourses();
    if (!courses.length || !storedStartDate) return;
    const startDate = new Date(storedStartDate);
    const now = new Date();
    const timeDiff = now - startDate;
    const currentWeek = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 7)) + 1;

    let maxWeek = 0;
    courses.forEach(course => {
        course.schedules.forEach(schedule => {
            const weeks = parseWeeks(schedule.weeks);
            const maxInSchedule = Math.max(...weeks);
            if (maxInSchedule > maxWeek) maxWeek = maxInSchedule;
        });
    });

    const input = document.getElementById('week-selector-input');
    const list = document.getElementById('week-selector-list');
    let selectedWeek = currentWeek;

    function updateInputValue() {
        input.value = `第 ${selectedWeek} 周${selectedWeek === currentWeek ? ' (本周)' : ''}`;
    }

    function populateList(filter = '') {
        list.innerHTML = '';
        for (let i = 1; i <= maxWeek; i++) {
            const weekText = `第 ${i} 周${i === currentWeek ? ' (本周)' : ''}`;
            if (weekText.includes(filter)) {
                const item = document.createElement('div');
                item.textContent = weekText;
                item.className = 'p-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700';
                if (i === selectedWeek) {
                    item.classList.add('bg-light-btn', 'text-white');
                }
                item.addEventListener('click', () => {
                    selectedWeek = i;
                    generateWeeklySchedule(selectedWeek);
                    updateInputValue();
                    hideList();
                });
                list.appendChild(item);
            }
        }
    }

    function showList() {
        list.classList.remove('hidden');
        setTimeout(() => list.classList.add('visible'), 10); // Delay to trigger transition
    }

    function hideList() {
        list.classList.remove('visible');
        // Wait for the transition to finish before hiding it completely
        list.addEventListener('transitionend', () => {
            list.classList.add('hidden');
        }, { once: true });
    }

    function toggleList() {
        if (list.classList.contains('hidden')) {
            populateList();
            showList();
        } else {
            hideList();
        }
    }

    input.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent the document click listener from firing immediately
        toggleList();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete')) {
            hideList();
        }
    });

    // Initial setup
    updateInputValue();
    generateWeeklySchedule(selectedWeek);
}

// 生成指定周的课程表
function generateWeeklySchedule(weekNumber) {
    try {
        const courses = getNormalizedCourses();
        const exams = getActiveExams();
        const storedStartDate = localStorage.getItem('startDate');
        const startDate = storedStartDate ? new Date(storedStartDate) : null;
        const scheduleTitle = document.getElementById('schedule-title');
        const scheduleDiv = document.getElementById('weekly-schedule');
        
        scheduleTitle.textContent = `第 ${weekNumber} 周日程`;
        scheduleDiv.innerHTML = ''; // 清空旧的课程表

        let timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
        if (!timeConfig || !timeConfig.time_slots) timeConfig = { time_slots: [] }; // Fallback
        const days = ['一', '二', '三', '四', '五', '六', '日'];
        let weekHasClasses = false;

        const examsByDay = new Map();
        if (startDate && !Number.isNaN(startDate.getTime())) {
            exams.forEach(exam => {
                const info = getWeekAndDayFromDate(exam.date, startDate);
                if (!info || info.week !== weekNumber) return;
                if (!examsByDay.has(info.day)) examsByDay.set(info.day, []);
                examsByDay.get(info.day).push(exam);
            });
        }

        for (let i = 1; i <= 7; i++) {
            let dayClasses = [];
            courses.forEach(course => {
                course.schedules.forEach(schedule => {
                    const weeks = parseWeeks(schedule.weeks);
                    if (parseInt(schedule.day) === i && weeks.includes(weekNumber)) {
                        dayClasses.push({
                            ...schedule,
                            courseName: course.name
                        });
                    }
                });
            });

            const dayExams = examsByDay.get(i) || [];
            if (dayClasses.length > 0 || dayExams.length > 0) {
                weekHasClasses = true;
                dayClasses.sort((a, b) => getTimeInMinutes(a.time_slot.split('-')[0]) - getTimeInMinutes(b.time_slot.split('-')[0]));
                dayExams.sort((a, b) => {
                    const aTime = parseExamDateTime(a.date, a.startTime);
                    const bTime = parseExamDateTime(b.date, b.startTime);
                    return (aTime || 0) - (bTime || 0);
                });

                let dayHtml = `<div class="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg transition-shadow duration-200 hover:shadow-lg">
                                 <h4 class="font-bold text-lg mb-2">周${days[i-1]}</h4>`;
                if (dayExams.length > 0) {
                    dayExams.forEach(exam => {
                        const courseName = exam.courseId != null
                            ? (courses.find(c => c.id === exam.courseId)?.name || `课程 #${exam.courseId}`)
                            : '不关联课程';
                        dayHtml += `<div class="ml-4 mb-3 p-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                                      <p class="font-semibold text-yellow-900 dark:text-yellow-100">${exam.title || '考试'}</p>
                                      <p class="text-sm text-yellow-800 dark:text-yellow-200">${exam.startTime || ''} - ${exam.endTime || ''} @ ${exam.location || '未填写'}</p>
                                      <p class="text-xs text-yellow-700 dark:text-yellow-200">关联：${courseName}</p>
                                    </div>`;
                    });
                }
                dayClasses.forEach(cls => {
                    const timeSlot = cls.time_slot.split('-').map(Number);
                    const startSlot = timeConfig.time_slots[timeSlot[0] - 1];
                    const endSlot = timeConfig.time_slots[timeSlot[1] - 1];
                    
                    const startTime = startSlot ? startSlot.start : '未知';
                    const endTime = endSlot ? endSlot.end : '未知';

                    dayHtml += `<div class="ml-4 mb-2">
                                  <p><strong>${cls.courseName}</strong></p>
                                  <p class="text-sm text-gray-600 dark:text-gray-400">${startTime} - ${endTime} @ ${cls.building} ${cls.classroom}</p>
                                </div>`;
                });
                dayHtml += `</div>`;
                scheduleDiv.innerHTML += dayHtml;
            }
        }

        if (!weekHasClasses) {
            scheduleDiv.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400">第 ${weekNumber} 周没有课程或考试安排。</p>`;
        }

    } catch (error) {
        console.error("生成周课程表时出错:", error);
    }
}


// --- 辅助函数 ---

// 解析 "1-16" 或 "1,3,5" 格式的周数
function parseWeeks(weeksStr) {
    const weeks = new Set();
    if (!weeksStr) return [];

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
    return Array.from(weeks);
}

function getWeekAndDayFromDate(dateStr, startDate) {
    if (!dateStr || !startDate) return null;
    const date = new Date(`${dateStr}T00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const diffMs = date - startDate;
    const week = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)) + 1;
    const day = date.getDay() === 0 ? 7 : date.getDay();
    if (!Number.isFinite(week) || week <= 0) return null;
    return { week, day };
}

// 将 "8:20" 格式的时间转换为分钟数
function getTimeInMinutes(timeStr) {
    let timeConfig = JSON.parse(localStorage.getItem('timeConfig'));

    // 如果 timeConfig 不存在，则创建并存储一个默认值
    if (!timeConfig || !timeConfig.time_slots) {
        console.warn("timeConfig not found in localStorage, using and storing default.");
        timeConfig = {
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
        localStorage.setItem('timeConfig', JSON.stringify(timeConfig));
    }

    const section = parseInt(timeStr, 10);
    const timeSlot = timeConfig.time_slots.find(slot => slot.section === section);
    
    if (!timeSlot) {
        console.error(`Could not find time slot for section: ${section}`);
        return 0; // 返回一个默认值以避免崩溃
    }

    const [hours, minutes] = timeSlot.start.split(':').map(Number);
    return hours * 60 + minutes;
}

// --- ICP备案号显示 ---
async function displayIcpLicense() {
    try {
        const response = await fetch('/api/site-info');
        if (!response.ok) return;
        const data = await response.json();
        if (data.success && data.icp_license) {
            const footerContainer = document.createElement('div');
            footerContainer.id = 'icp-container';
            footerContainer.className = 'fixed bottom-0 left-0 w-full text-center py-2 bg-gray-100 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 z-50';
            
            const link = document.createElement('a');
            link.href = 'https://beian.miit.gov.cn/';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = data.icp_license;
            link.className = 'hover:text-light-btn dark:hover:text-dark-accent';

            footerContainer.appendChild(link);
            document.body.appendChild(footerContainer);
        }
    } catch (error) {
        console.error("无法获取或显示ICP备案信息:", error);
    }
}
