let coursesInMemory = [];
let hasUnsavedChanges = false;
let suggestionData = { teachers: new Set(), campus: new Set(), building: new Set(), classroom: new Set() };
let conflictCourseIds = new Set();
let conflictDetailsByCourseId = new Map();
let pendingTimeConfig = null; // timeConfig changes staged until "save all"
let examsInMemory = [];
let showHiddenExams = sessionStorage.getItem('showHiddenExams') === 'true';

const aiAssistantState = {
    proposals: [],
    examProposals: [],
    timeConfigChange: null, // { timeConfig, reason, keep }
    imagesEnabled: false,
    selectedImages: [] // [{ name, dataUrl }]
};

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

    const addExamBtn = document.getElementById('add-exam-btn');
    if (addExamBtn) {
        addExamBtn.addEventListener('click', addExam);
    }

    const saveBtn = document.getElementById('save-changes-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllChanges);
    }

    const ganttViewBtn = document.getElementById('gantt-view-btn');
    if (ganttViewBtn) {
        ganttViewBtn.addEventListener('click', () => {
            window.location.href = 'conflict_detection.html';
        });
    }

    const showHiddenToggle = document.getElementById('show-hidden-exams');
    if (showHiddenToggle) {
        showHiddenToggle.checked = showHiddenExams;
        showHiddenToggle.addEventListener('change', () => {
            showHiddenExams = !!showHiddenToggle.checked;
            sessionStorage.setItem('showHiddenExams', showHiddenExams ? 'true' : 'false');
            renderExamsFromMemory();
        });
    }

    // --- AI Assistant ---
    initAIAssistant();

    // --- Pending TimeConfig Banner ---
    const pendingTimeConfigClearBtn = document.getElementById('pending-timeconfig-clear-btn');
    if (pendingTimeConfigClearBtn) {
        pendingTimeConfigClearBtn.addEventListener('click', () => {
            pendingTimeConfig = null;
            updatePendingTimeConfigBanner();
            renderUIFromMemory();
        });
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

function deepClone(obj) {
    return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function getTimeConfig() {
    if (pendingTimeConfig && pendingTimeConfig.time_slots) return pendingTimeConfig;
    try {
        const tc = JSON.parse(localStorage.getItem('timeConfig'));
        if (tc && tc.time_slots) return tc;
    } catch (e) {}
    return {
        config_id: "default",
        time_slots: Array.from({ length: 12 }, (_, i) => ({ section: i + 1, start: "", end: "" }))
    };
}

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

function normalizeCourseForMemory(course, id) {
    const normalized = { code: "", name: "", teachers: [], schedules: [], ...course };
    normalized.id = id;
    if (!Array.isArray(normalized.teachers)) normalized.teachers = [];
    const scheduleList = Array.isArray(normalized.schedules) ? normalized.schedules : [];
    let expanded = [];
    scheduleList.forEach(s => {
        const result = normalizeScheduleEntries(s);
        if (result.entries.length > 0) expanded = expanded.concat(result.entries);
    });
    const seen = new Set();
    normalized.schedules = expanded.filter(item => {
        const key = `${item.weeks}|${item.day}|${item.time_slot}|${item.campus}|${item.building}|${item.classroom}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return normalized;
}

function normalizeCoursesForMemory(rawCourses) {
    const usedIds = new Set();
    let nextId = 0;

    rawCourses.forEach(c => {
        if (typeof c?.id === 'number' && Number.isFinite(c.id)) {
            nextId = Math.max(nextId, c.id + 1);
        }
    });

    return rawCourses.map((course) => {
        let id = (typeof course?.id === 'number' && Number.isFinite(course.id) && !usedIds.has(course.id))
            ? course.id
            : null;

        if (id === null) {
            while (usedIds.has(nextId)) nextId++;
            id = nextId++;
        }
        usedIds.add(id);

        return normalizeCourseForMemory(course, id);
    });
}

function normalizeExamForMemory(exam, id) {
    const normalized = {
        title: "",
        date: "",
        startTime: "",
        endTime: "",
        location: "",
        courseId: null,
        notes: "",
        hidden: false,
        createdAt: Date.now(),
        ...exam
    };
    normalized.id = id;
    if (normalized.courseId !== null && normalized.courseId !== undefined && normalized.courseId !== '') {
        const cid = Number(normalized.courseId);
        normalized.courseId = Number.isFinite(cid) ? cid : null;
    } else {
        normalized.courseId = null;
    }
    normalized.title = String(normalized.title || '').trim();
    normalized.date = String(normalized.date || '').trim();
    normalized.startTime = String(normalized.startTime || '').trim();
    normalized.endTime = String(normalized.endTime || '').trim();
    normalized.location = String(normalized.location || '').trim();
    normalized.notes = String(normalized.notes || '').trim();
    normalized.hidden = !!normalized.hidden;
    normalized.createdAt = Number.isFinite(Number(normalized.createdAt)) ? Number(normalized.createdAt) : Date.now();
    return normalized;
}

function normalizeExamsForMemory(rawExams) {
    const usedIds = new Set();
    let nextId = 0;

    rawExams.forEach(e => {
        if (typeof e?.id === 'number' && Number.isFinite(e.id)) {
            nextId = Math.max(nextId, e.id + 1);
        }
    });

    return rawExams.map((exam) => {
        let id = (typeof exam?.id === 'number' && Number.isFinite(exam.id) && !usedIds.has(exam.id))
            ? exam.id
            : null;

        if (id === null) {
            while (usedIds.has(nextId)) nextId++;
            id = nextId++;
        }
        usedIds.add(id);

        return normalizeExamForMemory(exam, id);
    });
}

function parseLocalDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const dt = new Date(`${dateStr}T${timeStr}`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
}

function isExamExpired(exam) {
    const end = parseLocalDateTime(exam?.date, exam?.endTime);
    if (!end) return false;
    const hideAt = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return Date.now() > hideAt.getTime();
}

function isExamHidden(exam) {
    return !!exam?.hidden || isExamExpired(exam);
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
    let rawCourses = storedCourses ? JSON.parse(storedCourses) : [];

    // 为每门课程分配唯一ID（兼容旧数据）
    coursesInMemory = rawCourses.map((course, index) => ({
        ...course,
        id: course.id !== undefined ? course.id : index // 如果已有id则保留，否则按顺序分配
    }));
    coursesInMemory = normalizeCoursesForMemory(coursesInMemory);

    const storedExams = localStorage.getItem('exams');
    let rawExams = storedExams ? JSON.parse(storedExams) : [];
    if (!Array.isArray(rawExams)) rawExams = [];
    examsInMemory = normalizeExamsForMemory(rawExams);

    collectSuggestionData();
    renderUIFromMemory();
    updatePendingTimeConfigBanner();
    setUnsavedChanges(false);
}

// 处理AI返回的操作指令
function applyAIOperations(operations) {
    if (!Array.isArray(operations)) {
        console.error('AI操作指令格式错误');
        return false;
    }

    try {
        operations.forEach(op => {
            switch (op.operation) {
                case 'add':
                    if (op.course) {
                        // 确保新课程有ID
                        const newCourse = { ...op.course };
                        if (newCourse.id === undefined) {
                            newCourse.id = Math.max(...coursesInMemory.map(c => c.id), -1) + 1;
                        }
                        coursesInMemory.push(newCourse);
                    }
                    break;
                case 'remove':
                    if (op.id !== undefined) {
                        const index = coursesInMemory.findIndex(c => c.id === op.id);
                        if (index !== -1) {
                            coursesInMemory.splice(index, 1);
                        }
                    }
                    break;
                case 'alter':
                    if (op.id !== undefined && op.changes) {
                        const course = coursesInMemory.find(c => c.id === op.id);
                        if (course) {
                            Object.assign(course, op.changes);
                        }
                    }
                    break;
                default:
                    console.warn('未知操作类型:', op.operation);
            }
        });

        // 重新排序ID以保持连续性
        coursesInMemory = normalizeCoursesForMemory(coursesInMemory);

        return true;
    } catch (error) {
        console.error('应用AI操作失败:', error);
        return false;
    }
}

// --- UI RENDERING & INTERACTION ---
function renderUIFromMemory() {
    coursesInMemory = normalizeCoursesForMemory(coursesInMemory);
    const conflictInfo = detectConflictsDetailed(coursesInMemory);
    conflictCourseIds = conflictInfo.conflictCourseIds;
    conflictDetailsByCourseId = conflictInfo.detailsByCourseId;

    const coursesContainer = document.getElementById('courses-container');
    if (coursesContainer) {
        coursesContainer.innerHTML = '';
        if (!coursesInMemory || coursesInMemory.length === 0) {
            coursesContainer.innerHTML = '<p class="text-center text-gray-500 py-6 text-sm">暂无课程日程，请先新增课程。</p>';
        } else {
            coursesInMemory.forEach((course, index) => {
                const courseElement = createCourseElement(course, index);
                coursesContainer.appendChild(courseElement);
            });
        }
    }

    renderExamsFromMemory();
}

function createCourseElement(course, index) {
    const courseWrapper = document.createElement('div');
    const isConflict = conflictCourseIds.has(course.id);
    courseWrapper.className = 'course-item bg-light-bg dark:bg-dark-bg rounded-lg shadow-sm overflow-hidden transition-shadow duration-200 hover:shadow-lg' + (isConflict ? ' ring-2 ring-red-500' : '');
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

function renderExamsFromMemory() {
    const container = document.getElementById('exams-container');
    if (!container) return;

    container.innerHTML = '';
    const visibleExams = examsInMemory.filter(exam => showHiddenExams || !isExamHidden(exam));

    if (visibleExams.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4 text-sm">暂无考试日程。</p>';
        return;
    }

    visibleExams.forEach((exam) => {
        const index = examsInMemory.findIndex(e => e.id === exam.id);
        if (index === -1) return;
        const examElement = createExamElement(exam, index);
        container.appendChild(examElement);
    });
}

function createExamElement(exam, index) {
    const wrapper = document.createElement('div');
    const expired = isExamExpired(exam);
    const hidden = isExamHidden(exam);
    const courseOptions = [
        `<option value="">不关联课程</option>`,
        ...coursesInMemory.map(c => `<option value="${escapeHtml(String(c.id))}" ${String(exam.courseId ?? '') === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name || '未命名课程')} (#${escapeHtml(String(c.id))})</option>`)
    ];

    const statusBadge = expired
        ? `<span class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">已过期自动隐藏</span>`
        : hidden
            ? `<span class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">已隐藏</span>`
            : `<span class="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">考试</span>`;

    wrapper.className = 'bg-light-bg dark:bg-dark-bg rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700';
    wrapper.dataset.examIndex = index;
    wrapper.innerHTML = `
        <div class="p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-semibold">考试日程</div>
                <div class="flex items-center gap-2">
                    ${statusBadge}
                    <button onclick="deleteExam(${index})" class="px-2 py-1 text-xs rounded bg-red-500 hover:bg-red-600 text-white">删除</button>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-medium mb-1">考试名称</label>
                    <input type="text" value="${escapeHtml(exam.title)}" oninput="updateExamField(${index}, 'title', this.value)" class="w-full p-2 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition">
                </div>
                <div>
                    <label class="block text-xs font-medium mb-1">关联课程（可选）</label>
                    <select onchange="updateExamField(${index}, 'courseId', this.value)" class="w-full p-2 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition">
                        ${courseOptions.join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium mb-1">考试日期</label>
                    <input type="date" value="${escapeHtml(exam.date)}" oninput="updateExamField(${index}, 'date', this.value)" class="w-full p-2 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition">
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs font-medium mb-1">开始时间</label>
                        <input type="time" value="${escapeHtml(exam.startTime)}" oninput="updateExamField(${index}, 'startTime', this.value)" class="w-full p-2 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition">
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1">结束时间</label>
                        <input type="time" value="${escapeHtml(exam.endTime)}" oninput="updateExamField(${index}, 'endTime', this.value)" class="w-full p-2 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition">
                    </div>
                </div>
                <div class="sm:col-span-2">
                    <label class="block text-xs font-medium mb-1">地点</label>
                    <input type="text" value="${escapeHtml(exam.location)}" oninput="updateExamField(${index}, 'location', this.value)" class="w-full p-2 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition">
                </div>
                <div class="sm:col-span-2">
                    <label class="block text-xs font-medium mb-1">备注（可选）</label>
                    <input type="text" value="${escapeHtml(exam.notes || '')}" oninput="updateExamField(${index}, 'notes', this.value)" class="w-full p-2 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition">
                </div>
            </div>
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <label class="flex items-center gap-2">
                    <input type="checkbox" ${exam.hidden ? 'checked' : ''} onchange="updateExamField(${index}, 'hidden', this.checked)" class="h-4 w-4 accent-yellow-500">
                    <span>隐藏该考试</span>
                </label>
                <span>${exam.date && exam.startTime && exam.endTime ? `${escapeHtml(exam.date)} ${escapeHtml(exam.startTime)}-${escapeHtml(exam.endTime)}` : '待补充时间'}</span>
            </div>
        </div>
    `;
    return wrapper;
}

function createScheduleElement(schedule, courseIndex, scheduleIndex) {
    const timeConfig = getTimeConfig();
    const maxSection = timeConfig.time_slots.length;

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

    const maxSection = getTimeConfig().time_slots.length;

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

function addExam() {
    examsInMemory = normalizeExamsForMemory(examsInMemory);
    const used = new Set(examsInMemory.map(e => e.id));
    let nextId = Math.max(...examsInMemory.map(e => (typeof e.id === 'number' ? e.id : -1)), -1) + 1;
    while (used.has(nextId)) nextId++;
    examsInMemory.push(normalizeExamForMemory({
        title: "考试",
        date: "",
        startTime: "",
        endTime: "",
        location: "",
        courseId: null,
        notes: "",
        hidden: false
    }, nextId));
    renderExamsFromMemory();
    setUnsavedChanges(true);
}

function updateExamField(index, field, value) {
    const exam = examsInMemory[index];
    if (!exam) return;
    if (field === 'courseId') {
        exam.courseId = value === '' ? null : Number(value);
        if (!Number.isFinite(exam.courseId)) exam.courseId = null;
    } else if (field === 'hidden') {
        exam.hidden = !!value;
    } else {
        exam[field] = value;
    }
    setUnsavedChanges(true);
    renderExamsFromMemory();
}

function deleteExam(index) {
    if (!confirm("确定要删除该考试吗？")) return;
    examsInMemory.splice(index, 1);
    renderExamsFromMemory();
    setUnsavedChanges(true);
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

function updatePendingTimeConfigBanner() {
    const banner = document.getElementById('pending-timeconfig-banner');
    if (!banner) return;
    if (pendingTimeConfig) banner.classList.remove('hidden');
    else banner.classList.add('hidden');
}

// --- AI ASSISTANT ---
function initAIAssistant() {
    const openButtons = [
        document.getElementById('ai-assistant-btn'),
        document.getElementById('ai-assistant-fab')
    ].filter(Boolean);

    openButtons.forEach(btn => btn.addEventListener('click', () => openAIAssistant()));

    const backdrop = document.getElementById('ai-assistant-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeAIAssistant);

    const closeBtn = document.getElementById('ai-assistant-close');
    if (closeBtn) closeBtn.addEventListener('click', closeAIAssistant);

    const closeBottomBtn = document.getElementById('ai-assistant-close-bottom');
    if (closeBottomBtn) closeBottomBtn.addEventListener('click', closeAIAssistant);

    const generateBtn = document.getElementById('ai-assistant-generate');
    if (generateBtn) generateBtn.addEventListener('click', generateAIAssistantSuggestions);

    const clearBtn = document.getElementById('ai-assistant-clear');
    if (clearBtn) clearBtn.addEventListener('click', clearAIAssistant);

    const applyBtn = document.getElementById('ai-assistant-apply');
    if (applyBtn) applyBtn.addEventListener('click', applyAIAssistantChanges);

    const addImageBtn = document.getElementById('ai-assistant-add-image');
    const imageInput = document.getElementById('ai-assistant-image-input');
    if (addImageBtn && imageInput) {
        addImageBtn.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', async () => {
            await handleAIAssistantImageFiles(Array.from(imageInput.files || []));
            imageInput.value = '';
        });
    }

    const resultsContainer = document.getElementById('ai-assistant-results');
    if (resultsContainer) {
        resultsContainer.addEventListener('change', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLInputElement)) return;

            const opKey = target.getAttribute('data-ai-op-key');
            if (opKey) {
                const proposal = aiAssistantState.proposals.find(p => p.key === opKey);
                if (proposal) {
                    proposal.keep = target.checked;
                    renderAIAssistantResults();
                }
                return;
            }

            const examKey = target.getAttribute('data-ai-exam-key');
            if (examKey) {
                const proposal = aiAssistantState.examProposals.find(p => p.key === examKey);
                if (proposal) {
                    proposal.keep = target.checked;
                    renderAIAssistantResults();
                }
                return;
            }

            const tcKey = target.getAttribute('data-ai-timeconfig');
            if (tcKey && aiAssistantState.timeConfigChange) {
                aiAssistantState.timeConfigChange.keep = target.checked;
                renderAIAssistantResults();
            }
        });
    }

    const thumbs = document.getElementById('ai-assistant-image-thumbs');
    if (thumbs) {
        thumbs.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            const removeIndex = target.getAttribute('data-ai-remove-image-index');
            if (removeIndex === null) return;
            const idx = Number(removeIndex);
            if (!Number.isFinite(idx)) return;
            aiAssistantState.selectedImages.splice(idx, 1);
            renderAIAssistantImageThumbs();
        });
    }

    // Feature flags: reuse /api/feature-flags (image_processing)
    (async () => {
        try {
            const response = await fetch('/api/feature-flags');
            if (!response.ok) return;
            const data = await response.json();
            if (data?.success && data?.features) {
                aiAssistantState.imagesEnabled = !!data.features.image_processing;
                const imageSection = document.getElementById('ai-assistant-image-section');
                if (imageSection) {
                    if (aiAssistantState.imagesEnabled) imageSection.classList.remove('hidden');
                    else imageSection.classList.add('hidden');
                }
            }
        } catch (e) {}
    })();

    updatePendingTimeConfigBanner();
}

function openAIAssistant() {
    const overlay = document.getElementById('ai-assistant-overlay');
    const backdrop = document.getElementById('ai-assistant-backdrop');
    const sheet = document.getElementById('ai-assistant-sheet');
    if (!overlay || !backdrop || !sheet) return;

    updateAIAssistantCourseSelect();
    setAIAssistantStatus('', 'hidden');

    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        backdrop.classList.add('opacity-100');
        sheet.classList.remove('translate-y-full');
        sheet.classList.add('translate-y-0');
    });
}

function closeAIAssistant() {
    const overlay = document.getElementById('ai-assistant-overlay');
    const backdrop = document.getElementById('ai-assistant-backdrop');
    const sheet = document.getElementById('ai-assistant-sheet');
    if (!overlay || !backdrop || !sheet) return;
    if (overlay.classList.contains('hidden')) return;

    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    sheet.classList.remove('translate-y-0');
    sheet.classList.add('translate-y-full');

    setTimeout(() => {
        overlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }, 300);
}

function updateAIAssistantCourseSelect() {
    const select = document.getElementById('ai-assistant-course-select');
    if (!select) return;

    coursesInMemory = normalizeCoursesForMemory(coursesInMemory);

    const options = [
        `<option value="">（不指定，让 AI 自动识别）</option>`,
        ...coursesInMemory.map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name || '未命名课程')} (#${escapeHtml(String(c.id))})</option>`)
    ];
    select.innerHTML = options.join('');
}

function setAIAssistantStatus(message, type = 'info') {
    const status = document.getElementById('ai-assistant-status');
    if (!status) return;

    if (!message || type === 'hidden') {
        status.classList.add('hidden');
        status.textContent = '';
        status.classList.remove('text-red-600', 'dark:text-red-300', 'text-green-700', 'dark:text-green-300');
        return;
    }

    status.classList.remove('hidden');
    status.textContent = message;
    status.classList.remove('text-red-600', 'dark:text-red-300', 'text-green-700', 'dark:text-green-300');

    if (type === 'error') status.classList.add('text-red-600', 'dark:text-red-300');
    if (type === 'success') status.classList.add('text-green-700', 'dark:text-green-300');
}

function clearAIAssistant() {
    const input = document.getElementById('ai-assistant-input');
    const allowTc = document.getElementById('ai-assistant-allow-timeconfig');
    if (input) input.value = '';
    if (allowTc) allowTc.checked = false;

    aiAssistantState.selectedImages = [];
    aiAssistantState.proposals = [];
    aiAssistantState.examProposals = [];
    aiAssistantState.timeConfigChange = null;

    renderAIAssistantImageThumbs();
    renderAIAssistantResults();
    setAIAssistantStatus('', 'hidden');
}

async function handleAIAssistantImageFiles(files) {
    if (!aiAssistantState.imagesEnabled) return;

    const max = 3;
    const remaining = Math.max(0, max - aiAssistantState.selectedImages.length);
    const picked = files.slice(0, remaining);

    for (const file of picked) {
        const dataUrl = await fileToDataUrl(file);
        aiAssistantState.selectedImages.push({ name: file.name, dataUrl });
    }
    renderAIAssistantImageThumbs();
}

function renderAIAssistantImageThumbs() {
    const container = document.getElementById('ai-assistant-image-thumbs');
    if (!container) return;
    container.innerHTML = '';

    aiAssistantState.selectedImages.forEach((img, idx) => {
        const item = document.createElement('div');
        item.className = 'relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0';
        item.innerHTML = `
            <img src="${escapeHtml(img.dataUrl)}" alt="${escapeHtml(img.name)}" class="w-full h-full object-cover" />
            <button data-ai-remove-image-index="${idx}" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm leading-6 text-center">×</button>
        `;
        container.appendChild(item);
    });
}

async function generateAIAssistantSuggestions() {
    const input = document.getElementById('ai-assistant-input');
    const allowTc = document.getElementById('ai-assistant-allow-timeconfig');
    const select = document.getElementById('ai-assistant-course-select');
    const generateBtn = document.getElementById('ai-assistant-generate');

    const userInput = (input?.value || '').trim();
    if (!userInput && aiAssistantState.selectedImages.length === 0) {
        setAIAssistantStatus('请输入需求，或选择最多 3 张图片。', 'error');
        return;
    }

    const allowTimeConfig = !!allowTc?.checked;
    const targetCourseIdRaw = select?.value || '';
    const targetCourseId = targetCourseIdRaw === '' ? null : Number(targetCourseIdRaw);

    coursesInMemory = normalizeCoursesForMemory(coursesInMemory);

    const payload = {
        userInput,
        existingCourses: coursesInMemory,
        existingExams: examsInMemory,
        targetCourseId: Number.isFinite(targetCourseId) ? targetCourseId : null,
        allowTimeConfig,
        timeConfig: allowTimeConfig ? getTimeConfig() : null,
        startDate: localStorage.getItem('startDate'),
        images: aiAssistantState.imagesEnabled ? aiAssistantState.selectedImages.map(i => i.dataUrl) : []
    };

    try {
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.textContent = '生成中...';
        }
        setAIAssistantStatus('正在生成建议，请稍候...', 'info');

        const response = await fetch('/api/ai-assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let result;
        try {
            result = await response.json();
        } catch (e) {
            throw new Error('服务返回格式错误');
        }

        if (!response.ok || !result?.success) {
            throw new Error(result?.message || `请求失败 (HTTP ${response.status})`);
        }

        aiAssistantState.proposals = (result.operations || []).map((op, idx) => ({
            key: `op_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
            operation: op.operation,
            id: op.id,
            course: op.course,
            changes: op.changes,
            reason: op.reason || '',
            keep: true
        }));

        aiAssistantState.examProposals = (result.examOperations || []).map((op, idx) => ({
            key: `exam_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
            operation: op.operation,
            id: op.id,
            exam: op.exam,
            changes: op.changes,
            reason: op.reason || '',
            keep: true
        }));

        aiAssistantState.timeConfigChange = result.timeConfigChange
            ? {
                timeConfig: result.timeConfigChange.timeConfig,
                reason: result.timeConfigChange.reason || '',
                keep: true
            }
            : null;

        if (aiAssistantState.proposals.length === 0 && aiAssistantState.examProposals.length === 0 && !aiAssistantState.timeConfigChange) {
            setAIAssistantStatus('没有生成任何可应用的更改，请换一种描述方式再试。', 'error');
        } else {
            setAIAssistantStatus('已生成建议：请逐条确认是否保留。', 'success');
        }

        renderAIAssistantResults();

    } catch (error) {
        console.error('AI assistant failed:', error);
        setAIAssistantStatus(`生成失败：${error.message || error}`, 'error');
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = '生成建议';
        }
    }
}

function renderAIAssistantResults() {
    const container = document.getElementById('ai-assistant-results');
    const applyBtn = document.getElementById('ai-assistant-apply');
    if (!container) return;

    const preview = simulateAIAssistantPreview();
    const conflictInfo = detectConflictsDetailed(preview.courses);

    const blocks = [];

    if (aiAssistantState.timeConfigChange?.timeConfig) {
        const keep = !!aiAssistantState.timeConfigChange.keep;
        const beforeTc = getTimeConfig();
        const afterTc = aiAssistantState.timeConfigChange.timeConfig;
        const conflictBadge = '';
        blocks.push(`
            <div class="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-light-bg dark:bg-dark-bg">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">时间配置</span>
                            ${conflictBadge}
                        </div>
                        ${aiAssistantState.timeConfigChange.reason ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(aiAssistantState.timeConfigChange.reason)}</div>` : ''}
                    </div>
                    <label class="flex items-center gap-2 text-sm shrink-0">
                        <input type="checkbox" class="h-4 w-4 accent-indigo-600" data-ai-timeconfig="1" ${keep ? 'checked' : ''}>
                        <span>保留</span>
                    </label>
                </div>
                <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">改前</div>
                        <div class="space-y-1">${renderTimeConfigSummary(beforeTc)}</div>
                    </div>
                    <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">改后</div>
                        <div class="space-y-1">${renderTimeConfigSummary(afterTc)}</div>
                    </div>
                </div>
            </div>
        `);
    }

    aiAssistantState.proposals.forEach(p => {
        const keep = !!p.keep;
        const badge = p.operation === 'add'
            ? `<span class="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200">添加</span>`
            : p.operation === 'remove'
                ? `<span class="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">删除</span>`
                : `<span class="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">修改</span>`;

        const affectedId = p.operation === 'add' ? preview.addIdByKey.get(p.key) : p.id;
        const hasConflict = keep && p.operation !== 'remove' && conflictInfo.conflictCourseIds.has(affectedId);
        const conflictBadge = hasConflict
            ? `<span class="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">冲突</span>`
            : '';

        const beforeCourse = p.operation === 'add' ? null : coursesInMemory.find(c => c.id === p.id);
        const afterCourse = buildAfterCourseForPreview(p, beforeCourse, affectedId);

        blocks.push(`
            <div class="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-light-bg dark:bg-dark-bg">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="flex items-center gap-2">
                            ${badge}
                            ${conflictBadge}
                            <div class="text-sm font-semibold">${escapeHtml(getProposalTitle(p, beforeCourse, afterCourse))}</div>
                        </div>
                        ${p.reason ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(p.reason)}</div>` : ''}
                    </div>
                    <label class="flex items-center gap-2 text-sm shrink-0">
                        <input type="checkbox" class="h-4 w-4 accent-indigo-600" data-ai-op-key="${escapeHtml(p.key)}" ${keep ? 'checked' : ''}>
                        <span>保留</span>
                    </label>
                </div>
                <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">改前</div>
                        ${renderCourseSummary(beforeCourse)}
                    </div>
                    <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">改后</div>
                        ${p.operation === 'remove' ? `<div class="text-sm text-gray-500 dark:text-gray-400">（将删除）</div>` : renderCourseSummary(afterCourse)}
                    </div>
                </div>
            </div>
        `);
    });

    aiAssistantState.examProposals.forEach(p => {
        const keep = !!p.keep;
        const badge = p.operation === 'add'
            ? `<span class="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">考试新增</span>`
            : p.operation === 'remove'
                ? `<span class="px-2 py-0.5 text-xs rounded-full bg-yellow-200 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100">考试删除</span>`
                : `<span class="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">考试修改</span>`;

        const beforeExam = p.operation === 'add' ? null : examsInMemory.find(e => e.id === p.id);
        const afterExam = buildAfterExamForPreview(p, beforeExam);

        blocks.push(`
            <div class="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-light-bg dark:bg-dark-bg">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="flex items-center gap-2">
                            ${badge}
                            <div class="text-sm font-semibold">${escapeHtml(getExamProposalTitle(p, beforeExam, afterExam))}</div>
                        </div>
                        ${p.reason ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(p.reason)}</div>` : ''}
                    </div>
                    <label class="flex items-center gap-2 text-sm shrink-0">
                        <input type="checkbox" class="h-4 w-4 accent-yellow-500" data-ai-exam-key="${escapeHtml(p.key)}" ${keep ? 'checked' : ''}>
                        <span>保留</span>
                    </label>
                </div>
                <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">改前</div>
                        ${renderExamSummary(beforeExam)}
                    </div>
                    <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">改后</div>
                        ${p.operation === 'remove' ? `<div class="text-sm text-gray-500 dark:text-gray-400">（将删除）</div>` : renderExamSummary(afterExam)}
                    </div>
                </div>
            </div>
        `);
    });

    if (conflictInfo.hasConflict) {
        blocks.unshift(`
            <div class="p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
                预览检测到课程冲突：应用后相关课程会被标红提示（不阻止应用）。
            </div>
        `);
    }

    container.innerHTML = blocks.join('');

    const hasAnyKeep = aiAssistantState.proposals.some(p => p.keep)
        || aiAssistantState.examProposals.some(p => p.keep)
        || !!aiAssistantState.timeConfigChange?.keep;
    if (applyBtn) applyBtn.disabled = !hasAnyKeep;
}

function simulateAIAssistantPreview() {
    const baseCourses = deepClone(normalizeCoursesForMemory(coursesInMemory));
    const used = new Set(baseCourses.map(c => c.id));
    let nextId = Math.max(...baseCourses.map(c => (typeof c.id === 'number' ? c.id : -1)), -1) + 1;

    const addIdByKey = new Map();
    let previewCourses = baseCourses;

    aiAssistantState.proposals.forEach(p => {
        if (!p.keep) return;

        if (p.operation === 'add' && p.course) {
            const draft = deepClone(p.course);
            let id = (typeof draft.id === 'number' && Number.isFinite(draft.id) && !used.has(draft.id)) ? draft.id : null;
            if (id === null) {
                while (used.has(nextId)) nextId++;
                id = nextId++;
            }
            used.add(id);
            addIdByKey.set(p.key, id);
            previewCourses.push(normalizeCourseForMemory(draft, id));
            return;
        }

        if (p.operation === 'remove') {
            previewCourses = previewCourses.filter(c => c.id !== p.id);
            return;
        }

        if (p.operation === 'alter') {
            const target = previewCourses.find(c => c.id === p.id);
            if (target && p.changes && typeof p.changes === 'object') {
                Object.entries(p.changes).forEach(([k, v]) => {
                    target[k] = v;
                });
            }
        }
    });

    previewCourses = normalizeCoursesForMemory(previewCourses);

    return { courses: previewCourses, addIdByKey };
}

function buildAfterCourseForPreview(proposal, beforeCourse, forcedId) {
    if (proposal.operation === 'add') {
        const draft = deepClone(proposal.course || {});
        return normalizeCourseForMemory(draft, forcedId);
    }
    if (proposal.operation === 'alter') {
        const after = deepClone(beforeCourse || { id: proposal.id, code: "", name: "", teachers: [], schedules: [] });
        if (proposal.changes && typeof proposal.changes === 'object') {
            Object.entries(proposal.changes).forEach(([k, v]) => { after[k] = v; });
        }
        return normalizeCourseForMemory(after, proposal.id);
    }
    return null;
}

function getProposalTitle(proposal, beforeCourse, afterCourse) {
    if (proposal.operation === 'add') return afterCourse?.name || '新增课程';
    if (proposal.operation === 'remove') return beforeCourse?.name || `删除课程 #${proposal.id}`;
    return beforeCourse?.name || afterCourse?.name || `修改课程 #${proposal.id}`;
}

function buildAfterExamForPreview(proposal, beforeExam) {
    if (proposal.operation === 'add') {
        const draft = deepClone(proposal.exam || {});
        return normalizeExamForMemory(draft, proposal.id ?? -1);
    }
    if (proposal.operation === 'alter') {
        const after = deepClone(beforeExam || { id: proposal.id, title: "", date: "", startTime: "", endTime: "", location: "", courseId: null, notes: "", hidden: false });
        if (proposal.changes && typeof proposal.changes === 'object') {
            Object.entries(proposal.changes).forEach(([k, v]) => { after[k] = v; });
        }
        return normalizeExamForMemory(after, proposal.id);
    }
    return null;
}

function getExamProposalTitle(proposal, beforeExam, afterExam) {
    if (proposal.operation === 'add') return afterExam?.title || '新增考试';
    if (proposal.operation === 'remove') return beforeExam?.title || `删除考试 #${proposal.id}`;
    return beforeExam?.title || afterExam?.title || `修改考试 #${proposal.id}`;
}

function renderExamSummary(exam) {
    if (!exam) return `<div class="text-sm text-gray-500 dark:text-gray-400">（无）</div>`;
    const title = escapeHtml(exam.title || '未命名考试');
    const date = escapeHtml(exam.date || '');
    const time = exam.startTime && exam.endTime ? `${escapeHtml(exam.startTime)}-${escapeHtml(exam.endTime)}` : '';
    const place = escapeHtml(exam.location || '');
    const course = exam.courseId != null ? (coursesInMemory.find(c => c.id === exam.courseId)?.name || `课程 #${exam.courseId}`) : '不关联课程';
    const note = escapeHtml(exam.notes || '');
    return `
        <div class="text-sm font-semibold">${title}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${date} ${time}</div>
        ${place ? `<div class="text-xs text-gray-500 dark:text-gray-400">地点：${place}</div>` : ''}
        <div class="text-xs text-gray-500 dark:text-gray-400">关联：${escapeHtml(course)}</div>
        ${note ? `<div class="text-xs text-gray-500 dark:text-gray-400">备注：${note}</div>` : ''}
    `;
}

function applyAIAssistantChanges() {
    const acceptedOps = aiAssistantState.proposals.filter(p => p.keep);
    const acceptedExamOps = aiAssistantState.examProposals.filter(p => p.keep);
    const acceptedTimeConfig = aiAssistantState.timeConfigChange?.keep ? aiAssistantState.timeConfigChange.timeConfig : null;

    if (acceptedOps.length === 0 && acceptedExamOps.length === 0 && !acceptedTimeConfig) {
        setAIAssistantStatus('没有选中任何更改。', 'error');
        return;
    }

    coursesInMemory = normalizeCoursesForMemory(coursesInMemory);
    const used = new Set(coursesInMemory.map(c => c.id));
    let nextId = Math.max(...coursesInMemory.map(c => (typeof c.id === 'number' ? c.id : -1)), -1) + 1;

    acceptedOps.forEach(op => {
        if (op.operation === 'add' && op.course) {
            const draft = deepClone(op.course);
            let id = (typeof draft.id === 'number' && Number.isFinite(draft.id) && !used.has(draft.id)) ? draft.id : null;
            if (id === null) {
                while (used.has(nextId)) nextId++;
                id = nextId++;
            }
            used.add(id);
            coursesInMemory.push(normalizeCourseForMemory(draft, id));
            return;
        }
        if (op.operation === 'remove') {
            coursesInMemory = coursesInMemory.filter(c => c.id !== op.id);
            return;
        }
        if (op.operation === 'alter') {
            const target = coursesInMemory.find(c => c.id === op.id);
            if (target && op.changes && typeof op.changes === 'object') {
                Object.entries(op.changes).forEach(([k, v]) => { target[k] = v; });
            }
        }
    });

    coursesInMemory = normalizeCoursesForMemory(coursesInMemory);

    examsInMemory = normalizeExamsForMemory(examsInMemory);
    const usedExamIds = new Set(examsInMemory.map(e => e.id));
    let nextExamId = Math.max(...examsInMemory.map(e => (typeof e.id === 'number' ? e.id : -1)), -1) + 1;

    acceptedExamOps.forEach(op => {
        if (op.operation === 'add' && op.exam) {
            const draft = deepClone(op.exam);
            let id = (typeof draft.id === 'number' && Number.isFinite(draft.id) && !usedExamIds.has(draft.id)) ? draft.id : null;
            if (id === null) {
                while (usedExamIds.has(nextExamId)) nextExamId++;
                id = nextExamId++;
            }
            usedExamIds.add(id);
            examsInMemory.push(normalizeExamForMemory(draft, id));
            return;
        }
        if (op.operation === 'remove') {
            examsInMemory = examsInMemory.filter(e => e.id !== op.id);
            return;
        }
        if (op.operation === 'alter') {
            const target = examsInMemory.find(e => e.id === op.id);
            if (target && op.changes && typeof op.changes === 'object') {
                Object.entries(op.changes).forEach(([k, v]) => { target[k] = v; });
            }
        }
    });

    examsInMemory = normalizeExamsForMemory(examsInMemory);

    if (acceptedTimeConfig) {
        pendingTimeConfig = acceptedTimeConfig;
        updatePendingTimeConfigBanner();
    }

    collectSuggestionData();
    renderUIFromMemory();
    setUnsavedChanges(true);
    updateAIAssistantCourseSelect();

    const appliedCount = acceptedOps.length + acceptedExamOps.length + (acceptedTimeConfig ? 1 : 0);
    setAIAssistantStatus(`已应用 ${appliedCount} 条更改（未写入本地，需“保存所有更改”后生效）。`, 'success');

    // Clear proposals after apply (so user can continue new round)
    aiAssistantState.proposals = [];
    aiAssistantState.examProposals = [];
    aiAssistantState.timeConfigChange = null;
    renderAIAssistantResults();
}

function escapeHtml(input) {
    const str = String(input ?? '');
    return str.replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function renderCourseSummary(course) {
    if (!course) {
        return `<div class="text-sm text-gray-500 dark:text-gray-400">（无）</div>`;
    }

    const name = escapeHtml(course.name || '未命名课程');
    const code = course.code ? `<div class="text-xs text-gray-500 dark:text-gray-400">代码：${escapeHtml(course.code)}</div>` : '';
    const teachers = Array.isArray(course.teachers) ? course.teachers.filter(Boolean).join(', ') : '';
    const teacherLine = teachers ? `<div class="text-xs text-gray-500 dark:text-gray-400">教师：${escapeHtml(teachers)}</div>` : '';

    const schedules = Array.isArray(course.schedules) ? course.schedules : [];
    const scheduleLines = schedules.length
        ? schedules.map(s => {
            const weeks = escapeHtml(s.weeks || '');
            const day = escapeHtml(String(s.day || ''));
            const slot = escapeHtml(s.time_slot || '');
            const place = [s.campus, s.building, s.classroom].filter(Boolean).join(' ');
            const placeLine = place ? ` · ${escapeHtml(place)}` : '';
            return `<div class="text-xs text-gray-600 dark:text-gray-300">周${weeks} · 星期${day} · ${slot}${placeLine}</div>`;
        }).join('')
        : `<div class="text-xs text-gray-500 dark:text-gray-400">无上课安排</div>`;

    return `
        <div class="space-y-1">
            <div class="text-sm font-semibold">${name}</div>
            ${code}
            ${teacherLine}
            <div class="mt-2 space-y-1">${scheduleLines}</div>
        </div>
    `;
}

function renderTimeConfigSummary(timeConfig) {
    if (!timeConfig || !Array.isArray(timeConfig.time_slots)) {
        return `<div class="text-sm text-gray-500 dark:text-gray-400">（无）</div>`;
    }

    return timeConfig.time_slots.map(slot => {
        const section = slot?.section ?? '';
        const start = slot?.start ?? '';
        const end = slot?.end ?? '';
        const text = (start && end) ? `${start}-${end}` : '';
        return `
            <div class="flex items-center justify-between text-xs text-gray-700 dark:text-gray-200">
                <span>第${escapeHtml(String(section))}节</span>
                <span class="font-mono">${escapeHtml(text)}</span>
            </div>
        `;
    }).join('');
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
    });
}

// --- SAVE & EXIT ---
function detectConflicts(courses) {
    const calendar = {};
    function parseWeeks(w) { const s = new Set(); if (!w) return []; w.split(',').forEach(p => { if (p.includes('-')) { const [st, en] = p.split('-').map(Number); if (!isNaN(st) && !isNaN(en)) for (let i = st; i <= en; i++) s.add(i) } else if (!isNaN(p)) s.add(Number(p)) }); return Array.from(s) }
    for (const c of courses) { for (const s of c.schedules) { const w = parseWeeks(s.weeks), d = s.day, sl = s.time_slot.split('-').map(Number); if (sl.length === 2 && !isNaN(sl[0]) && !isNaN(sl[1])) { for (let wk of w) { for (let i = sl[0]; i <= sl[1]; i++) { const k = `${wk}-${d}-${i}`; if (calendar[k]) return { c: true, m: `课程冲突！\n'${c.name}'与'${calendar[k]}'\n在第${wk}周,星期${d},第${i}节冲突。` }; calendar[k] = c.name } } } } }
    return { c: false }
}

function parseWeeksForConflict(weeksStr) {
    if (!weeksStr || typeof weeksStr !== 'string') return [];

    const normalized = weeksStr.replace(/，/g, ',').trim();
    const weeks = new Set();

    normalized.split(',').forEach(partRaw => {
        const part = partRaw.trim();
        if (!part) return;

        const singleMatch = part.match(/^(\d+)-(\d+)\(单周\)$/);
        const doubleMatch = part.match(/^(\d+)-(\d+)\(双周\)$/);
        const rangeMatch = part.match(/^(\d+)-(\d+)$/);

        if (singleMatch) {
            const [start, end] = singleMatch.slice(1).map(Number);
            for (let i = start; i <= end; i++) if (i % 2 !== 0) weeks.add(i);
            return;
        }
        if (doubleMatch) {
            const [start, end] = doubleMatch.slice(1).map(Number);
            for (let i = start; i <= end; i++) if (i % 2 === 0) weeks.add(i);
            return;
        }
        if (rangeMatch) {
            const [start, end] = rangeMatch.slice(1).map(Number);
            for (let i = start; i <= end; i++) weeks.add(i);
            return;
        }
        if (/^\d+$/.test(part)) {
            weeks.add(Number(part));
        }
    });

    return Array.from(weeks);
}

function detectConflictsDetailed(courses) {
    const calendar = new Map(); // key -> { courseId, courseName }
    const conflictCourseIds = new Set();
    const detailsByCourseId = new Map(); // courseId -> [detail]

    let firstMessage = '';

    function pushDetail(courseId, detail) {
        const list = detailsByCourseId.get(courseId) || [];
        if (list.length < 4) list.push(detail);
        detailsByCourseId.set(courseId, list);
    }

    if (!Array.isArray(courses)) {
        return { hasConflict: false, conflictCourseIds, detailsByCourseId, message: '' };
    }

    for (const course of courses) {
        const courseId = course?.id;
        const courseName = course?.name || '未命名课程';
        const schedules = Array.isArray(course?.schedules) ? course.schedules : [];

        for (const schedule of schedules) {
            const weeks = parseWeeksForConflict(schedule?.weeks);
            const day = Number(schedule?.day);
            const timeParts = String(schedule?.time_slot || '').split('-').map(Number);
            if (!weeks.length || !Number.isFinite(day) || timeParts.length !== 2) continue;
            const [startSlot, endSlot] = timeParts;
            if (!Number.isFinite(startSlot) || !Number.isFinite(endSlot)) continue;

            for (const week of weeks) {
                for (let slot = startSlot; slot <= endSlot; slot++) {
                    const key = `${week}-${day}-${slot}`;
                    const existing = calendar.get(key);
                    if (existing && existing.courseId !== courseId) {
                        conflictCourseIds.add(courseId);
                        conflictCourseIds.add(existing.courseId);

                        pushDetail(courseId, `第${week}周 星期${day} 第${slot}节 与「${existing.courseName}」冲突`);
                        pushDetail(existing.courseId, `第${week}周 星期${day} 第${slot}节 与「${courseName}」冲突`);

                        if (!firstMessage) {
                            firstMessage = `课程冲突！\n「${courseName}」与「${existing.courseName}」\n在第${week}周, 星期${day}, 第${slot}节冲突。`;
                        }
                    } else if (!existing) {
                        calendar.set(key, { courseId, courseName });
                    }
                }
            }
        }
    }

    return {
        hasConflict: conflictCourseIds.size > 0,
        conflictCourseIds,
        detailsByCourseId,
        message: firstMessage
    };
}

function saveAllChanges() {
    // 检查 localStorage 中是否存在开学日期，如果不存在则提示
    const storedStartDate = localStorage.getItem('startDate');
    if (!storedStartDate) {
        alert('错误：未设置开学日期。请返回主页设置。');
        return;
    }

    // 冲突检测
    const conflictResult = detectConflictsDetailed(coursesInMemory);
    if (conflictResult.hasConflict) {
        alert(conflictResult.message || '检测到课程冲突，请先处理后再保存。');
        return;
    }

    // 节次检查
    let timeConfig;
    try {
        timeConfig = getTimeConfig();
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
    localStorage.setItem('exams', JSON.stringify(examsInMemory));
    if (pendingTimeConfig) {
        localStorage.setItem('timeConfig', JSON.stringify(pendingTimeConfig));
        pendingTimeConfig = null;
        updatePendingTimeConfigBanner();
    }
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
