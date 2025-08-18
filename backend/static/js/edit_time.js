document.addEventListener('DOMContentLoaded', function() {
    // Load initial data
    loadTimeSlots();

    // Bind events to buttons
    const addBtn = document.getElementById('add-slot-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addTimeSlot);
    }
const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTimeSlots);
    }

    // Bind template buttons
    const defaultTemplateBtn = document.getElementById('template-default');
    if (defaultTemplateBtn) {
        defaultTemplateBtn.addEventListener('click', () => applyTemplate('default'));
    }

    const standardTemplateBtn = document.getElementById('template-standard');
    if (standardTemplateBtn) {
        standardTemplateBtn.addEventListener('click', () => applyTemplate('standard'));
    }
});

function loadTimeSlots() {
    const container = document.getElementById('time-slots-container');
    const timeConfig = getTimeConfigFromStorage();
    container.innerHTML = ''; // 清空

    timeConfig.time_slots.forEach((slot, index) => {
        const slotElement = createTimeSlotElement(slot, index);
        container.appendChild(slotElement);
    });
}

function createTimeSlotElement(slot, index) {
    const div = document.createElement('div');
    // Reduce padding to p-2
    div.className = 'time-slot-item flex items-center gap-2 p-2 bg-light-card dark:bg-dark-card rounded-lg shadow-sm transition-shadow duration-200 hover:shadow-md';
    div.dataset.index = index;

    div.innerHTML = `
        <!-- Reduce width, font-size, and letter-spacing -->
        <div class="flex-shrink-0 w-16 flex items-center justify-center">
            <span class="font-semibold text-base text-light-accent dark:text-dark-accent whitespace-nowrap tracking-tight">第 ${slot.section} 节</span>
        </div>

        <div class="flex-grow flex items-center gap-2">
            <div class="flex-1 min-w-0">
                <label class="block text-xs font-medium text-gray-500 mb-1">开始时间</label>
                <input type="time" value="${slot.start}" data-field="start" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent">
            </div>
            <div class="flex-1 min-w-0">
                <label class="block text-xs font-medium text-gray-500 mb-1">结束时间</label>
                <input type="time" value="${slot.end}" data-field="end" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder transition-all duration-200 focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent">
            </div>
        </div>
        
        <!-- Reduce padding -->
        <button onclick="deleteTimeSlot(${index})" class="flex-shrink-0 px-3 py-2 bg-light-btnDanger dark:bg-dark-btnDanger hover:bg-light-btnDangerHover dark:hover:bg-dark-btnDangerHover text-white rounded-md font-semibold text-sm transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95">
            删除
        </button>
    `;
    return div;
}

function addTimeSlot() {
    const timeConfig = getTimeConfigFromStorage();
    const newSection = timeConfig.time_slots.length + 1;
    timeConfig.time_slots.push({
        section: newSection,
        start: "22:00",
        end: "22:45"
    });
    updateAndReload(timeConfig);
}

function deleteTimeSlot(index) {
    if (!confirm(`确定要删除第 ${index + 1} 节课的时间安排吗？`)) return;
    const timeConfig = getTimeConfigFromStorage();
    timeConfig.time_slots.splice(index, 1);
    // 更新后续节数的 section 号
    for (let i = index; i < timeConfig.time_slots.length; i++) {
        timeConfig.time_slots[i].section = i + 1;
    }
    updateAndReload(timeConfig);
}

function saveTimeSlots() {
    try {
        const timeConfig = getTimeConfigFromStorage();
        const newTimeSlots = [];
        const slotElements = document.querySelectorAll('.time-slot-item');
        
        slotElements.forEach(el => {
            const index = parseInt(el.dataset.index, 10);
            const section = timeConfig.time_slots[index].section;
            const start = el.querySelector('[data-field="start"]').value;
            const end = el.querySelector('[data-field="end"]').value;
            newTimeSlots.push({ section, start, end });
        });

        timeConfig.time_slots = newTimeSlots;
        localStorage.setItem('timeConfig', JSON.stringify(timeConfig));
        alert('时间段已成功保存！');
        loadTimeSlots(); // 重新加载以刷新UI
    } catch (error) {
        console.error("保存时间段失败:", error);
        alert('保存失败，请检查控制台获取更多信息。');
    }
}


// --- 辅助函数 ---
function getTimeConfigFromStorage() {
    const stored = localStorage.getItem('timeConfig');
    if (stored) {
        return JSON.parse(stored);
    }
    // 如果没有，返回一个默认结构
    return {
        config_id: "default",
        time_slots: []
    };
}

function updateAndReload(timeConfig) {
    localStorage.setItem('timeConfig', JSON.stringify(timeConfig));
    loadTimeSlots();
}

const TIME_TEMPLATES = {
    'default': {
        config_id: "default_820",
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
    },
    'standard': {
        config_id: "standard_800",
        time_slots: [
            { section: 1, start: "08:00", end: "08:45" },
            { section: 2, start: "08:55", end: "09:40" },
            { section: 3, start: "10:00", end: "10:45" },
            { section: 4, start: "10:55", end: "11:40" },
            { section: 5, start: "14:00", end: "14:45" },
            { section: 6, start: "14:55", end: "15:40" },
            { section: 7, start: "16:00", end: "16:45" },
            { section: 8, start: "16:55", end: "17:40" },
            { section: 9, start: "19:00", end: "19:45" },
            { section: 10, start: "19:55", end: "20:40" },
            { section: 11, start: "20:50", end: "21:35" }
        ]
    }
};

function applyTemplate(templateName) {
    if (!TIME_TEMPLATES[templateName]) {
        alert("未找到指定的模板！");
        return;
    }

    if (confirm("应用新模板将覆盖当前所有时间段设置，确定要继续吗？")) {
        const newTimeConfig = TIME_TEMPLATES[templateName];
        updateAndReload(newTimeConfig);
        alert("模板已成功应用！");
    }
}
