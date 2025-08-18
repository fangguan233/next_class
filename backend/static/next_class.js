// 页面加载时自动执行
document.addEventListener('DOMContentLoaded', function() {
    // The anti-flicker script in the HTML head now handles the initial theme.

    // 显示下一节课和本周课程表
    displayNextClass();
    initializeCustomWeekSelector(); // 使用新的自定义周数选择器
    initializeWeather(); // 新增：初始化天气功能
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


// 显示下一节课信息
function displayNextClass() {
    const storedCourses = localStorage.getItem('courses');
    if (!storedCourses) {
        document.getElementById('result').innerHTML = `<p class="text-red-500">错误：未找到课程数据，请先返回主页导入。</p>`;
        return;
    }

    try {
        const courses = JSON.parse(storedCourses);
        const nextClass = findNextClass(courses);
        const resultDiv = document.getElementById('result');

        if (nextClass) {
            let timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
            if (!timeConfig || !timeConfig.time_slots) timeConfig = { time_slots: [] }; // Fallback

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

            resultDiv.innerHTML = `
                ${notice}
                <h2 class="text-2xl font-bold text-light-accent dark:text-dark-accent mb-2">${nextClass.courseName}</h2>
                <p class="text-lg"><strong>时间:</strong> 周${dayOfWeek} ${startTime} - ${endTime}</p>
                <p class="text-lg"><strong>地点:</strong> ${nextClass.campus} ${nextClass.building} ${nextClass.classroom}</p>
                <p class="text-lg"><strong>教师:</strong> ${nextClass.teachers.join(', ')}</p>
            `;
        } else {
            resultDiv.innerHTML = `<p class="text-xl font-semibold">本周和下周都没有课了 🎉</p>`;
        }
    } catch (error) {
        console.error("解析或显示课程数据时出错:", error);
        document.getElementById('result').innerHTML = `<p class="text-red-500">错误：课程数据格式不正确。</p>`;
    }
}

// 新增：初始化自定义周数选择器
function initializeCustomWeekSelector() {
    const storedCourses = localStorage.getItem('courses');
    const storedStartDate = localStorage.getItem('startDate');
    if (!storedCourses || !storedStartDate) return;

    const courses = JSON.parse(storedCourses);
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
    const storedCourses = localStorage.getItem('courses');
    if (!storedCourses) return;

    try {
        const courses = JSON.parse(storedCourses);
        const scheduleTitle = document.getElementById('schedule-title');
        const scheduleDiv = document.getElementById('weekly-schedule');
        
        scheduleTitle.textContent = `第 ${weekNumber} 周课程表`;
        scheduleDiv.innerHTML = ''; // 清空旧的课程表

        let timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
        if (!timeConfig || !timeConfig.time_slots) timeConfig = { time_slots: [] }; // Fallback
        const days = ['一', '二', '三', '四', '五', '六', '日'];
        let weekHasClasses = false;

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

            if (dayClasses.length > 0) {
                weekHasClasses = true;
                dayClasses.sort((a, b) => getTimeInMinutes(a.time_slot.split('-')[0]) - getTimeInMinutes(b.time_slot.split('-')[0]));

                let dayHtml = `<div class="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg transition-shadow duration-200 hover:shadow-lg">
                                 <h4 class="font-bold text-lg mb-2">周${days[i-1]}</h4>`;
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
            scheduleDiv.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400">第 ${weekNumber} 周没有课程安排。</p>`;
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
