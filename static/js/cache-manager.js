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

            // ---- Handle UPDATE_AVAILABLE signal ----
            if (event.data.type === 'UPDATE_AVAILABLE') {
                const { payload } = event.data;
                console.log('[CacheManager] Update available. Payload:', payload);
                
                const metaTag = document.querySelector('meta[name="app-version"]');
                const currentVersion = metaTag ? metaTag.getAttribute('content') : '0.0.0';

                console.log(`[CacheManager] Current client version: ${currentVersion}, New server version: ${payload.new_version}`);

                // 决策逻辑
                if (payload.dev_mode || payload.new_version !== currentVersion) {
                    console.log('[CacheManager] Reloading page to apply updates...');
                    window.location.reload();
                } else {
                    console.log('[CacheManager] Versions match in production mode. No reload needed.');
                }
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
