// =============================================================================
// TechGuide Service Worker — v5-roles (v1.7)
// Strategy: network-first for HTML/JS/CSS so updates ship instantly.
// Cache is only used as offline fallback.
// On activate, ALL previous caches are deleted so old monolithic index.html
// can never resurrect from disk.
// Firebase SDK modules from gstatic.com are cached on first successful fetch
// so login keeps working offline once the user has logged in at least once.
// =============================================================================

const CACHE_NAME = 'techguide-v70-ia-rag-v2';
const SCOPE = '/techguide/';

// Files we want available offline as a last resort.
const OFFLINE_ASSETS = [
  SCOPE,
  SCOPE + 'index.html',
  SCOPE + 'vendors.js',
  SCOPE + 'catalog.js',
  SCOPE + 'manifest.json',
  SCOPE + 'icon-192.png',
  SCOPE + 'icon-512.png'
];

// ---------------------------------------------------------------------------
// INSTALL — pre-cache offline assets, then take over immediately.
// ---------------------------------------------------------------------------
self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      // Add each asset individually so one 404 doesn't break the whole install.
      return Promise.all(OFFLINE_ASSETS.map(function(url){
        return cache.add(url).catch(function(err){
          console.warn('[SW] Failed to pre-cache', url, err);
        });
      }));
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

// ---------------------------------------------------------------------------
// ACTIVATE — delete every cache that isn't the current one, then claim clients.
// This is what kills the old monolithic cache from previous installs.
// [v1.9.19] After activating, broadcast a RELOAD message to all clients so
// that anyone with the app open auto-refreshes to the new version.
// ---------------------------------------------------------------------------
self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.map(function(name){
          if(name !== CACHE_NAME){
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(function(){
      return self.clients.claim();
    }).then(function(){
      // [v1.9.19] Tell every open tab to reload itself to pick up the new code.
      return self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(clients){
        clients.forEach(function(client){
          try{
            client.postMessage({type: 'SW_UPDATED', cache: CACHE_NAME});
          }catch(e){ /* ignore */ }
        });
      });
    })
  );
});

// ---------------------------------------------------------------------------
// FETCH — network-first for HTML/JS/CSS, cache-first for everything else
// (mostly images, but those live in catalog.js as base64 so this is rarely hit).
// Firebase SDK modules (gstatic.com) get cache-after-fetch so login works
// offline once the SDK was loaded at least once.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', function(event){
  const req = event.request;

  // Only handle GET requests.
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  
  // [v1.9.25.3] Ignorar esquemas no-http (chrome-extension://, moz-extension://,
  // data:, blob:, etc). Cache API NO los soporta y truena con TypeError global
  // que rompe el catch de generateFlyerImage haciendo aparecer "Error: undefined".
  if(url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Firebase SDK from gstatic.com — cache first, fall back to network.
  if(url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0){
    event.respondWith(
      caches.match(req).then(function(cached){
        if(cached) return cached;
        return fetch(req).then(function(response){
          if(response && response.status === 200){
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache){
              return cache.put(req, clone);
            }).catch(function(err){
              // [v1.9.25.3] Silenciar errores de cache (ej. quota, esquemas raros)
              // para evitar unhandled rejections que rompen el manejo de errores global.
              console.warn('[SW] cache.put falló:', err && err.message);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Firestore / Firebase API calls — always network, never cache.
  if(url.hostname.indexOf('firestore.googleapis.com') >= 0 ||
     url.hostname.indexOf('firebaseio.com') >= 0 ||
     url.hostname.indexOf('firebase.googleapis.com') >= 0){
    return; // Let the browser handle it directly.
  }

  const isAppAsset = /\.(html|js|css)(\?.*)?$/i.test(url.pathname) ||
                     url.pathname === SCOPE ||
                     url.pathname === SCOPE + '';

  if(isAppAsset){
    // Network-first: always try the network, fall back to cache if offline.
    event.respondWith(
      fetch(req).then(function(response){
        // Clone and stash a copy in cache for offline fallback.
        if(response && response.status === 200 && response.type === 'basic'){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            return cache.put(req, clone);
          }).catch(function(err){
            console.warn('[SW] cache.put falló:', err && err.message);
          });
        }
        return response;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || caches.match(SCOPE + 'index.html');
        });
      })
    );
  } else {
    // For non-app assets, try cache first, then network.
    event.respondWith(
      caches.match(req).then(function(cached){
        return cached || fetch(req);
      })
    );
  }
});
