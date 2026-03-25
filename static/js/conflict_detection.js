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

class ConflictDetectionGantt {
    constructor() {
        this.courses = [];
        this.originalCourses = [];
        this.exams = [];
        this.originalExams = [];
        this.currentWeek = 1;
        this.maxWeek = 16;
        this.timeSlots = [];
        this.conflicts = new Map();
        this.draggingElement = null;
        this.targetHighlight = null;
        this.hasUnsavedChanges = false;
        
        this.init();
    }
    
    init() {
        this.loadCourses();
        this.loadExams();
        this.loadTimeConfig();
        this.setupEventListeners();
        this.renderWeekSelector();
        this.renderGanttChart();
    }
    
    loadCourses() {
        const storedCourses = localStorage.getItem('courses');
        const rawCourses = storedCourses ? JSON.parse(storedCourses) : [];
        const result = normalizeCourses(rawCourses);
        this.courses = result.courses;
        if (result.changed) {
            localStorage.setItem('courses', JSON.stringify(this.courses));
        }
        this.originalCourses = JSON.parse(JSON.stringify(this.courses));
        
        // 计算最大周数
        this.maxWeek = 16;
        this.courses.forEach(course => {
            course.schedules.forEach(schedule => {
                const weeks = this.parseWeeks(schedule.weeks);
                if (weeks.length > 0) {
                    const maxInSchedule = Math.max(...weeks);
                    if (maxInSchedule > this.maxWeek) {
                        this.maxWeek = maxInSchedule;
                    }
                }
            });
        });
    }

    loadExams() {
        const storedExams = localStorage.getItem('exams');
        this.exams = storedExams ? JSON.parse(storedExams) : [];
        if (!Array.isArray(this.exams)) this.exams = [];
        this.originalExams = JSON.parse(JSON.stringify(this.exams));
        
        const startDateStr = localStorage.getItem('startDate');
        if (!startDateStr) return;
        const startDate = new Date(startDateStr);
        if (Number.isNaN(startDate.getTime())) return;
        this.exams.forEach(exam => {
            const info = this.getWeekAndDayFromDate(exam?.date, startDate);
            if (info && info.week > this.maxWeek) {
                this.maxWeek = info.week;
            }
        });
    }
    
    loadTimeConfig() {
        try {
            const timeConfig = JSON.parse(localStorage.getItem('timeConfig'));
            if (timeConfig && timeConfig.time_slots && timeConfig.time_slots.length > 0) {
                this.timeSlots = timeConfig.time_slots;
                console.log('Loaded time slots from config:', this.timeSlots.length);
            } else {
                // 默认时间配置
                this.timeSlots = [
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
                ];
                console.log('Using default time slots:', this.timeSlots.length);
            }
        } catch (e) {
            console.error('Failed to load time config:', e);
            this.timeSlots = Array.from({ length: 12 }, (_, i) => ({ 
                section: i + 1, 
                start: `${8 + Math.floor(i/2)}:${(i % 2 === 0 ? '00' : '30')}`, 
                end: `${8 + Math.floor(i/2)}:${(i % 2 === 0 ? '30' : '00')}` 
            }));
            console.log('Generated time slots:', this.timeSlots.length);
        }
    }
    
    setupEventListeners() {
        // 周数选择器
        const weekSelector = document.getElementById('week-selector');
        if (weekSelector) {
            weekSelector.addEventListener('change', (e) => {
                this.currentWeek = parseInt(e.target.value);
                this.renderGanttChart();
            });
        }
        
        // 切换到列表视图
        const switchToListBtn = document.getElementById('switch-to-list-btn');
        if (switchToListBtn) {
            switchToListBtn.addEventListener('click', () => {
                window.location.href = 'edit.html';
            });
        }
        
        // 保存更改
        const saveChangesBtn = document.getElementById('save-changes-btn');
        if (saveChangesBtn) {
            saveChangesBtn.addEventListener('click', () => {
                this.saveChanges();
            });
        }
        
        // 窗口卸载前检查未保存更改
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '您有未保存的更改，确定要离开吗？';
            }
        });
    }
    
    renderWeekSelector() {
        const weekSelector = document.getElementById('week-selector');
        if (!weekSelector) return;
        
        weekSelector.innerHTML = '';
        for (let i = 1; i <= this.maxWeek; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `第 ${i} 周`;
            if (i === this.currentWeek) {
                option.selected = true;
            }
            weekSelector.appendChild(option);
        }
    }
    
    renderGanttChart() {
        const container = document.getElementById('gantt-container');
        if (!container) return;

        container.innerHTML = '';

        // 全局冲突检测
        this.conflicts = this.detectConflicts();

        // 检测是否为移动设备
        const isMobile = window.innerWidth <= 768;

        // 创建表头和内容容器
        const header = document.createElement('div');
        header.className = 'gantt-header';
        header.style.height = isMobile ? '40px' : '30px'; // 移动端更大的表头

        const content = document.createElement('div');
        content.className = 'gantt-content';
        content.style.height = `${this.timeSlots.length * 120}px`;

        // 渲染表头（星期标签）
        this.renderHeader(header);

        // 渲染时间网格
        this.renderTimeGrid(content);

        // 添加到容器
        container.appendChild(header);
        container.appendChild(content);

        // 转换课程数据为甘特图格式
        const ganttData = this.convertToGanttData();

        // 渲染课程块
        ganttData.forEach(item => {
            const isConflict = this.conflicts.has(item.title);
            this.renderCourseBlock(content, item, isConflict);
        });

        // 渲染考试块（不可拖拽）
        const examData = this.convertToExamData();
        examData.forEach(item => {
            this.renderExamBlock(content, item);
        });

        // 更新冲突警告
        this.updateConflictWarning();
    }
    
    renderHeader(header) {
        // 渲染星期标签
        const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
        days.forEach((day, index) => {
            const dayLabel = document.createElement('div');
            dayLabel.className = 'day-label';
            dayLabel.style.left = `${(index * 100) / 7}%`;
            dayLabel.style.width = `${100 / 7}%`;
            dayLabel.textContent = day;
            header.appendChild(dayLabel);
        });
    }
    
    renderTimeGrid(container) {
        const grid = document.createElement('div');
        grid.className = 'time-grid';
        
        // 渲染时间槽
        this.timeSlots.forEach((slot, index) => {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot';
            timeSlot.style.top = `${index * 120}px`;
            timeSlot.style.height = '120px';
            timeSlot.textContent = `${slot.start}-${slot.end}`;
            grid.appendChild(timeSlot);
        });
        
        container.appendChild(grid);
    }
    
    convertToGanttData() {
        const ganttData = [];
        // 使用更鲜明、对比度更高的颜色方案
        const colors = [
            '#FF6B6B', // 珊瑚红
            '#4ECDC4', // 青绿色
            '#45B7D1', // 天蓝色
            '#96CEB4', // 薄荷绿
            '#FECA57', // 橙黄色
            '#FF9FF3', // 粉紫色
            '#54A0FF', // 亮蓝色
            '#5F27CD', // 深紫色
            '#00D2D3', // 青蓝色
            '#FF9F43', // 橙色
            '#10AC84', // 翡翠绿
            '#EE5A24'  // 深橙色
        ];
        let colorIndex = 0;
        
        this.courses.forEach(course => {
            course.schedules.forEach(schedule => {
                const weeks = this.parseWeeks(schedule.weeks);
                if (weeks.includes(this.currentWeek)) {
                    const timeSlot = schedule.time_slot.split('-').map(Number);
                    const startTime = timeSlot[0];
                    const endTime = timeSlot[1];
                    
                    ganttData.push({
                        id: `${course.name}-${schedule.day}-${timeSlot.join('-')}-${Date.now()}`,
                        title: course.name,
                        day: parseInt(schedule.day),
                        startSlot: startTime,
                        endSlot: endTime,
                        color: colors[colorIndex % colors.length],
                        courseData: course,
                        scheduleData: schedule,
                        originalDay: parseInt(schedule.day),
                        originalStartSlot: startTime,
                        originalEndSlot: endTime
                    });
                    
                    colorIndex++;
                }
            });
        });
        
        return ganttData;
    }

    convertToExamData() {
        const examData = [];
        const startDateStr = localStorage.getItem('startDate');
        if (!startDateStr) return examData;
        const startDate = new Date(startDateStr);
        if (Number.isNaN(startDate.getTime())) return examData;

        const { dayStartMinutes, dayEndMinutes } = this.getDayRangeMinutes();
        const contentHeight = this.timeSlots.length * 120;
        const totalMinutes = Math.max(1, dayEndMinutes - dayStartMinutes);
        const minuteHeight = contentHeight / totalMinutes;

        const intervalsByDay = this.getCourseIntervalsByDay();

        this.exams.forEach(exam => {
            const dateInfo = this.getWeekAndDayFromDate(exam?.date, startDate);
            if (!dateInfo) return;
            const { week, day } = dateInfo;
            if (week !== this.currentWeek) return;

            const startMin = this.parseTimeToMinutes(exam?.startTime);
            const endMin = this.parseTimeToMinutes(exam?.endTime);
            if (startMin === null || endMin === null || endMin <= startMin) return;

            const top = Math.max(0, (startMin - dayStartMinutes) * minuteHeight);
            const height = Math.max(24, (Math.min(endMin, dayEndMinutes) - Math.max(startMin, dayStartMinutes)) * minuteHeight);

            const overlaps = (intervalsByDay.get(day) || []).some(interval => startMin < interval.end && endMin > interval.start);

            examData.push({
                id: `exam-${exam.id}-${week}-${day}`,
                title: exam.title || '考试',
                day,
                top,
                height,
                timeText: `${exam.startTime || ''}-${exam.endTime || ''}`,
                location: exam.location || '',
                hidden: this.isExamHidden(exam),
                warn: overlaps
            });
        });

        return examData;
    }

    renderExamBlock(container, item) {
        const block = document.createElement('div');
        block.className = `exam-block ${item.warn ? 'warn' : ''} ${item.hidden ? 'hidden' : ''}`;
        block.style.left = `${((item.day - 1) * 100) / 7}%`;
        block.style.top = `${item.top}px`;
        block.style.width = `${100 / 7}%`;
        block.style.height = `${item.height}px`;
        block.innerHTML = `
            <div class="text-xs font-bold">${item.title}</div>
            <div class="text-[11px]">${item.timeText}</div>
            ${item.location ? `<div class="text-[10px]">${item.location}</div>` : ''}
            ${item.warn ? `<div class="text-[10px]">⚠ 可与课程重叠</div>` : ''}
        `;
        block.addEventListener('mousedown', (e) => {
            e.preventDefault();
            alert('考试无法在条状图中拖拽修改，请返回日程管理编辑。');
        });
        block.addEventListener('touchstart', (e) => {
            e.preventDefault();
            alert('考试无法在条状图中拖拽修改，请返回日程管理编辑。');
        }, { passive: false });
        container.appendChild(block);
    }
    
    renderCourseBlock(container, item, isConflict) {
        const block = document.createElement('div');
        block.className = `course-block ${isConflict ? 'conflict' : ''}`;
        block.style.backgroundColor = item.color;
        block.style.left = `${((item.day - 1) * 100) / 7}%`;
        // 调整课程块的起始位置，确保在内容区域内正确显示
        block.style.top = `${(item.startSlot - 1) * 120}px`;
        block.style.width = `${100 / 7}%`;
        block.style.height = `${(item.endSlot - item.startSlot + 1) * 120}px`;
        block.innerHTML = `
            <div class="course-title font-bold text-sm">${item.title}</div>
            <div class="course-time text-xs">${item.startSlot}-${item.endSlot}节</div>
        `;
        
        // 添加拖拽事件
        this.makeDraggable(block, item);
        container.appendChild(block);
    }
    
    makeDraggable(element, courseData) {
        let isDragging = false;
        let startX, startY;
        let originalDay, originalStartSlot, originalEndSlot;
        
        // 保存原始位置信息
        originalDay = courseData.originalDay;
        originalStartSlot = courseData.originalStartSlot;
        originalEndSlot = courseData.originalEndSlot;
        
        // 获取触摸或鼠标坐标
        const getCoordinates = (e) => {
            if (e.type.startsWith('touch')) {
                if (e.type === 'touchend') {
                    return {
                        x: e.changedTouches[0].clientX,
                        y: e.changedTouches[0].clientY
                    };
                }
                return {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
            } else {
                return {
                    x: e.clientX,
                    y: e.clientY
                };
            }
        };
        
        // 开始拖拽
        const startDrag = (e) => {
            isDragging = true;
            this.draggingElement = element;
            const coords = getCoordinates(e);
            startX = coords.x;
            startY = coords.y;
            element.classList.add('dragging');
            e.preventDefault();
        };
        
        // 拖拽中
        const dragMove = (e) => {
            if (!isDragging) return;
            
            const coords = getCoordinates(e);
            const container = document.getElementById('gantt-container');
            const containerRect = container.getBoundingClientRect();
            
            // 计算相对于容器的位置
            const mouseX = coords.x - containerRect.left;
            const mouseY = coords.y - containerRect.top;
            
            // 计算目标星期（1-7）
            const targetDay = Math.max(1, Math.min(7, Math.floor((mouseX / containerRect.width) * 7) + 1));
            
            // 计算目标起始时间槽（基于鼠标Y位置）
            const slotHeight = 120;
            // 调整计算逻辑以匹配新的时间槽位置，考虑表头高度
            const adjustedMouseY = mouseY - 30; // 减去表头高度
            const targetStartSlot = Math.max(1, Math.min(this.timeSlots.length, Math.floor(adjustedMouseY / slotHeight) + 1));
            
            // 保持课程持续时间不变
            const duration = originalEndSlot - originalStartSlot + 1;
            const targetEndSlot = targetStartSlot + duration - 1;
            
            // 检查是否超出边界
            if (targetEndSlot > this.timeSlots.length) {
                // 如果超出边界，向上弹回
                const adjustedStartSlot = this.timeSlots.length - duration + 1;
                if (adjustedStartSlot >= 1) {
                    // 精确对齐到网格位置
                    const alignedLeft = ((targetDay - 1) * 100) / 7;
                    const alignedTop = (adjustedStartSlot - 1) * slotHeight;
                    
                    element.style.left = `${alignedLeft}%`;
                    element.style.top = `${alignedTop}px`;
                    element.style.height = `${duration * slotHeight}px`;
                    
                    // 显示目标位置高亮
                    this.showTargetHighlight(alignedLeft, alignedTop, duration * slotHeight);
                    return;
                }
            }
            
            // 精确对齐到网格位置
            const alignedLeft = ((targetDay - 1) * 100) / 7;
            const alignedTop = (targetStartSlot - 1) * slotHeight;
            
            element.style.left = `${alignedLeft}%`;
            element.style.top = `${alignedTop}px`;
            element.style.height = `${duration * slotHeight}px`;
            
            // 显示目标位置高亮
            this.showTargetHighlight(alignedLeft, alignedTop, duration * slotHeight);
        };
        
        // 结束拖拽
        const endDrag = (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            this.draggingElement = null;
            element.classList.remove('dragging');
            this.hideTargetHighlight();
            
            const coords = getCoordinates(e);
            const container = document.getElementById('gantt-container');
            const containerRect = container.getBoundingClientRect();
            
            // 获取释放时的位置
            const mouseX = coords.x - containerRect.left;
            const mouseY = coords.y - containerRect.top;
            
            // 计算目标位置
            const finalDay = Math.max(1, Math.min(7, Math.floor((mouseX / containerRect.width) * 7) + 1));
            const slotHeight = 120;
            // 调整计算逻辑以匹配新的时间槽位置，考虑表头高度
            const adjustedMouseY = mouseY - 30; // 减去表头高度
            const finalStartSlot = Math.max(1, Math.min(this.timeSlots.length, Math.floor(adjustedMouseY / slotHeight) + 1));
            const duration = originalEndSlot - originalStartSlot + 1;
            const finalEndSlot = finalStartSlot + duration - 1;
            
            // 检查是否超出边界
            if (finalEndSlot > this.timeSlots.length) {
                // 如果超出边界，向上弹回
                const adjustedStartSlot = this.timeSlots.length - duration + 1;
                if (adjustedStartSlot >= 1) {
                    const finalPosition = {
                        day: finalDay,
                        startSlot: adjustedStartSlot,
                        endSlot: this.timeSlots.length
                    };
                    
                    this.applyScheduleChange(courseData, finalPosition);
                    this.renderGanttChart();
                    return;
                }
            }
            
            // 验证最终位置是否有效
            if (finalDay >= 1 && finalDay <= 7 && 
                finalStartSlot >= 1 && finalEndSlot <= this.timeSlots.length) {
                
                const finalPosition = {
                    day: finalDay,
                    startSlot: finalStartSlot,
                    endSlot: finalEndSlot
                };
                
                this.applyScheduleChange(courseData, finalPosition);
                this.renderGanttChart();
            } else {
                // 恢复原始位置
                element.style.left = `${((originalDay - 1) * 100) / 7}%`;
                element.style.top = `${(originalStartSlot - 1) * 120}px`;
                element.style.height = `${duration * 120}px`;
            }
        };
        
        // 添加鼠标事件监听器
        element.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', endDrag);
        
        // 添加触摸事件监听器
        element.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', endDrag, { passive: true });
    }
    
    showTargetHighlight(left, top, height) {
        if (!this.targetHighlight) {
            this.targetHighlight = document.createElement('div');
            this.targetHighlight.className = 'target-highlight';
            document.getElementById('gantt-container').appendChild(this.targetHighlight);
        }
        
        this.targetHighlight.style.left = `${left}%`;
        this.targetHighlight.style.top = `${top}px`;
        this.targetHighlight.style.width = `${100 / 7}%`;
        this.targetHighlight.style.height = `${height}px`;
    }
    
    hideTargetHighlight() {
        if (this.targetHighlight) {
            this.targetHighlight.remove();
            this.targetHighlight = null;
        }
    }
    
    calculateFinalPosition(left, top, height) {
        // 计算目标星期（1-7）
        const targetDay = Math.floor((left * 7) / 100) + 1;
        if (targetDay < 1 || targetDay > 7) return null;
        
        // 计算目标时间槽
        const targetStartSlot = Math.floor(top / 120) + 1;
        const targetEndSlot = Math.floor((top + height) / 120);
        
        if (targetStartSlot < 1 || targetEndSlot > this.timeSlots.length || targetStartSlot > targetEndSlot) {
            return null;
        }
        
        return {
            day: targetDay,
            startSlot: targetStartSlot,
            endSlot: targetEndSlot
        };
    }
    
    applyScheduleChange(courseData, newPosition) {
        // 找到对应的课程和安排
        const courseIndex = this.courses.findIndex(c => c.name === courseData.title);
        if (courseIndex === -1) return;
        
        const scheduleIndex = this.courses[courseIndex].schedules.findIndex(s => 
            s.day === courseData.originalDay.toString() && 
            s.time_slot === `${courseData.originalStartSlot}-${courseData.originalEndSlot}`
        );
        
        if (scheduleIndex === -1) return;
        
        // 更新课程安排
        this.courses[courseIndex].schedules[scheduleIndex].day = newPosition.day.toString();
        this.courses[courseIndex].schedules[scheduleIndex].time_slot = `${newPosition.startSlot}-${newPosition.endSlot}`;
        
        // 更新原始数据以支持后续拖拽
        courseData.originalDay = newPosition.day;
        courseData.originalStartSlot = newPosition.startSlot;
        courseData.originalEndSlot = newPosition.endSlot;
        
        this.hasUnsavedChanges = true;
    }
    
    detectConflicts() {
        const calendar = {};
        const conflicts = new Map();
        const conflictDetails = [];
        const reportedConflicts = new Set();

        for (const course of this.courses) {
            for (const schedule of course.schedules) {
                const weeks = this.parseWeeks(schedule.weeks);
                const day = schedule.day;
                const timeParts = schedule.time_slot.split('-').map(Number);

                if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
                    for (const week of weeks) {
                        for (let slot = timeParts[0]; slot <= timeParts[1]; slot++) {
                            const key = `${week}-${day}-${slot}`;
                            if (calendar[key]) {
                                const existingCourseName = calendar[key];
                                if (existingCourseName !== course.name) {
                                    const conflictKey = [existingCourseName, course.name].sort().join('-');
                                    if (!reportedConflicts.has(conflictKey)) {
                                        conflicts.set(course.name, true);
                                        conflicts.set(existingCourseName, true);
                                        conflictDetails.push({
                                            course1: existingCourseName,
                                            course2: course.name,
                                            week: week,
                                            day: day,
                                            slot: slot
                                        });
                                        reportedConflicts.add(conflictKey);
                                    }
                                }
                            } else {
                                calendar[key] = course.name;
                            }
                        }
                    }
                }
            }
        }
        this.conflictDetails = conflictDetails;
        return conflicts;
    }
    
    updateConflictWarning() {
        const warningElement = document.getElementById('conflict-warning');
        if (!warningElement) return;

        if (this.conflictDetails.length > 0) {
            let message = `检测到 ${this.conflictDetails.length} 个时间冲突！\n`;
            message += this.conflictDetails.slice(0, 5).map(c => 
                `- ${c.course1} vs ${c.course2} (第${c.week}周, 周${c.day}, ${c.slot}节)`
            ).join('\n');
            if (this.conflictDetails.length > 5) {
                message += `\n... 还有 ${this.conflictDetails.length - 5} 个冲突`;
            }
            warningElement.textContent = message;
            warningElement.style.display = 'block';
        } else {
            warningElement.style.display = 'none';
        }
    }
    
    parseWeeks(weeksStr) {
        if (!weeksStr || typeof weeksStr !== 'string') return [];
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
        return Array.from(weeks);
    }

    parseTimeToMinutes(timeStr) {
        if (!timeStr) return null;
        const [h, m] = String(timeStr).split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return h * 60 + m;
    }

    getDayRangeMinutes() {
        const times = this.timeSlots
            .map(slot => [this.parseTimeToMinutes(slot.start), this.parseTimeToMinutes(slot.end)])
            .flat()
            .filter(v => v !== null);
        if (!times.length) return { dayStartMinutes: 8 * 60, dayEndMinutes: 22 * 60 };
        return {
            dayStartMinutes: Math.min(...times),
            dayEndMinutes: Math.max(...times)
        };
    }

    getWeekAndDayFromDate(dateStr, startDate) {
        if (!dateStr || !startDate) return null;
        const examDate = new Date(`${dateStr}T00:00`);
        if (Number.isNaN(examDate.getTime())) return null;
        const diffMs = examDate - startDate;
        const week = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)) + 1;
        const day = examDate.getDay() === 0 ? 7 : examDate.getDay();
        if (!Number.isFinite(week) || week <= 0) return null;
        return { week, day };
    }

    getCourseIntervalsByDay() {
        const intervalsByDay = new Map();
        this.courses.forEach(course => {
            course.schedules.forEach(schedule => {
                const weeks = this.parseWeeks(schedule.weeks);
                if (!weeks.includes(this.currentWeek)) return;
                const day = parseInt(schedule.day, 10);
                const timeParts = String(schedule.time_slot || '').split('-').map(Number);
                if (timeParts.length !== 2) return;
                const startSlot = this.timeSlots[timeParts[0] - 1];
                const endSlot = this.timeSlots[timeParts[1] - 1];
                if (!startSlot || !endSlot) return;
                const startMin = this.parseTimeToMinutes(startSlot.start);
                const endMin = this.parseTimeToMinutes(endSlot.end);
                if (startMin === null || endMin === null || endMin <= startMin) return;
                if (!intervalsByDay.has(day)) intervalsByDay.set(day, []);
                intervalsByDay.get(day).push({ start: startMin, end: endMin });
            });
        });
        return intervalsByDay;
    }

    isExamExpired(exam) {
        if (!exam?.date || !exam?.endTime) return false;
        const end = new Date(`${exam.date}T${exam.endTime}`);
        if (Number.isNaN(end.getTime())) return false;
        return Date.now() > (end.getTime() + 24 * 60 * 60 * 1000);
    }

    isExamHidden(exam) {
        return !!exam?.hidden || this.isExamExpired(exam);
    }
    
    saveChanges() {
        // 强制执行冲突检测，确保在所有设备上都执行
        try {
            const conflictResult = this.detectConflictsForSave();
            if (conflictResult.hasConflict) {
                if (!confirm(conflictResult.message + '\n\n是否仍然保存？')) {
                    return;
                }
            }
        } catch (error) {
            console.error('冲突检测失败:', error);
            // 即使冲突检测失败，也要进行基本的数据验证
            if (!this.validateBasicCourseData()) {
                alert('课程数据格式错误，无法保存！');
                return;
            }
            // 询问用户是否要保存，因为冲突检测可能没有正常工作
            if (!confirm('警告：冲突检测可能未正常工作。\n\n是否仍然保存课程数据？')) {
                return;
            }
        }
        
        // 保存到 localStorage
        try {
            localStorage.setItem('courses', JSON.stringify(this.courses));
            this.originalCourses = JSON.parse(JSON.stringify(this.courses));
            this.hasUnsavedChanges = false;
            alert('所有更改已成功保存！');
        } catch (error) {
            console.error('保存失败:', error);
            alert('保存失败：' + error.message);
        }
    }
    
    validateBasicCourseData() {
        // 基本数据验证，确保课程数据格式正确
        for (const course of this.courses) {
            if (!course.name || !Array.isArray(course.schedules)) {
                return false;
            }
            for (const schedule of course.schedules) {
                if (!schedule.day || !schedule.time_slot || !schedule.weeks) {
                    return false;
                }
                const timeParts = schedule.time_slot.split('-').map(Number);
                if (timeParts.length !== 2 || isNaN(timeParts[0]) || isNaN(timeParts[1])) {
                    return false;
                }
            }
        }
        return true;
    }
    
    detectConflictsForSave() {
        const calendar = {};
        const conflicts = [];
        const reportedConflicts = new Set();

        // 添加调试信息
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            console.log('移动端冲突检测开始，课程数量:', this.courses.length);
        }

        for (const course of this.courses) {
            if (isMobile) {
                console.log('检测课程:', course.name, '安排数量:', course.schedules.length);
            }

            for (const schedule of course.schedules) {
                const weeks = this.parseWeeks(schedule.weeks);
                const day = schedule.day;
                const timeParts = schedule.time_slot.split('-').map(Number);

                if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
                    for (const week of weeks) {
                        for (let slot = timeParts[0]; slot <= timeParts[1]; slot++) {
                            const key = `${week}-${day}-${slot}`;
                            if (calendar[key]) {
                                const existingCourseName = calendar[key];
                                if (existingCourseName !== course.name) {
                                    const conflictKey = [existingCourseName, course.name].sort().join('-');
                                    if (!reportedConflicts.has(conflictKey)) {
                                        conflicts.push({
                                            course1: existingCourseName,
                                            course2: course.name,
                                            week: week,
                                            day: day,
                                            slot: slot
                                        });
                                        reportedConflicts.add(conflictKey);
                                    }
                                }
                            } else {
                                calendar[key] = course.name;
                            }
                        }
                    }
                }
            }
        }

        if (isMobile) {
            console.log('移动端冲突检测完成，发现冲突数量:', conflicts.length);
        }

        if (conflicts.length > 0) {
            let message = "检测到以下课程存在时间冲突：\n\n";
            conflicts.slice(0, 5).forEach(conflict => {
                message += `- '${conflict.course1}' 与 '${conflict.course2}'\n  (首次冲突于 第${conflict.week}周, 星期${conflict.day}, 第${conflict.slot}节)\n`;
            });
            if (conflicts.length > 5) {
                message += `\n... 还有 ${conflicts.length - 5} 个冲突`;
            }
            return { hasConflict: true, message: message };
        }

        return { hasConflict: false };
    }
}

// 初始化甘特图
document.addEventListener('DOMContentLoaded', function() {
    new ConflictDetectionGantt();
});
