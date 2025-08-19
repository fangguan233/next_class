let coursesInMemory = [];
let hasUnsavedChanges = false;
let suggestionData = { teachers: new Set(), campus: new Set(), building: new Set(), classroom: new Set() };

document.addEventListener('DOMContentLoaded', function() {
    // --- Basic Setup ---
    loadCoursesAndSettings();

    // --- Show Conflict Warning on Load ---
    const conflictWarning = sessionStorage.getItem('conflict_warning');
    if (conflictWarning) {
        // 使用 setTimeout 确保在页面渲染后弹出，体验更好
        setTimeout(() => {
            alert(conflictWarning);
            sessionStorage.removeItem('conflict_warning'); // 显示后立即移除
        }, 100);
    }

    // --- Event Listeners for Core Actions ---
    const addBtn = document.getElementById('add-course-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addCourse);
    }

    const saveBtn = document.getElementById('save-changes-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllChanges);
    }

    // --- Event Listeners for Safety and UI ---
    window.addEventListener('beforeunload', e => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '您有未保存的更改，确定要离开吗？';
        }
    });

    // Close autocomplete list when clicking elsewhere
document.addEventListener('click', (e) => {
        // Check if the click is outside the autocomplete container
        if (!e.target.closest('.autocomplete')) {
            closeAllAutocompleteLists();
        }
    });

    // 显示ICP备案号
    displayIcpLicense();
});

// --- STATE MANAGEMENT ---
function setUnsavedChanges(status) {
    hasUnsavedChanges = status;
}

// --- DATA HANDLING ---
function collectSuggestionData() {
    suggestionData = { teachers: new Set(), campus: new Set(), building: new Set(), classroom: new Set() };
    coursesInMemory.forEach(course => {
        if (course.teachers) course.teachers.forEach(t => t && suggestionData.teachers.add(t));
        course.schedules.forEach(s => {
            if (s.campus) suggestionData.campus.add(s.campus);
            if (s.building) suggestionData.building.add(s.building);
            if (s.classroom) suggestionData.classroom.add(s.classroom);
        });
    });
}

function loadCoursesAndSettings() {
    const storedCourses = localStorage.getItem('courses');
    coursesInMemory = storedCourses ? JSON.parse(storedCourses) : [];

    collectSuggestionData();
    renderUIFromMemory();
    setUnsavedChanges(false);
}

// --- UI RENDERING & INTERACTION ---
function renderUIFromMemory() {
    const coursesContainer = document.getElementById('courses-container');
    coursesContainer.innerHTML = '';
    if (!coursesInMemory || coursesInMemory.length === 0) {
        coursesContainer.innerHTML = '<p class="text-center text-gray-500 py-8">没有找到课程数据。请先新增课程。</p>';
        return;
    }
    coursesInMemory.forEach((course, index) => {
        const courseElement = createCourseElement(course, index);
        coursesContainer.appendChild(courseElement);
    });
}

function createCourseElement(course, index) {
    const courseWrapper = document.createElement('div');
    courseWrapper.className = 'course-item bg-light-bg dark:bg-dark-bg rounded-lg shadow-sm overflow-hidden transition-shadow duration-200 hover:shadow-lg';
    courseWrapper.dataset.courseIndex = index;

    const schedulesHtml = course.schedules.map((schedule, sIndex) => createScheduleElement(schedule, index, sIndex)).join('');
    const scheduleCountText = course.schedules.length > 0 ? `${course.schedules.length}个日程` : '无日程';

    courseWrapper.innerHTML = `
        <div class="course-header flex justify-between items-center p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onclick="toggleCourse(${index})">
            <div>
                <h2 class="font-semibold text-lg">${course.name || '新课程'}</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">${scheduleCountText}</p>
            </div>
            <svg class="w-6 h-6 transform transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
        </div>
        <div class="course-body"><div class="p-4 border-t border-gray-200 dark:border-gray-700">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div><label class="block text-sm font-medium">课程代码</label><input type="text" value="${course.code}" oninput="updateCourseField(${index}, 'code', this.value)" class="w-full p-2 mt-1 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent"></div>
                <div><label class="block text-sm font-medium">课程名称</label><input type="text" value="${course.name}" oninput="updateCourseField(${index}, 'name', this.value)" class="w-full p-2 mt-1 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent"></div>
                <div class="md:col-span-2 autocomplete relative"><label class="block text-sm font-medium">教师 (多个用逗号隔开)</label><input type="text" value="${course.teachers.join(', ')}" oninput="updateCourseField(${index}, 'teachers', this.value.split(',').map(t=>t.trim())); initAutocomplete(this, Array.from(suggestionData.teachers))" onfocus="initAutocomplete(this, Array.from(suggestionData.teachers))" class="w-full p-2 mt-1 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent"></div>
            </div>
            <h3 class="text-md font-semibold mb-2">上课安排</h3><div class="schedules-container space-y-3">${schedulesHtml}</div>
            <div class="mt-4 flex justify-end gap-2">
                <button onclick="addSchedule(${index})" class="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md">添加安排</button>
                <button onclick="deleteCourse(${index})" class="px-3 py-1.5 text-sm bg-light-btnDanger dark:bg-dark-btnDanger hover:bg-light-btnDangerHover dark:hover:bg-dark-btnDangerHover text-white rounded-md">删除课程</button>
            </div>
        </div></div>`;
    return courseWrapper;
}

function createScheduleElement(schedule, courseIndex, scheduleIndex) {
    let maxSection = 12;
    try {
        const timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
        if (timeConfig && timeConfig.time_slots) maxSection = timeConfig.time_slots.length;
    } catch (e) {}

    const [startSlot, endSlot] = schedule.time_slot.split('-').map(Number);
    let dayOptions = '';
    for (let i = 1; i <= 7; i++) dayOptions += `<option value="${i}" ${schedule.day == i ? 'selected' : ''}>${i}</option>`;
    let startSlotOptions = '';
    for (let i = 1; i <= maxSection; i++) startSlotOptions += `<option value="${i}" ${startSlot == i ? 'selected' : ''}>${i}</option>`;
    let endSlotOptions = '';
    for (let i = startSlot || 1; i <= maxSection; i++) endSlotOptions += `<option value="${i}" ${endSlot == i ? 'selected' : ''}>${i}</option>`;

    return `
        <div class="schedule-item p-3 bg-gray-100 dark:bg-gray-800 rounded-md" data-schedule-index="${scheduleIndex}">
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label class="text-xs font-medium">周数</label><input type="text" value="${schedule.weeks}" oninput="updateScheduleField(${courseIndex}, ${scheduleIndex}, 'weeks', this.value)" class="w-full p-1.5 mt-1 text-xs rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent"></div>
                <div><label class="text-xs font-medium">星期</label><select onchange="updateScheduleField(${courseIndex}, ${scheduleIndex}, 'day', this.value)" class="w-full p-1.5 mt-1 text-xs rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent">${dayOptions}</select></div>
                <div class="grid grid-cols-2 gap-1">
                    <div><label class="text-xs font-medium">开始</label><select onchange="handleStartSectionChange(this, ${courseIndex}, ${scheduleIndex})" class="w-full p-1.5 mt-1 text-xs rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent">${startSlotOptions}</select></div>
                    <div><label class="text-xs font-medium">结束</label><select onchange="updateScheduleTimeSlot(${courseIndex}, ${scheduleIndex})" class="w-full p-1.5 mt-1 text-xs rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent">${endSlotOptions}</select></div>
                </div>
                <div class="autocomplete relative"><label class="text-xs font-medium">校区</label><input type="text" value="${schedule.campus}" oninput="updateScheduleField(${courseIndex}, ${scheduleIndex}, 'campus', this.value); initAutocomplete(this, Array.from(suggestionData.campus))" onfocus="initAutocomplete(this, Array.from(suggestionData.campus))" class="w-full p-1.5 mt-1 text-xs rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent"></div>
                <div class="autocomplete relative"><label class="text-xs font-medium">教学楼</label><input type="text" value="${schedule.building}" oninput="updateScheduleField(${courseIndex}, ${scheduleIndex}, 'building', this.value); initAutocomplete(this, Array.from(suggestionData.building))" onfocus="initAutocomplete(this, Array.from(suggestionData.building))" class="w-full p-1.5 mt-1 text-xs rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent"></div>
                <div class="autocomplete relative"><label class="text-xs font-medium">教室</label><input type="text" value="${schedule.classroom}" oninput="updateScheduleField(${courseIndex}, ${scheduleIndex}, 'classroom', this.value); initAutocomplete(this, Array.from(suggestionData.classroom))" onfocus="initAutocomplete(this, Array.from(suggestionData.classroom))" class="w-full p-1.5 mt-1 text-xs rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent"></div>
            </div>
            <div class="mt-3 text-right"><button onclick="deleteSchedule(${courseIndex}, ${scheduleIndex})" class="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95">删除此安排</button></div>
        </div>`;
}

function updateCourseField(courseIndex, field, value) {
    coursesInMemory[courseIndex][field] = value;
    setUnsavedChanges(true);
}
function updateScheduleField(courseIndex, scheduleIndex, field, value) {
    coursesInMemory[courseIndex].schedules[scheduleIndex][field] = value;
    setUnsavedChanges(true);
}

function handleStartSectionChange(startSelect, courseIndex, scheduleIndex) {
    const startValue = parseInt(startSelect.value);
    const endSelect = startSelect.parentElement.nextElementSibling.querySelector('select');
    const currentEndValue = parseInt(endSelect.value);

    let maxSection = 12;
    try { const tc = JSON.parse(localStorage.getItem('timeConfig')); if (tc && tc.time_slots) maxSection = tc.time_slots.length; } catch (e) {}

    let newEndOptions = '';
    for (let i = startValue; i <= maxSection; i++) {
        newEndOptions += `<option value="${i}">${i}</option>`;
    }
    endSelect.innerHTML = newEndOptions;

    endSelect.value = (currentEndValue >= startValue) ? currentEndValue : startValue;
    updateScheduleTimeSlot(courseIndex, scheduleIndex);
}

function updateScheduleTimeSlot(courseIndex, scheduleIndex) {
    const scheduleElement = document.querySelector(`[data-course-index='${courseIndex}'] [data-schedule-index='${scheduleIndex}']`);
    const startValue = scheduleElement.querySelectorAll('select')[1].value;
    const endValue = scheduleElement.querySelectorAll('select')[2].value;
    coursesInMemory[courseIndex].schedules[scheduleIndex].time_slot = `${startValue}-${endValue}`;
    setUnsavedChanges(true);
}

function toggleCourse(courseIndex) {
    const courseElement = document.querySelector(`.course-item[data-course-index='${courseIndex}']`);
    if (courseElement) {
        const body = courseElement.querySelector('.course-body');
        body.classList.toggle('active');
        courseElement.querySelector('svg').classList.toggle('rotate-180');
    }
}

// --- CRUD OPERATIONS ---
function addCourse() {
    coursesInMemory.push({ code: "NEW101", name: "新课程", teachers: [], schedules: [] });
    renderUIFromMemory(); setUnsavedChanges(true);
    setTimeout(() => {
        const newCourseElement = document.querySelector(`.course-item[data-course-index='${coursesInMemory.length - 1}']`);
        if (newCourseElement) {
            toggleCourse(coursesInMemory.length - 1);
            newCourseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}
function addSchedule(courseIndex) {
    coursesInMemory[courseIndex].schedules.push({ weeks: "1-16", day: "1", time_slot: "1-2", campus: "", building: "", classroom: "" });
    renderUIFromMemory(); setUnsavedChanges(true);
    setTimeout(() => {
        const courseElement = document.querySelector(`.course-item[data-course-index='${courseIndex}']`);
        if (courseElement && !courseElement.querySelector('.course-body').classList.contains('active')) toggleCourse(courseIndex);
    }, 100);
}
function deleteCourse(courseIndex) {
    if (!confirm("确定要删除这门课程吗？")) return;
    coursesInMemory.splice(courseIndex, 1);
    renderUIFromMemory(); setUnsavedChanges(true);
}
function deleteSchedule(courseIndex, scheduleIndex) {
    if (!confirm("确定要删除这个上课安排吗？")) return;
    coursesInMemory[courseIndex].schedules.splice(scheduleIndex, 1);
    renderUIFromMemory(); setUnsavedChanges(true);
}

// --- AUTOCOMPLETE ---
function initAutocomplete(inp, arr) {
    closeAllAutocompleteLists();
    
    const list = document.createElement("DIV");
    list.setAttribute("class", "autocomplete-items absolute bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md z-10 max-h-40 overflow-y-auto w-full mt-1");
    inp.parentNode.appendChild(list);

    const val = inp.value.toLowerCase();
    arr.forEach(item => {
        if (item.toLowerCase().includes(val)) {
            const itemDiv = document.createElement("DIV");
            itemDiv.innerHTML = item.replace(new RegExp(val, 'gi'), (match) => `<strong>${match}</strong>`);
            itemDiv.classList.add("p-2", "cursor-pointer", "hover:bg-gray-200", "dark:hover:bg-gray-700", "text-sm");
            
            itemDiv.addEventListener("click", function(e) {
                inp.value = this.innerText;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                closeAllAutocompleteLists();
            });
            list.appendChild(itemDiv);
        }
    });
    if (list.children.length === 0) {
        closeAllAutocompleteLists();
    }
}

function closeAllAutocompleteLists() {
    const lists = document.getElementsByClassName("autocomplete-items");
    while (lists.length > 0) {
        lists[0].parentNode.removeChild(lists[0]);
    }
}

// --- SAVE & EXIT ---
function detectConflicts(courses) {
    const calendar = {};
    function parseWeeks(w) { const s = new Set(); if (!w) return []; w.split(',').forEach(p => { if (p.includes('-')) { const [st, en] = p.split('-').map(Number); if (!isNaN(st) && !isNaN(en)) for (let i = st; i <= en; i++) s.add(i) } else if (!isNaN(p)) s.add(Number(p)) }); return Array.from(s) }
    for (const c of courses) { for (const s of c.schedules) { const w = parseWeeks(s.weeks), d = s.day, sl = s.time_slot.split('-').map(Number); if (sl.length === 2 && !isNaN(sl[0]) && !isNaN(sl[1])) { for (let wk of w) { for (let i = sl[0]; i <= sl[1]; i++) { const k = `${wk}-${d}-${i}`; if (calendar[k]) return { c: true, m: `课程冲突！\n'${c.name}'与'${calendar[k]}'\n在第${wk}周,星期${d},第${i}节冲突。` }; calendar[k] = c.name } } } } }
    return { c: false }
}

function saveAllChanges() {
    // 检查 localStorage 中是否存在开学日期，如果不存在则提示
    const storedStartDate = localStorage.getItem('startDate');
    if (!storedStartDate) {
        alert('错误：未设置开学日期。请返回主页设置。');
        return;
    }

    // 冲突检测
    const conflictResult = detectConflicts(coursesInMemory);
    if (conflictResult.c) {
        alert(conflictResult.m);
        return;
    }

    // 节次检查
    let timeConfig;
    try {
        timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
        if (!timeConfig || !timeConfig.time_slots) {
            throw new Error("Invalid time config");
        }
    } catch (e) {
        // 如果时间配置不存在或无效，创建一个默认的
        timeConfig = { time_slots: Array.from({ length: 12 }, (_, i) => ({ section: i + 1 })) };
    }
    const maxSection = timeConfig.time_slots.length;

    for (const course of coursesInMemory) {
        for (const schedule of course.schedules) {
            const timeParts = schedule.time_slot.split('-').map(Number);
            if (timeParts.length === 2 && !isNaN(timeParts[1]) && timeParts[1] > maxSection) {
                alert(`错误：课程 '${course.name}' 的节数 (${schedule.time_slot}) 超出了时间表定义的最大节数 (${maxSection})。请先在“时间管理”中调整或修正课程节次。`);
                return;
            }
        }
    }

    // 保存到 localStorage
    localStorage.setItem('courses', JSON.stringify(coursesInMemory));
    setUnsavedChanges(false);
    collectSuggestionData(); // 更新自动补全数据
    alert('所有更改已成功保存！');
}

function handleExit() {
    if (hasUnsavedChanges) { if (confirm("您有未保存的更改，确定要离开吗？所有未保存的修改都将丢失。")) window.location.href = 'index.html' }
    else { window.location.href = 'index.html' }
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
