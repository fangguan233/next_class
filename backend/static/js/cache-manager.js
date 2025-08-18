// --- Global Offline and Update Manager ---

(function() {
    // --- Offline Mode Handler ---
    
    let offlineHandlerLoaded = false;

    function loadAndRunOfflineHandler() {
        if (!offlineHandlerLoaded) {
            offlineHandlerLoaded = true;
            const script = document.createElement('script');
            script.src = '/js/offline-handler.js';
            script.onload = () => {
                if (typeof handleOfflineMode === 'function') handleOfflineMode();
            };
            document.head.appendChild(script);
        } else {
            if (typeof handleOfflineMode === 'function') handleOfflineMode();
        }
    }

    // --- Message Listener ---
    if ('serviceWorker'in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            console.log('[CacheManager] Received message from SW:', event.data); // 添加了这一行来记录所有消息

            if (!event.data || !event.data.type) return;
// ---- Handle OFFLINE signal ----
            if (event.data.type === 'OFFLINE_MODE') {
                console.log('Received OFFLINE_MODE message from Service Worker.');
                loadAndRunOfflineHandler();
                return;
            }

            // ---- Handle VERSION_UPDATED signal ----
            if (event.data.type === 'VERSION_UPDATED') {
                console.log('New version has been activated. Reloading page to apply updates...');
                
                // 强制重新加载页面以使用新的静态文件
                // 用户的 localStorage 数据不会被触动
                window.location.reload();
                return;
            }
        });
    }

    // --- Initial Offline Check on Load ---
    if (!navigator.onLine) {
        console.log('Browser is offline on page load.');
        loadAndRunOfflineHandler();
    }
})();
