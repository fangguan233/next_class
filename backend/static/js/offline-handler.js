function handleOfflineMode() {
    // 防止重复执行
    if (document.getElementById('offline-banner')) {
        return;
    }

    console.log("Activating global offline mode UI changes.");

    // 1. 在页面顶部显示离线提示横幅
    const offlineBanner = document.createElement('div');
    offlineBanner.id = 'offline-banner';
    offlineBanner.textContent = '离线模式：部分功能可能无法使用。请连接网络后刷新。';
    offlineBanner.style.backgroundColor = '#ffc107';
    offlineBanner.style.color = 'black';
    offlineBanner.style.textAlign = 'center';
    offlineBanner.style.padding = '10px';
    offlineBanner.style.fontWeight = 'bold';
    offlineBanner.style.position = 'fixed';
    offlineBanner.style.top = '0';
    offlineBanner.style.left = '0';
    offlineBanner.style.width = '100%';
    offlineBanner.style.zIndex = '9999';
    document.body.prepend(offlineBanner);

    // 2. 禁用所有需要网络连接的按钮
    const buttonsToDisable = [
        'button[onclick="processData()"]',
        'button[onclick="importWithShareCode()"]',
        'button[onclick="shareSchedule()"]',
        '#save-changes-btn', // 编辑页的保存按钮
        '#save-btn' // 时间编辑页的保存按钮
    ];

    buttonsToDisable.forEach(selector => {
        const button = document.querySelector(selector);
        if (button) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = '离线模式下不可用';
        }
    });

}
