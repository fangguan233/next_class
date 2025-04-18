// 加载时间段函数
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
                <td class="border border-gray-300 p-2"><input type="number" value="${slot.section}" ${index === 0 ? 'readonly' : ''} class="w-full p-1 border border-gray-300 rounded"></td>
                <td class="border border-gray-300 p-2"><input type="time" value="${slot.start}" class="w-full p-1 border border-gray-300 rounded"></td>
                <td class="border border-gray-300 p-2"><input type="time" value="${slot.end}" class="w-full p-1 border border-gray-300 rounded"></td>
                <td class="border border-gray-300 p-2">
                    ${index === 0 ? '' : '<button onclick="deleteTimeSlot(this)" class="px-2 py-1 text-sm bg-light-btn dark:bg-dark-btn text-white border-none rounded cursor-pointer transition-all duration-200 hover:bg-light-btnHover dark:hover:bg-dark-btnHover">删除</button>'}
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
                <td class="border border-gray-300 p-2"><input type="number" value="${slot.section}" ${index === 0 ? 'readonly' : ''} class="w-full p-1 border border-gray-300 rounded"></td>
                <td class="border border-gray-300 p-2"><input type="time" value="${slot.start}" class="w-full p-1 border border-gray-300 rounded"></td>
                <td class="border border-gray-300 p-2"><input type="time" value="${slot.end}" class="w-full p-1 border border-gray-300 rounded"></td>
                <td class="border border-gray-300 p-2">
                    ${index === 0 ? '' : '<button onclick="deleteTimeSlot(this)" class="px-2 py-1 text-sm bg-light-btn dark:bg-dark-btn text-white border-none rounded cursor-pointer transition-all duration-200 hover:bg-light-btnHover dark:hover:bg-dark-btnHover">删除</button>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // 保存默认配置到本地存储
        localStorage.setItem('timeConfig', JSON.stringify(defaultTimeConfig));
    }
}

function showAddTimeSlotForm() {
    addTimeSlot();
    updateDynamicElements();
}

function addTimeSlot() {
    const tbody = document.getElementById('time-slots-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="border border-gray-300 p-2"><input type="number" value="${tbody.children.length + 1}" class="w-full p-1 border border-gray-300 rounded"></td>
        <td class="border border-gray-300 p-2"><input type="time" class="w-full p-1 border border-gray-300 rounded"></td>
        <td class="border border-gray-300 p-2"><input type="time" class="w-full p-1 border border-gray-300 rounded"></td>
        <td class="border border-gray-300 p-2"><button onclick="deleteTimeSlot(this)" class="px-2 py-1 text-sm bg-light-btn dark:bg-dark-btn text-white border-none rounded cursor-pointer transition-all duration-200 hover:bg-light-btnHover dark:hover:bg-dark-btnHover">删除</button></td>
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
        
        // 显示结果
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = '时间段配置已保存成功！';
        resultDiv.classList.remove('hidden');
        
        // 3秒后隐藏结果
        setTimeout(() => {
            resultDiv.classList.add('hidden');
        }, 3000);
    } catch (error) {
        // 显示错误信息
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `保存失败: ${error.message}`;
        resultDiv.classList.remove('hidden');
        
        // 3秒后隐藏结果
        setTimeout(() => {
            resultDiv.classList.add('hidden');
        }, 3000);
        
        console.error("保存时间段错误:", error);
    }
}

// 保存时间配置
function saveTimeConfig() {
    const startDate = document.getElementById('start-date').value;
    if (!startDate) {
        // 显示错误信息
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = '请选择开学日期';
        resultDiv.classList.remove('hidden');
        
        // 3秒后隐藏结果
        setTimeout(() => {
            resultDiv.classList.add('hidden');
        }, 3000);
        return;
    }
    
    localStorage.setItem('startDate', new Date(startDate).toISOString());
    
    // 显示结果
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '时间配置已保存成功！';
    resultDiv.classList.remove('hidden');
    
    // 3秒后隐藏结果
    setTimeout(() => {
        resultDiv.classList.add('hidden');
    }, 3000);
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    // 加载时间配置
    const startDate = localStorage.getItem('startDate');
    if (startDate) {
        document.getElementById('start-date').value = startDate.split('T')[0];
    }
    
    // 初始化时间段表格
    const timeSlotList = document.getElementById('time-slot-list');
    if (!timeSlotList.querySelector('table')) {
        timeSlotList.innerHTML = `
            <table class="w-full border-collapse border border-gray-300 dark:border-gray-700 responsive-table">
                <thead>
                    <tr>
                        <th class="border border-gray-300 dark:border-gray-700 p-2">节次</th>
                        <th class="border border-gray-300 dark:border-gray-700 p-2">开始时间</th>
                        <th class="border border-gray-300 dark:border-gray-700 p-2">结束时间</th>
                        <th class="border border-gray-300 dark:border-gray-700 p-2">操作</th>
                    </tr>
                </thead>
                <tbody id="time-slots-body">
                    <!-- 时间段数据将在这里动态加载 -->
                </tbody>
            </table>
        `;
    }
    
    // 加载时间段数据
    loadTimeSlots();
    
    // 设置主题
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.setProperty('--scrollbar-color', '#003366');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.setProperty('--scrollbar-color', '#4096ff');
    }
    updateModeButtonText();
    updateDynamicElements();
});

// 更新主题模式按钮文本
function updateModeButtonText() {
    const modeButton = document.getElementById('dark-mode-toggle');
    if (modeButton) {
        const isDarkMode = document.documentElement.classList.contains('dark');
        modeButton.textContent = isDarkMode ? '切换到亮色模式' : '切换到暗色模式';
    }
}

// 更新动态元素
function updateDynamicElements() {
    // 更新表格样式
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        table.classList.add('responsive-table');
        if (document.documentElement.classList.contains('dark')) {
            table.style.backgroundColor = '#2d2d2d';
            table.style.color = '#fff';
        } else {
            table.style.backgroundColor = '#f9f9f9';
            table.style.color = '#333';
        }
    });
    
    // 更新表头样式
    const tableHeaders = document.querySelectorAll('th');
    tableHeaders.forEach(th => {
        if (document.documentElement.classList.contains('dark')) {
            th.style.backgroundColor = '#003366';
            th.style.color = 'white';
        } else {
            th.style.backgroundColor = '#4096ff';
            th.style.color = 'white';
        }
    });
    
    // 更新输入框样式
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        if (document.documentElement.classList.contains('dark')) {
            input.classList.add('dark:bg-gray-700', 'dark:border-gray-600', 'dark:text-white');
            input.classList.remove('bg-white', 'border-gray-300', 'text-gray-800');
        } else {
            input.classList.add('bg-white', 'border-gray-300', 'text-gray-800');
            input.classList.remove('dark:bg-gray-700', 'dark:border-gray-600', 'dark:text-white');
        }
    });
}
