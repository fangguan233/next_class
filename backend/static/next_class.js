// 页面加载时自动执行
document.addEventListener('DOMContentLoaded', function() {
    // 设置暗色/亮色模式
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    // 显示下一节课和本周课程表
    displayNextClass();
    generateWeeklySchedule();
    getWeather(); // 新增：获取天气
});

// 新增：获取并显示逐小时天气预报（带缓存和未来时间过滤）
async function getWeather() {
    const weatherContainer = document.getElementById('weather-container');
    const scrollContainer = weatherContainer.querySelector('.flex');

    const renderError = (message) => {
        weatherContainer.querySelector('h3').innerText = '天气加载失败';
        scrollContainer.innerHTML = `<p class="text-red-500">${message}</p>`;
        weatherContainer.classList.remove('hidden');
    };

    const renderHourlyWeather = (hourlyData) => {
        const now = new Date();
        // 核心逻辑：只显示未来的天气预报
        const futureHourlyData = hourlyData.filter(hour => new Date(hour.fxTime) > now);

        if (futureHourlyData.length === 0) {
            renderError("当前无未来24小时天气预报数据。");
            return;
        }

        scrollContainer.innerHTML = ''; // 清空旧数据
        futureHourlyData.forEach(hour => {
            const d = new Date(hour.fxTime);
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const time = d.getHours() + ':00';
            const displayTime = `${month}/${day} ${time}`;

            const card = `
                <div class="flex-shrink-0 w-28 text-center p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <p class="text-sm font-medium">${displayTime}</p>
                    <img src="https://icons.qweather.com/assets/icons/${hour.icon}.svg" alt="${hour.text}" class="w-10 h-10 mx-auto my-1">
                    <p class="text-lg font-bold">${hour.temp}°C</p>
                    <p class="text-xs">${hour.text}</p>
                </div>
            `;
            scrollContainer.innerHTML += card;
        });
        weatherContainer.classList.remove('hidden');
    };

    const fetchWeather = async (location) => {
        try {
            const apiKey = "921d41d032274310ab1fe3c774dcff13";
            const url = `https://devapi.qweather.com/v7/grid-weather/24h?location=${location}&key=${apiKey}`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`天气服务响应错误 (HTTP ${response.status})`);
            
            const data = await response.json();
            if (data.code !== "200") throw new Error(`API错误: ${data.code}`);

            // 缓存新数据
            const cacheData = {
                timestamp: new Date().toISOString(),
                data: data.hourly
            };
            localStorage.setItem('weatherCache', JSON.stringify(cacheData));
            
            renderHourlyWeather(data.hourly);

        } catch (error) {
            console.error('获取天气数据失败:', error);
            renderError('无法获取天气数据，请检查网络或API配置。');
        }
    };

    // --- 主逻辑开始 ---
    const cachedWeather = localStorage.getItem('weatherCache');
    if (cachedWeather) {
        const { timestamp, data } = JSON.parse(cachedWeather);
        const cacheAgeMinutes = (new Date() - new Date(timestamp)) / 1000 / 60;

        if (cacheAgeMinutes < 30) {
            console.log("使用缓存天气数据。");
            renderHourlyWeather(data);
            return; // 使用缓存，函数结束
        }
    }

    // 如果无缓存或缓存过期，则获取新数据
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { longitude, latitude } = position.coords;
                const location = `${longitude.toFixed(2)},${latitude.toFixed(2)}`;
                fetchWeather(location);
            },
            (error) => {
                console.warn('获取地理位置失败，使用默认位置。', error.message);
                fetchWeather('116.41,39.92'); // 默认北京
            }
        );
    } else {
        console.warn('浏览器不支持地理位置，使用默认位置。');
        fetchWeather('116.41,39.92'); // 默认北京
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
            const timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
            const timeSlot = nextClass.time_slot.split('-').map(Number);
            const startTime = timeConfig.time_slots[timeSlot[0] - 1].start;
            const endTime = timeConfig.time_slots[timeSlot[1] - 1].end;
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

// 生成本周课程表
function generateWeeklySchedule() {
    const storedCourses = localStorage.getItem('courses');
    const storedStartDate = localStorage.getItem('startDate');
    if (!storedCourses || !storedStartDate) return;

    try {
        const courses = JSON.parse(storedCourses);
        const startDate = new Date(storedStartDate);
        const now = new Date();
        const timeDiff = now - startDate;
        const currentWeek = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 7)) + 1;

        const scheduleDiv = document.getElementById('weekly-schedule');
        scheduleDiv.innerHTML = `<h3 class="text-xl font-bold text-center mb-4">本周 (第 ${currentWeek} 周) 课程表</h3>`;

        const timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
        const days = ['一', '二', '三', '四', '五', '六', '日'];
        let weekHasClasses = false;

        for (let i = 1; i <= 7; i++) {
            let dayClasses = [];
            courses.forEach(course => {
                course.schedules.forEach(schedule => {
                    const weeks = parseWeeks(schedule.weeks);
                    if (parseInt(schedule.day) === i && weeks.includes(currentWeek)) {
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

                let dayHtml = `<div class="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                 <h4 class="font-bold text-lg mb-2">周${days[i-1]}</h4>`;
                dayClasses.forEach(cls => {
                    const timeSlot = cls.time_slot.split('-').map(Number);
                    const startTime = timeConfig.time_slots[timeSlot[0] - 1].start;
                    const endTime = timeConfig.time_slots[timeSlot[1] - 1].end;
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
            scheduleDiv.innerHTML += `<p class="text-center text-gray-500 dark:text-gray-400">本周没有课程安排。</p>`;
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
    const timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
    const section = parseInt(timeStr, 10);
    const time = timeConfig.time_slots[section - 1].start;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// 新增：删除本地存储功能
function clearLocalStorage() {
    if (confirm("确定要清除所有本地课程数据吗？此操作不可逆。")) {
        localStorage.removeItem('courses');
        localStorage.removeItem('startDate');
        localStorage.removeItem('timeConfig');
        alert('本地存储已清除');
        window.location.href = 'index.html'; // 删除数据后跳转回 index.html
    }
}

// 新增：导出本地存储功能
function exportLocalStorage() {
    const storedCourses = localStorage.getItem('courses');
    const storedStartDate = localStorage.getItem('startDate');
    const storedTimeConfig = localStorage.getItem('timeConfig');

    if (!storedCourses || !storedStartDate) {
        alert('没有可导出的本地数据。');
        return;
    }

    try {
        const data = {
            courses: JSON.parse(storedCourses),
            startDate: storedStartDate,
            timeConfig: JSON.parse(storedTimeConfig)
        };

        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const link = document.createElement('a');
        link.href = jsonString;
        link.download = '课程数据.json';
        link.click();
    } catch (error) {
        console.error("导出本地数据失败：", error.message);
        alert(`导出本地数据失败：${error.message}`);
    }
}
