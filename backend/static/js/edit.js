document.addEventListener('DOMContentLoaded', function() {
    // 设置暗色/亮色模式
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    loadCourses();
});

function loadCourses() {
    const coursesContainer = document.getElementById('courses-container');
    const storedCourses = localStorage.getItem('courses');
    if (!storedCourses) {
        coursesContainer.innerHTML = '<p class="text-center">没有找到课程数据。请先返回主页导入。</p>';
        return;
    }

    try {
        const courses = JSON.parse(storedCourses);
        coursesContainer.innerHTML = ''; // 清空现有内容
        courses.forEach((course, index) => {
            const courseElement = createCourseElement(course, index);
            coursesContainer.appendChild(courseElement);
        });
    } catch (error) {
        console.error("加载课程数据失败:", error);
        coursesContainer.innerHTML = '<p class="text-center text-red-500">加载课程数据失败，数据格式可能已损坏。</p>';
    }
}

function createCourseElement(course, index) {
    const courseDiv = document.createElement('div');
    courseDiv.className = 'course-item p-4 bg-gray-100 dark:bg-gray-800 rounded-lg shadow';
    courseDiv.dataset.courseIndex = index;

    let schedulesHtml = course.schedules.map((schedule, sIndex) => createScheduleElement(schedule, index, sIndex)).join('');

    courseDiv.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium">课程代码</label>
                <input type="text" value="${course.code}" data-field="code" class="w-full p-2 rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
            </div>
            <div>
                <label class="block font-medium">课程名称</label>
                <input type="text" value="${course.name}" data-field="name" class="w-full p-2 rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
            </div>
            <div>
                <label class="block font-medium">教师</label>
                <input type="text" value="${course.teachers.join(', ')}" data-field="teachers" class="w-full p-2 rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
            </div>
        </div>
        <h3 class="text-lg font-semibold mt-4 mb-2">上课安排</h3>
        <div class="schedules-container space-y-3">${schedulesHtml}</div>
        <div class="mt-4 flex justify-end gap-2">
            <button onclick="addSchedule(${index})" class="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md">添加安排</button>
            <button onclick="deleteCourse(${index})" class="px-4 py-2 text-sm bg-light-btnDanger dark:bg-dark-btnDanger hover:bg-light-btnDangerHover dark:hover:bg-dark-btnDangerHover text-white rounded-md">删除课程</button>
        </div>
    `;
    return courseDiv;
}

function createScheduleElement(schedule, courseIndex, scheduleIndex) {
    return `
        <div class="schedule-item p-3 bg-gray-200 dark:bg-gray-700 rounded-md" data-schedule-index="${scheduleIndex}">
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                    <label class="text-sm font-medium">周数</label>
                    <input type="text" value="${schedule.weeks}" data-field="weeks" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
                </div>
                <div>
                    <label class="text-sm font-medium">星期</label>
                    <input type="text" value="${schedule.day}" data-field="day" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
                </div>
                <div>
                    <label class="text-sm font-medium">节数</label>
                    <input type="text" value="${schedule.time_slot}" data-field="time_slot" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
                </div>
                <div>
                    <label class="text-sm font-medium">校区</label>
                    <input type="text" value="${schedule.campus}" data-field="campus" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
                </div>
                <div>
                    <label class="text-sm font-medium">教学楼</label>
                    <input type="text" value="${schedule.building}" data-field="building" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
                </div>
                <div>
                    <label class="text-sm font-medium">教室</label>
                    <input type="text" value="${schedule.classroom}" data-field="classroom" class="w-full p-1.5 text-sm rounded bg-light-input dark:bg-dark-input border border-light-inputBorder dark:border-dark-inputBorder">
                </div>
            </div>
            <div class="mt-3 text-right">
                <button onclick="deleteSchedule(${courseIndex}, ${scheduleIndex})" class="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-md">删除此安排</button>
            </div>
        </div>
    `;
}

function addCourse() {
    const newCourse = {
        code: "NEW101",
        name: "新课程",
        teachers: ["新教师"],
        schedules: [{
            weeks: "1-16",
            day: "1",
            time_slot: "1-2",
            campus: "主校区",
            building: "教学楼A",
            classroom: "101"
        }]
    };
    const courses = getCoursesFromStorage();
    courses.push(newCourse);
    updateAndReload(courses);
}

function addSchedule(courseIndex) {
    const newSchedule = {
        weeks: "1-16",
        day: "1",
        time_slot: "1-2",
        campus: "主校区",
        building: "教学楼A",
        classroom: "101"
    };
    const courses = getCoursesFromStorage();
    courses[courseIndex].schedules.push(newSchedule);
    updateAndReload(courses);
}

function deleteCourse(courseIndex) {
    if (!confirm("确定要删除这门课程吗？")) return;
    const courses = getCoursesFromStorage();
    courses.splice(courseIndex, 1);
    updateAndReload(courses);
}

function deleteSchedule(courseIndex, scheduleIndex) {
    if (!confirm("确定要删除这个上课安排吗？")) return;
    const courses = getCoursesFromStorage();
    courses[courseIndex].schedules.splice(scheduleIndex, 1);
    updateAndReload(courses);
}

function saveAllChanges() {
    try {
        const courses = [];
        const courseElements = document.querySelectorAll('.course-item');
        courseElements.forEach(courseEl => {
            const course = {
                code: courseEl.querySelector('[data-field="code"]').value,
                name: courseEl.querySelector('[data-field="name"]').value,
                teachers: courseEl.querySelector('[data-field="teachers"]').value.split(',').map(t => t.trim()),
                schedules: []
            };
            const scheduleElements = courseEl.querySelectorAll('.schedule-item');
            scheduleElements.forEach(scheduleEl => {
                const schedule = {
                    weeks: scheduleEl.querySelector('[data-field="weeks"]').value,
                    day: scheduleEl.querySelector('[data-field="day"]').value,
                    time_slot: scheduleEl.querySelector('[data-field="time_slot"]').value,
                    campus: scheduleEl.querySelector('[data-field="campus"]').value,
                    building: scheduleEl.querySelector('[data-field="building"]').value,
                    classroom: scheduleEl.querySelector('[data-field="classroom"]').value
                };
                course.schedules.push(schedule);
            });
            courses.push(course);
        });
        localStorage.setItem('courses', JSON.stringify(courses));
        alert('所有更改已成功保存！');
        loadCourses(); // 重新加载以确保UI同步
    } catch (error) {
        console.error("保存失败:", error);
        alert('保存失败，请检查控制台获取更多信息。');
    }
}

// --- 辅助函数 ---
function getCoursesFromStorage() {
    const storedCourses = localStorage.getItem('courses');
    return storedCourses ? JSON.parse(storedCourses) : [];
}

function updateAndReload(courses) {
    localStorage.setItem('courses', JSON.stringify(courses));
    loadCourses();
}
