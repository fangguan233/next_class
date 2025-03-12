// 新增 loadTimeSlots 函数
function loadTimeSlots() {
    try {
        let storedData = localStorage.getItem('timeConfig');

        if (!storedData) {
            throw new Error("未找到时间配置数据");
        }

        // 兼容旧格式
        let timeConfig = JSON.parse(storedData);
        if (Array.isArray(timeConfig)) {
            timeConfig = { 
                config_id: "legacy_config",
                time_slots: timeConfig 
            };
            localStorage.setItem('timeConfig', JSON.stringify(timeConfig));
        }

        // 校验数据是否为对象且包含有效的 time_slots 数组
        if (typeof timeConfig !== 'object' || 
            !Array.isArray(timeConfig.time_slots) || 
            !timeConfig.time_slots.every(slot => slot.section && slot.start && slot.end)) {
            console.warn("时间配置数据格式不正确，尝试修复...");
            // 尝试修复：如果 timeConfig.time_slots 存在但格式不完整，则使用默认值补充
            timeConfig.time_slots = Array.isArray(timeConfig.time_slots)
                ? timeConfig.time_slots.filter(slot => slot.section && slot.start && slot.end)
                : [];
            if (timeConfig.time_slots.length === 0) {
                throw new Error("无法修复时间配置数据");
            }
        }

        const tbody = document.getElementById('time-slots-body');
        tbody.innerHTML = '';

        timeConfig.time_slots.forEach((slot, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="number" value="${slot.section}" ${index === 0 ? 'readonly' : ''}></td>
                <td><input type="time" value="${slot.start}"></td>
                <td><input type="time" value="${slot.end}"></td>
                <td>
                    ${index === 0 ? '' : '<button onclick="deleteTimeSlot(this)">删除</button>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("时间配置数据无效，重置为默认配置", e.message);
        // 使用默认时间配置
        const defaultTimeConfig = {
            config_id: "default",
            time_slots: [
                { section: 1, start: "08:00", end: "08:45" },
                { section: 2, start: "08:55", end: "09:40" },
                { section: 3, start: "09:50", end: "10:35" },
                { section: 4, start: "10:45", end: "11:30" },
                { section: 5, start: "11:40", end: "12:25" },
                { section: 6, start: "12:35", end: "13:20" },
                { section: 7, start: "13:30", end: "14:15" },
                { section: 8, start: "14:25", end: "15:10" },
                { section: 9, start: "15:20", end: "16:05" },
                { section: 10, start: "16:15", end: "17:00" },
                { section: 11, start: "17:10", end: "17:55" },
                { section: 12, start: "18:05", end: "18:50" },
                { section: 13, start: "19:00", end: "19:45" },
                { section: 14, start: "19:55", end: "20:40" }
            ]
        };
        const tbody = document.getElementById('time-slots-body');
        tbody.innerHTML = '';
        defaultTimeConfig.time_slots.forEach((slot, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="number" value="${slot.section}" ${index === 0 ? 'readonly' : ''}></td>
                <td><input type="time" value="${slot.start}"></td>
                <td><input type="time" value="${slot.end}"></td>
                <td>
                    ${index === 0 ? '' : '<button onclick="deleteTimeSlot(this)">删除</button>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function addTimeSlot() {
const tbody = document.getElementById('time-slots-body');
const tr = document.createElement('tr');
tr.innerHTML = `
    <td><input type="number" value="${tbody.children.length + 1}"></td>
    <td><input type="time"></td>
    <td><input type="time"></td>
    <td><button onclick="deleteTimeSlot(this)">删除</button></td>
`;
tbody.appendChild(tr);
}

function deleteTimeSlot(button) {
button.closest('tr').remove();
}

// 修复保存逻辑
function saveTimeSlots() {
    try {
        const slots = Array.from(document.querySelectorAll('#time-slots-body tr')).map(tr => {
            const inputs = tr.querySelectorAll('input');
            const section = parseInt(inputs[0].value);
            const start = inputs[1].value;
            const end = inputs[2].value;

            if (isNaN(section) || section < 1 || section > 14) {
                throw new Error(`无效的节次: ${inputs[0].value}`);
            }
            if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(start) || 
                !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(end)) {
                throw new Error(`时间格式错误: ${start}-${end}`);
            }

            return { section, start, end };
        });

        const uniqueSlots = [...new Set(slots.map(s => s.section))];
        if (uniqueSlots.length !== slots.length) {
            throw new Error("存在重复的节次配置");
        }

        // 修改存储结构，增加 config_id
        const configData = {
            config_id: "custom", // 或从原有配置继承
            time_slots: slots.sort((a, b) => a.section - b.section)
        };

        localStorage.setItem('timeConfig', JSON.stringify(configData));
        alert('时间段配置已保存');
    } catch (error) {
        alert(`保存失败: ${error.message}`);
        console.error("保存时间段错误:", error);
    }
}
