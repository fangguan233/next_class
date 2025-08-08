document.addEventListener('DOMContentLoaded', function() {
    // 设置暗色/亮色模式
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    loadTimeSlots();
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
    div.className = 'time-slot-item flex items-center gap-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg';
    div.dataset.index = index;

    div.innerHTML = `
        <span class="font-bold w-12 text-center">第 ${slot.section} 节</span>
        <div class="flex-grow grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">开始时间</label>
                <input type="time" value="${slot.start}" data-field="start" class="w-full p-2 rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
            </div>
            <div>
                <label class="block text-sm font-medium">结束时间</label>
                <input type="time" value="${slot.end}" data-field="end" class="w-full p-2 rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
            </div>
        </div>
        <button onclick="deleteTimeSlot(${index})" class="ml-4 px-3 py-2 bg-light-btnDanger dark:bg-dark-btnDanger hover:bg-light-btnDangerHover dark:hover:bg-dark-btnDangerHover text-white rounded-md text-sm">删除</button>
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
