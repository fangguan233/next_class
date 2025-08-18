const CACHE_NAME = '%%CACHE_NAME%%';

// 需要缓存的核心静态资源列表
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/next_class.html',
    '/edit.html',
    '/edit_time.html',
    '/app.js',
    '/next_class.js',
    '/js/edit.js',
    '/js/edit_time.js',
    '/js/cache-manager.js',
    '/js/offline-handler.js', // <--- 添加缺失的离线处理脚本
    '/vender/tailwindcss.js',
    '/vender/html2canvas.min.js',
    '/static/favicon.png'
];

// 1. 安装 Service Worker 并缓存核心资源
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Service Worker: Caching core assets');
            return cache.addAll(CORE_ASSETS);
        })
    );
    self.skipWaiting();
});

// 2. 激活 Service Worker 并清理旧缓存
self.addEventListener('activate', event => {
    console.log(`[SW] Activate event started. Current cache name should be: ${CACHE_NAME}`);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            console.log('[SW] Found existing cache names:', cacheNames);
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`[SW] Mismatch found! Old cache: "${cacheName}", New cache: "${CACHE_NAME}". This is a version update.`);
                        console.log('[SW] Deleting old cache and posting VERSION_UPDATED message to clients.');
                        
                        // 在删除缓存前，先通知客户端
                        self.clients.matchAll().then(clients => {
                            clients.forEach(client => {
                                console.log('[SW] Posting VERSION_UPDATED to client:', client.id);
                                client.postMessage({ type: 'VERSION_UPDATED' });
                            });
                        });
                        return caches.delete(cacheName);
                    } else {
                        console.log(`[SW] Cache name "${cacheName}" matches current version. No action needed.`);
                        return Promise.resolve();
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Finished cache cleanup. Claiming clients.');
            return self.clients.claim();
        })
    );
});

// 3. 拦截网络请求
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 对和风天气图标使用“网络优先，回退到缓存”策略
    if (url.hostname === 'icons.qweather.com') {
        event.respondWith(
            fetch(request).then(networkResponse => {
                // 如果请求成功，则更新缓存
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // 如果网络请求失败，则从缓存中获取
                return caches.match(request);
            })
        );
        return;
    }

    // 对 API 请求使用“网络优先，回退到缓存”策略
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // 对于成功的API请求，克隆并存入缓存
                    if (response.ok) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            // 对天气图标做特殊缓存
                            if (url.pathname.startsWith('/api/weather-icon/')) {
                                cache.put(request, responseToCache);
                            }
                        });
}
                    return response;
                })
                .catch(() => {
                    // 如果网络请求失败，通知客户端进入离线模式
                    self.clients.matchAll().then(clients => {
                        clients.forEach(client => client.postMessage({ type: 'OFFLINE_MODE' }));
});
                    
                    // 然后尝试从缓存中获取，并处理缓存未命中的情况
                    console.log(`Service Worker: Serving API request for ${url.pathname} from cache.`);
                    return caches.match(request).then(response => {
                        return response || new Response(
                            JSON.stringify({ success: false, message: 'Offline and data not available in cache.' }),
                            { status: 503, headers: { 'Content-Type': 'application/json' } }
                        );
                    });
                })
);
        return;
    }

    // 对其他所有请求（静态资源）使用“缓存优先”策略
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            // 如果缓存命中，则直接返回缓存的响应
            if (cachedResponse) {
                // console.log(`Service Worker: Serving from cache: ${request.url}`);
                return cachedResponse;
            }

            // 如果缓存未命中，则发起网络请求
            return fetch(request).then(networkResponse => {
                // 将获取到的资源放入缓存
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // 如果静态资源也获取失败，返回一个通用的离线页面或信息
                // 在这个应用中，由于核心文件都已缓存，理论上不应到这一步
                // 但作为保险，返回一个简单的错误响应
                return new Response("You are offline and this resource is not cached.", {
                    status: 404,
                    headers: { 'Content-Type': 'text/plain' }
                });
            });
        })
    );
});
