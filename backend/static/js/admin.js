document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');

    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const pidInfo = document.getElementById('pid-info');
    const startTimeInfo = document.getElementById('start-time-info');
    const logContainer = document.getElementById('log-container');
    const shareCodesTbody = document.getElementById('share-codes-tbody');

    const API_BASE = '/api/admin';

    // --- Core Functions ---

    async function updateStatus() {
        try {
            // Fetch and update main service status
            const statusResponse = await fetch(`${API_BASE}/status`);
            const statusData = await statusResponse.json();
            updateStatusUI(statusData);

            if (statusData.status === 'running') {
                const logsResponse = await fetch(`${API_BASE}/logs`);
                const logsData = await logsResponse.json();
                updateLogsUI(logsData);
            } else {
                logContainer.textContent = `服务当前状态: ${statusData.status}. 无日志可显示。`;
            }

            // Fetch and update share codes
            const shareCodesResponse = await fetch(`${API_BASE}/share-codes`);
            const shareCodesData = await shareCodesResponse.json();
            renderShareCodes(shareCodesData);

        } catch (error) {
            console.error('Error fetching status:', error);
            statusText.textContent = '连接错误';
            statusDot.className = 'status-dot status-crashed';
        }
    }

    function updateStatusUI(data) {
        // Reset classes
        statusDot.className = 'status-dot';
        
        pidInfo.textContent = data.pid || 'N/A';
        startTimeInfo.textContent = data.start_time || 'N/A';

        switch (data.status) {
            case 'running':
                statusText.textContent = '运行中';
                statusDot.classList.add('status-running');
                startBtn.disabled = true;
                stopBtn.disabled = false;
                break;
            case 'stopped':
                statusText.textContent = '已停止';
                statusDot.classList.add('status-stopped');
                startBtn.disabled = false;
                stopBtn.disabled = true;
                break;
            case 'crashed':
                statusText.textContent = '已崩溃';
                statusDot.classList.add('status-crashed');
                startBtn.disabled = false;
                stopBtn.disabled = true;
                break;
            default:
                statusText.textContent = '未知状态';
                statusDot.classList.add('status-stopped');
                startBtn.disabled = true;
                stopBtn.disabled = true;
        }
    }

    function updateLogsUI(data) {
        if (data.success) {
            logContainer.textContent = data.logs;
            // Auto-scroll to the bottom
            logContainer.scrollTop = logContainer.scrollHeight;
        } else {
            logContainer.textContent = `无法加载日志: ${data.logs}`;
        }
    }
async function handleStart() {
        startBtn.disabled = true;
        startBtn.textContent = '正在启动...';
        try {
            await fetch(`${API_BASE}/start`, { method: 'POST' });
            setTimeout(updateStatus, 2000); // Wait a bit before refreshing
        } catch (error) {
            console.error('Error starting server:', error);
        } finally {
            startBtn.textContent = '启动服务';
        }
    }

    async function handleStop() {
        stopBtn.disabled = true;
        stopBtn.textContent = '正在停止...';
        if (!confirm('确定要停止服务吗?')) {
            stopBtn.disabled = false;
            stopBtn.textContent = '停止服务';
            return;
        }
        try {
            await fetch(`${API_BASE}/stop`, { method: 'POST' });
            setTimeout(updateStatus, 2000); // Wait a bit before refreshing
        } catch (error) {
            console.error('Error stopping server:', error);
        } finally {
            stopBtn.textContent = '停止服务';
        }
    }

    function renderShareCodes(codes) {
        shareCodesTbody.innerHTML = ''; // Clear existing rows
        if (!codes || codes.length === 0) {
            shareCodesTbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">没有找到有效的分享码。</td></tr>';
            return;
        }

        codes.forEach(code => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800';
            
            const remainingTime = formatRemainingTime(code.expires_in_seconds);
            const timeClass = code.expires_in_seconds < 3600 ? 'text-red-500' : 'text-green-500';

            row.innerHTML = `
                <td class="p-3 font-mono">${code.code}</td>
                <td class="p-3">${code.creation_time}</td>
                <td class="p-3 ${timeClass} font-medium">${remainingTime}</td>
                <td class="p-3">
                    <button data-filename="${code.filename}" class="update-expiry-btn px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md">
                        修改时长
                    </button>
                </td>
            `;
            shareCodesTbody.appendChild(row);
        });

        // Add event listeners to the new buttons
        document.querySelectorAll('.update-expiry-btn').forEach(button => {
            button.addEventListener('click', handleUpdateExpiry);
        });
    }

    async function handleUpdateExpiry(event) {
        const filename = event.target.dataset.filename;
        const newHours = prompt("请输入新的有效小时数 (输入 'infinite' 表示永久有效):", "24");

        if (newHours === null) return; // User cancelled

        try {
            const response = await fetch(`${API_BASE}/share-codes/update-expiry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, new_expiry_hours: newHours })
            });
            const result = await response.json();
if (result.success) {
                alert("更新成功！");
                updateStatus(); // Refresh the list
            } else {
                alert(`更新失败: ${result.message}`);
            }
        } catch (error) {
            console.error('Error updating expiry:', error);
alert('更新时发生网络错误。');
        }
    }

    function formatRemainingTime(seconds) {
        if (seconds < 0) {
            const defaultHours = parseInt(document.getElementById('share-codes-tbody').dataset.defaultHours || 24);
if (defaultHours === 0) return '永久有效';
            return '已过期';
        }

        const days = Math.floor(seconds / (24 * 3600));
        seconds %= (24 * 3600);
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        const minutes = Math.floor(seconds / 60);

        if (days > 365) return '永久有效';
        if (days > 0) return `${days} 天 ${hours} 小时`;
        if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
        return `${minutes} 分钟`;
    }

    // --- Initialization ---

    startBtn.addEventListener('click', handleStart);
    stopBtn.addEventListener('click', handleStop);

    // Initial load and set interval for polling
    updateStatus();
    setInterval(updateStatus, 5000); // Refresh every 5 seconds
});
