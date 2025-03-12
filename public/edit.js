// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    loadTimeConfig();
    loadCourses();
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
    localStorage.setItem('startDate', new Date(startDate).toISOString());
    alert('时间配置已保存');
}

// 课程管理功能
async function loadCourses() {
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

    courses.forEach((course, index) => {
        const div = document.createElement('div');
        div.className = 'course';
        div.innerHTML = `
            <h3>${course.name}</h3>
            <button onclick="editCourse(${index})">编辑该课程</button>
            <button onclick="deleteCourse(${index})">删除该课程</button>
            <div id="course-${index}" style="display: none;">
                <input type="text" value="${course.name}" id="course-name-${index}">
                <div id="schedules-${index}">
                    ${course.schedules.map((schedule, sIndex) => `
                        <div id="schedule-${index}-${sIndex}">
                            <input type="text" value="${schedule.weeks}" placeholder="周数">
                            <input type="text" value="${schedule.day}" placeholder="星期">
                            <input type="text" value="${schedule.time_slot}" placeholder="时间段">
                            <input type="text" value="${schedule.campus}" placeholder="校区">
                            <input type="text" value="${schedule.building}" placeholder="教学楼">
                            <input type="text" value="${schedule.classroom}" placeholder="教室">
                            <button onclick="removeSchedule(${index}, ${sIndex})">删除该日程</button>
                        </div>
                    `).join('')}
                </div>
                <button onclick="addSchedule(${index})">新增日程</button>
                <button onclick="saveCourse(${index})">保存</button>
            </div>
        `;
        courseList.appendChild(div);
    });
}

// 编辑课程
function editCourse(index) {
    const courseDiv = document.getElementById(`course-${index}`);
    courseDiv.style.display = 'block';
    const editButton = courseDiv.parentElement.querySelector('button:nth-child(2)');
    editButton.style.display = 'none';
}

// 新增日程
function addSchedule(courseIndex) {
    const schedulesDiv = document.getElementById(`schedules-${courseIndex}`);
    const sIndex = schedulesDiv.children.length;
    const newSchedule = document.createElement('div');
    newSchedule.id = `schedule-${courseIndex}-${sIndex}`;
    newSchedule.innerHTML = `
        <input type="text" placeholder="周数">
        <input type="text" placeholder="星期">
        <input type="text" placeholder="时间段">
        <input type="text" placeholder="校区">
        <input type="text" placeholder="教学楼">
        <input type="text" placeholder="教室">
        <button onclick="removeSchedule(${courseIndex}, ${sIndex})">删除该日程</button>
    `;
    schedulesDiv.appendChild(newSchedule);
}

// 删除日程
function removeSchedule(courseIndex, scheduleIndex) {
    const scheduleDiv = document.getElementById(`schedule-${courseIndex}-${scheduleIndex}`);
    scheduleDiv.remove();
}

// 保存课程
function saveCourse(index) {
    const courses = JSON.parse(localStorage.getItem('courses') || '[]');
    const courseName = document.getElementById(`course-name-${index}`).value;
    const schedulesDiv = document.getElementById(`schedules-${index}`);
    const schedules = Array.from(schedulesDiv.children).map(scheduleDiv => {
        const inputs = scheduleDiv.querySelectorAll('input');
        return {
            weeks: inputs[0].value,
            day: inputs[1].value,
            time_slot: inputs[2].value,
            campus: inputs[3].value,
            building: inputs[4].value,
            classroom: inputs[5].value,
        };
    });

    courses[index] = { name: courseName, schedules };
    localStorage.setItem('courses', JSON.stringify(courses));
    alert('课程已保存');
    loadCourses();
}

// 删除课程
function deleteCourse(index) {
    const courses = JSON.parse(localStorage.getItem('courses') || '[]');
    if (index >= 0 && index < courses.length) {
        courses.splice(index, 1);
        localStorage.setItem('courses', JSON.stringify(courses));
        loadCourses();
        alert('课程已删除');
    } else {
        alert('无效的课程索引');
    }
}