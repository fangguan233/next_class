// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    loadTimeConfig();
    loadCourses();
    
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

// 加载时间配置
function loadTimeConfig() {
    const startDate = localStorage.getItem('startDate');
    if (startDate) {
        document.getElementById('start-date').value = startDate.split('T')[0];
    }
}

// 保存时间配置
function saveTimeConfig() {
    const startDate = document.getElementById('start-date').value;
    if (!startDate) {
        showResult('请选择开学日期', 'error');
        return;
    }
    
    localStorage.setItem('startDate', new Date(startDate).toISOString());
    showResult('时间配置已保存成功！');
}

// 显示结果信息
function showResult(message, type = 'success') {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = message;
    resultDiv.classList.remove('hidden');
    
    if (type === 'error') {
        resultDiv.classList.add('bg-red-100', 'border-red-200', 'text-red-700');
        resultDiv.classList.remove('bg-light-result', 'dark:bg-dark-result', 'border-blue-100', 'dark:border-gray-700');
    } else {
        resultDiv.classList.add('bg-light-result', 'dark:bg-dark-result', 'border-blue-100', 'dark:border-gray-700');
        resultDiv.classList.remove('bg-red-100', 'border-red-200', 'text-red-700');
    }
    
    // 3秒后隐藏结果
    setTimeout(() => {
        resultDiv.classList.add('hidden');
    }, 3000);
}

// 课程管理功能
function loadCourses() {
    let courses;
    try {
        courses = JSON.parse(localStorage.getItem('courses') || '[]');
        if (!Array.isArray(courses)) throw new Error();
    } catch (e) {
        console.error("重置课程数据");
        courses = [];
        localStorage.setItem('courses', JSON.stringify(courses));
    }
    
    const courseList = document.getElementById('course-list');
    courseList.innerHTML = '';
    
    // 创建树形结构容器
    const treeContainer = document.createElement('div');
    treeContainer.className = 'tree-view space-y-4';
    
    if (courses.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'p-4 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg';
        emptyMessage.textContent = '暂无课程数据，请点击"新增课程"按钮添加课程';
        treeContainer.appendChild(emptyMessage);
    } else {
        // 为每个课程创建树节点
        courses.forEach((course, index) => {
            const courseNode = createCourseNode(course, index);
            treeContainer.appendChild(courseNode);
        });
    }
    
    courseList.appendChild(treeContainer);
}

// 创建课程节点
function createCourseNode(course, index) {
    // 创建课程节点容器
    const courseNode = document.createElement('div');
    courseNode.className = 'course-node border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md';
    courseNode.dataset.index = index;
    
    // 创建课程头部（可点击展开/折叠）
    const courseHeader = document.createElement('div');
    courseHeader.className = 'course-header flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 cursor-pointer';
    courseHeader.innerHTML = `
        <div class="font-medium">${course.name || '未命名课程'}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
            <span class="mr-2">${course.schedules && course.schedules.length > 0 ? `${course.schedules.length}个日程` : '无日程'}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transform transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    `;
    
    // 创建课程内容（默认隐藏）
    const courseContent = document.createElement('div');
    courseContent.className = 'course-content p-4 hidden';
    
    // 添加课程基本信息
    const courseInfo = document.createElement('div');
    courseInfo.className = 'mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2';
    courseInfo.innerHTML = `
        <div class="field-row">
            <span class="font-medium">课程名称:</span>
            <span>${course.name || '未设置'}</span>
        </div>
    `;
    
    // 添加日程信息
    const schedulesList = document.createElement('div');
    schedulesList.className = 'schedules-list space-y-2';
    
    if (course.schedules && course.schedules.length > 0) {
        const scheduleTitle = document.createElement('div');
        scheduleTitle.className = 'font-medium mb-2 border-b pb-1 border-gray-200 dark:border-gray-700';
        scheduleTitle.textContent = '课程日程:';
        schedulesList.appendChild(scheduleTitle);
        
        course.schedules.forEach((schedule, scheduleIndex) => {
            const scheduleItem = document.createElement('div');
            scheduleItem.className = 'schedule-item p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700';
            scheduleItem.innerHTML = `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><span class="font-medium">周数:</span> ${schedule.weeks || '未设置'}</div>
                    <div><span class="font-medium">星期:</span> ${schedule.day || '未设置'}</div>
                    <div><span class="font-medium">时间段:</span> ${schedule.time_slot || '未设置'}</div>
                    <div><span class="font-medium">校区:</span> ${schedule.campus || '未设置'}</div>
                    <div><span class="font-medium">教学楼:</span> ${schedule.building || '未设置'}</div>
                    <div><span class="font-medium">教室:</span> ${schedule.classroom || '未设置'}</div>
                </div>
            `;
            schedulesList.appendChild(scheduleItem);
        });
    } else {
        const noSchedule = document.createElement('div');
        noSchedule.className = 'text-gray-500 dark:text-gray-400 italic';
        noSchedule.textContent = '暂无日程信息';
        schedulesList.appendChild(noSchedule);
    }
    
    // 添加操作按钮
    const actionButtons = document.createElement('div');
    actionButtons.className = 'action-buttons flex space-x-2 mt-4';
    
    const editButton = document.createElement('button');
    editButton.className = 'px-3 py-2 bg-light-btn dark:bg-dark-btn hover:bg-light-btnHover dark:hover:bg-dark-btnHover text-white rounded transition-all duration-200';
    editButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        编辑
    `;
    editButton.addEventListener('click', function(e) {
        e.stopPropagation();
        editCourse(index);
    });
    
    const deleteButton = document.createElement('button');
    deleteButton.className = 'px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-all duration-200';
    deleteButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        删除
    `;
    deleteButton.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteCourse(index);
    });
    
    actionButtons.appendChild(editButton);
    actionButtons.appendChild(deleteButton);
    
    // 组装课程内容
    courseContent.appendChild(courseInfo);
    courseContent.appendChild(schedulesList);
    courseContent.appendChild(actionButtons);
    
    // 添加展开/折叠功能
    courseHeader.addEventListener('click', function() {
        courseContent.classList.toggle('hidden');
        const arrow = this.querySelector('svg');
        arrow.classList.toggle('rotate-180');
    });
    
    // 组装课程节点
    courseNode.appendChild(courseHeader);
    courseNode.appendChild(courseContent);
    
    return courseNode;
}

// 显示添加课程表单
function showAddCourseForm() {
    // 创建表单容器
    const formContainer = document.createElement('div');
    formContainer.id = 'course-form-container';
    formContainer.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    
    // 创建表单
    const form = document.createElement('div');
    form.className = 'bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto';
    form.innerHTML = `
        <h3 class="text-xl font-bold mb-4 text-gray-800 dark:text-white">添加新课程</h3>
        <form id="course-form" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">课程名称</label>
                <input type="text" id="course-name" class="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white" required>
            </div>
            
            <div id="schedules-container" class="space-y-4">
                <h4 class="text-lg font-medium text-gray-800 dark:text-white">课程日程</h4>
                <div class="schedule-item p-3 border border-gray-200 dark:border-gray-700 rounded-md">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">周数 (例如: 1-16)</label>
                            <input type="text" class="weeks-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">星期</label>
                            <select class="day-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                                <option value="">请选择</option>
                                <option value="1">周一</option>
                                <option value="2">周二</option>
                                <option value="3">周三</option>
                                <option value="4">周四</option>
                                <option value="5">周五</option>
                                <option value="6">周六</option>
                                <option value="7">周日</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">时间段 (例如: 1-2)</label>
                            <input type="text" class="time-slot-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">校区</label>
                            <input type="text" class="campus-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">教学楼</label>
                            <input type="text" class="building-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">教室</label>
                            <input type="text" class="classroom-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="flex justify-between">
                <button type="button" id="add-schedule-btn" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200">
                    添加日程
                </button>
                <div class="space-x-2">
                    <button type="button" id="cancel-btn" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200">
                        取消
                    </button>
                    <button type="submit" class="px-3 py-2 bg-light-btn dark:bg-dark-btn hover:bg-light-btnHover dark:hover:bg-dark-btnHover text-white rounded transition-all duration-200">
                        保存
                    </button>
                </div>
            </div>
        </form>
    `;
    
    formContainer.appendChild(form);
    document.body.appendChild(formContainer);
    
    // 添加事件监听器
    document.getElementById('add-schedule-btn').addEventListener('click', addScheduleItem);
    document.getElementById('cancel-btn').addEventListener('click', closeForm);
    document.getElementById('course-form').addEventListener('submit', function(e) {
        e.preventDefault();
        saveCourseForm();
    });
}

// 添加日程项
function addScheduleItem() {
    const container = document.getElementById('schedules-container');
    const scheduleCount = container.querySelectorAll('.schedule-item').length;
    
    const scheduleItem = document.createElement('div');
    scheduleItem.className = 'schedule-item p-3 border border-gray-200 dark:border-gray-700 rounded-md relative';
    scheduleItem.innerHTML = `
        <button type="button" class="remove-schedule-btn absolute top-2 right-2 text-red-500 hover:text-red-700">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">周数 (例如: 1-16)</label>
                <input type="text" class="weeks-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">星期</label>
                <select class="day-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                    <option value="">请选择</option>
                    <option value="1">周一</option>
                    <option value="2">周二</option>
                    <option value="3">周三</option>
                    <option value="4">周四</option>
                    <option value="5">周五</option>
                    <option value="6">周六</option>
                    <option value="7">周日</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">时间段 (例如: 1-2)</label>
                <input type="text" class="time-slot-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">校区</label>
                <input type="text" class="campus-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">教学楼</label>
                <input type="text" class="building-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">教室</label>
                <input type="text" class="classroom-input w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
            </div>
        </div>
    `;
    
    container.appendChild(scheduleItem);
    
    // 添加删除按钮事件
    scheduleItem.querySelector('.remove-schedule-btn').addEventListener('click', function() {
        scheduleItem.remove();
    });
}

// 关闭表单
function closeForm() {
    const formContainer = document.getElementById('course-form-container');
    if (formContainer) {
        formContainer.remove();
    }
}

// 保存课程表单
function saveCourseForm() {
    const courseName = document.getElementById('course-name').value;
    if (!courseName) {
        showResult('请输入课程名称', 'error');
        return;
    }
    
    // 获取所有日程
    const scheduleItems = document.querySelectorAll('.schedule-item');
    let schedules = Array.from(scheduleItems).map(item => {
        // 添加空值检查，防止null引用错误
        const weeksInput = item.querySelector('.weeks-input');
        const dayInput = item.querySelector('.day-input');
        const timeSlotInput = item.querySelector('.time-slot-input');
        const campusInput = item.querySelector('.campus-input');
        const buildingInput = item.querySelector('.building-input');
        const classroomInput = item.querySelector('.classroom-input');
        
        return {
            weeks: weeksInput ? weeksInput.value || '' : '',
            day: dayInput ? dayInput.value || '' : '',
            time_slot: timeSlotInput ? timeSlotInput.value || '' : '',
            campus: campusInput ? campusInput.value || '' : '',
            building: buildingInput ? buildingInput.value || '' : '',
            classroom: classroomInput ? classroomInput.value || '' : ''
        };
    });
    
    // 过滤掉空的日程项（所有字段都为空的项）
    schedules = schedules.filter(schedule => {
        return schedule.weeks.trim() !== '' || 
               schedule.day.trim() !== '' || 
               schedule.time_slot.trim() !== '' || 
               schedule.campus.trim() !== '' || 
               schedule.building.trim() !== '' || 
               schedule.classroom.trim() !== '';
    });
    
    // 获取当前课程数据
    const courses = JSON.parse(localStorage.getItem('courses') || '[]');
    
    // 检查是否是编辑模式
    const form = document.getElementById('course-form');
    if (form.dataset.mode === 'edit' && form.dataset.index) {
        // 编辑现有课程
        const index = parseInt(form.dataset.index);
        if (!isNaN(index) && index >= 0 && index < courses.length) {
            courses[index] = {
                name: courseName,
                schedules: schedules
            };
            showResult('课程更新成功！');
        } else {
            showResult('编辑失败：无效的课程索引', 'error');
            return;
        }
    } else {
        // 添加新课程
        courses.push({
            name: courseName,
            schedules: schedules
        });
        showResult('课程添加成功！');
    }
    
    // 保存到本地存储
    localStorage.setItem('courses', JSON.stringify(courses));
    
    // 关闭表单并刷新课程列表
    closeForm();
    loadCourses();
}

// 编辑课程
function editCourse(index) {
    const courses = JSON.parse(localStorage.getItem('courses') || '[]');
    const course = courses[index];
    
    if (!course) {
        showResult('未找到课程数据', 'error');
        return;
    }
    
    // 创建编辑表单
    showAddCourseForm();
    
    // 设置表单为编辑模式
    const form = document.getElementById('course-form');
    form.dataset.mode = 'edit';
    form.dataset.index = index;
    
    // 填充表单数据
    document.querySelector('#course-form-container h3').textContent = '编辑课程';
    document.getElementById('course-name').value = course.name || '';
    
    // 移除默认的日程项
    const schedulesContainer = document.getElementById('schedules-container');
    schedulesContainer.querySelectorAll('.schedule-item').forEach((item, i) => {
        if (i > 0) item.remove();
    });
    
    // 如果没有日程，保留一个空的
    if (!course.schedules || course.schedules.length === 0) {
        return;
    }
    
    // 填充第一个日程
    const firstSchedule = course.schedules[0];
    const firstScheduleItem = schedulesContainer.querySelector('.schedule-item');
    firstScheduleItem.querySelector('.weeks-input').value = firstSchedule.weeks || '';
    firstScheduleItem.querySelector('.day-input').value = firstSchedule.day || '';
    firstScheduleItem.querySelector('.time-slot-input').value = firstSchedule.time_slot || '';
    firstScheduleItem.querySelector('.campus-input').value = firstSchedule.campus || '';
    firstScheduleItem.querySelector('.building-input').value = firstSchedule.building || '';
    firstScheduleItem.querySelector('.classroom-input').value = firstSchedule.classroom || '';
    
    // 添加其他日程
    for (let i = 1; i < course.schedules.length; i++) {
        addScheduleItem();
        const scheduleItems = schedulesContainer.querySelectorAll('.schedule-item');
        const currentItem = scheduleItems[scheduleItems.length - 1];
        const schedule = course.schedules[i];
        
        currentItem.querySelector('.weeks-input').value = schedule.weeks || '';
        currentItem.querySelector('.day-input').value = schedule.day || '';
        currentItem.querySelector('.time-slot-input').value = schedule.time_slot || '';
        currentItem.querySelector('.campus-input').value = schedule.campus || '';
        currentItem.querySelector('.building-input').value = schedule.building || '';
        currentItem.querySelector('.classroom-input').value = schedule.classroom || '';
    }
}

// 删除课程
function deleteCourse(index) {
    if (!confirm('确定要删除这门课程吗？')) {
        return;
    }
    
    const courses = JSON.parse(localStorage.getItem('courses') || '[]');
    courses.splice(index, 1);
    localStorage.setItem('courses', JSON.stringify(courses));
    loadCourses();
    showResult('课程已删除');
}

// 更新主题模式按钮文本
function updateModeButtonText() {
    const modeButton = document.getElementById('mode-toggle');
    if (modeButton) {
        const isDarkMode = document.documentElement.classList.contains('dark');
        modeButton.textContent = isDarkMode ? '切换到亮色模式' : '切换到暗色模式';
    }
}

// 更新动态元素
function updateDynamicElements() {
    // 可以在这里添加其他需要根据主题更新的元素
}
