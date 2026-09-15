// =============================================================================
// TechGuide Service Worker — v5-roles (v1.7)
// Strategy: stale-while-revalidate para HTML/CSS (apertura instantánea desde
// caché + revalidación en segundo plano; updates llegan vía SW_UPDATED/BUILD_ID).
// Bundles pesados (catalog/vendors/catalog-img) cache-first con ?v=BUILD_ID.
// On activate, ALL previous caches are deleted so old monolithic index.html
// can never resurrect from disk.
// Firebase SDK modules from gstatic.com are cached on first successful fetch
// so login keeps working offline once the user has logged in at least once.
// =============================================================================

const CACHE_NAME = 'techguide-v1631-img-ready';
// [v1.11.103] Caché SEPARADO y ESTABLE para los pesados que NO cambian entre
// versiones: vendors.js (999KB, html2canvas+jsPDF) y catalog-img.js (866KB,
// las fotos del catálogo). Antes vivían en CACHE_NAME, así que CADA bump
// tiraba el caché entero y los volvía a bajar: 1.8MB inútiles por versión,
// compitiendo con las imágenes que el asesor está esperando ver. Este caché
// solo se invalida cuando su propia versión cambia, no en cada release.
const CACHE_ESTABLE = 'techguide-estable-v1';
const SCOPE = '/techguide/';
// [v1.36] IMG_BUILD — sello propio de catalog-img.js. El archivo vive en
// CACHE_ESTABLE SIN ?v= (v1.11.103) para que un bump normal no lo re-baje:
// pesa 886 KB y ponerlo en cada release tardaba minutos en red movil.
// El efecto colateral: una foto NUEVA nunca llegaba a quien ya lo tenia
// cacheado — el install hacia `if(hit) return` y se quedaba con la copia
// vieja para siempre. Ahora se compara este sello: solo cuando cambian las
// FOTOS se vuelve a bajar catalog-img.js. vendors.js sigue intacto.
// Subir SOLO al agregar o reemplazar imagenes en catalog-img.js.
const IMG_BUILD = '2026-08-29-redmi17';
// [v1.38] APP_JS_V — sello de CONTENIDO de app.js (sha1 corto).
// app.js pesa 579 KB y su clave de precache llevaba el BUILD_ID, asi que cada
// bump lo re-bajaba completo AUNQUE EL ARCHIVO FUERA IDENTICO. En la ultima
// semana cambio catalog.js cinco veces y app.js viajo las cinco: ~2.9 MB por
// asesor, por 2,000 asesores, para nada. Ahora vive en CACHE_ESTABLE (que
// sobrevive a los bumps) sellado por su contenido: solo se vuelve a bajar
// cuando app.js cambia de verdad.
// DEBE coincidir con window.APP_JS_V del index.html. Al editar app.js hay que
// subir este valor en LOS DOS archivos.
const APP_JS_V = '0b6f414fdd';
// [v1.10.30] BUILD_ID — DEBE coincidir con window.BUILD_ID del index.html.
// El HTML le pregunta al SW este valor; si no coinciden, el HTML está viejo
// y se fuerza recarga. Al empacar cada versión se actualiza igual que CACHE_NAME.
const BUILD_ID = '1790053200';

// Files we want available offline as a last resort.
// [v1.10.35] catalog.js y vendors.js se precachean CON ?v=BUILD_ID porque la
// app los pide así. Si se cachearan sin querystring, el cache-first nunca
// acertaría (la app pide ?v=123, el caché tendría la URL pelona) y se bajarían
// de la red en cada arranque — justo el bug de lentitud que esto corrige.
const OFFLINE_ASSETS = [
  /* [v1.35] Las pantallas de Comisiones salieron del precache: están ocultas
     (COMISIONES_OFF=true) y sumaban 302 KB que se bajaban en CADA bump sin que
     nadie las abriera. Siguen en el repo y se cachean solas la primera vez que
     alguien las visite, cuando se reactive el módulo. */
  SCOPE,
  SCOPE + 'index.html',
  // [v1.13] Catálogo público para clientes. Va al precache para que el asesor
  // pueda abrirlo y verificarlo aunque esté sin señal en la tienda.
  SCOPE + 'catalogo.html',
  // [v1.12.0] Esquema 2026: motor, captura de venta y captura de cuotas.
  // [v1.11.62] incentivos.js va SIN ?v=: es chico y se sirve stale-while-revalidate
  // para que los tableros (que no tienen BUILD_ID propio) puedan pedirlo igual.
  SCOPE + 'incentivos.js',
  // [v1.63] catalog-img.js ahora son 3 KB de rutas: precache normal.
  SCOPE + 'catalog-img.js',
  // [v1.39] estructura-pacifico.js NO va aqui a proposito: son 45 KB que solo
  // necesita direccion nacional al aplicar la estructura. Se carga bajo demanda.
  // [v1.12.3] UI compartida de los tableros de comisiones (drawer). Sin ?v=:
  // igual que incentivos.js, stale-while-revalidate.
  // [v1.38] app.js ya NO va aqui: vive en CACHE_ESTABLE sellado por contenido.
  SCOPE + 'catalog.js?v=' + BUILD_ID,
  // vendors.js y catalog-img.js viven en CACHE_ESTABLE (ver abajo): no se
  // vuelven a bajar en cada versión.
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
      })).then(function(){
        /* [v1.45] ESTO CAUSABA EL AVISO DE ACTUALIZACION QUE NO SE IBA.
           En v1.37 hice que el install ABORTARA si faltaba un critico. La idea
           era no activar un SW a medias. El efecto real fue peor: si un solo
           archivo fallaba al bajar —propagacion del CDN, un corte de medio
           segundo— el SW nuevo NUNCA se instalaba. El SW viejo seguia mandando
           con su BUILD_ID anterior, el HTML si se refrescaba al nuevo, y el
           handshake veia HTML != SW: aviso de actualizacion permanente. Darle
           a "Actualizar" borraba todo, volvia a intentar, volvia a fallar.
           Ya no hace falta abortar: el FIX de v1.37 en el fetch garantiza que
           respondWith NUNCA resuelva a undefined, asi que un precache
           incompleto ya no deja la pantalla en blanco — solo obliga a ir a red.
           Ahora se REINTENTA con cache:'reload' y, si aun asi falta, se instala
           igual y se deja constancia en consola. */
        var CRITICOS = [
          SCOPE + 'index.html',
          SCOPE + 'catalog.js?v=' + BUILD_ID
        ];
        return Promise.all(CRITICOS.map(function(u){
          return cache.match(u).then(function(hit){
            if(hit) return true;
            return cache.add(u).then(function(){ return true; }).catch(function(){
              // Segundo intento saltandose la cache HTTP del navegador.
              return fetch(u, {cache:'reload'}).then(function(r){
                if(r && r.status === 200) return cache.put(u, r).then(function(){ return true; });
                return u;
              }).catch(function(){ return u; });
            });
          });
        })).then(function(res){
          var faltan = res.filter(function(x){ return x !== true; });
          if(faltan.length){
            console.warn('[SW] precache incompleto, se instala igual:', faltan.join(', '));
          }
        });
      });
    }).then(function(){
      // [v1.11.103] Los pesados se guardan en su propio caché y NO se esperan:
      // la app queda usable de inmediato y estos llegan en segundo plano.
      // Si ya estaban (versión anterior), no se vuelven a pedir.
      caches.open(CACHE_ESTABLE).then(function(ce){
        // Se guardan SIN ?v= para que la clave coincida con la del fetch.
        // [v1.37] Devuelve true SOLO si el archivo quedo guardado. Antes se
        // tragaba el error y devolvia undefined, asi que el sello de imagenes
        // se marcaba como al dia aunque la descarga hubiera fallado: las fotos
        // nuevas no llegaban nunca y no habia forma de reintentar.
        var bajarEstable = function(f){
          var url = SCOPE + f;
          return fetch(url).then(function(r){
            if(r && r.status === 200) return ce.put(url, r).then(function(){ return true; });
            return false;
          }).catch(function(err){
            console.warn('[SW] estable falló', f, err && err.message);
            return false;
          });
        };
        /* [v1.62] vendors.js YA NO se baja aquí.
           Pesa 999 KB (html2canvas + jsPDF + XLSX + Chart) y la pagina ya lo
           carga solo cuando hace falta, con loadVendors(). Pero este install lo
           bajaba igual en segundo plano, asi que la carga diferida quedaba
           anulada a nivel de red: en la PRIMERA apertura competia por el ancho
           de banda con el asesor que estaba tratando de cotizar, y la mayoria
           nunca genera un PDF.
           Ahora sigue el mismo patron que los modelos 3D: se cachea al primer
           uso real, por el fetch handler (esEstable lo cubre). Y para no
           perder el PDF sin senal, la pagina lo precarga en reposo mucho
           despues de arrancar — ver precargarVendors() en app.js. */
        // [v1.38] app.js: mismo mecanismo que las fotos, sellado por el hash
        // de su contenido. Si no cambio, no se vuelve a bajar nunca.
        var selloApp = SCOPE + '__app_v';
        ce.match(selloApp).then(function(hit){
          return hit ? hit.text() : null;
        }).then(function(prev){
          return ce.match(SCOPE + 'app.js').then(function(tiene){
            if(prev === APP_JS_V && tiene) return;
            return bajarEstable('app.js').then(function(ok){
              if(!ok) return;
              return ce.put(selloApp, new Response(APP_JS_V, {
                headers: {'Content-Type': 'text/plain'}
              }));
            });
          });
        }).catch(function(err){
          console.warn('[SW] sello de app.js falló', err && err.message);
        });
        /* [v1.63] catalog-img.js YA NO se precachea aqui.
           Antes pesaba 904 KB porque traia las 82 fotos en base64: habia que
           bajarlo entero aunque el asesor viera ocho equipos, y por eso existia
           todo este sello IMG_BUILD para no re-bajarlo en cada release.
           Ahora son 3 KB de rutas y va en el precache normal. Las fotos son
           WebP sueltas en img/ y las cachea el fetch cuando de verdad se
           pintan — mismo patron que los modelos 3D.
           IMG_BUILD se conserva declarado por compatibilidad: el activate
           limpia solo las instalaciones viejas que aun tengan el archivo gordo. */
      });
      return self.skipWaiting();
    })
  );
});

// [v1.10.24] El banner de actualización puede pedir activación inmediata.
// [v1.10.30] Y responde GET_BUILD_ID para que el HTML verifique si está al día.
self.addEventListener('message', function(event){
  if(!event || !event.data) return;
  if(event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
  if(event.data.type === 'GET_BUILD_ID'){
    // Responder por el puerto del MessageChannel que mandó el HTML
    if(event.ports && event.ports[0]){
      event.ports[0].postMessage({type:'BUILD_ID', buildId: BUILD_ID});
    }
  }
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
          // [v1.11.103] CACHE_ESTABLE sobrevive a los bumps: si se borrara aquí,
          // volveríamos a bajar 1.8MB en cada versión, que es justo el problema
          // que este cambio resuelve.
          if(name !== CACHE_NAME && name !== CACHE_ESTABLE){
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

  // [v1.11.90] MODELOS 3D (.glb) y el script de <model-viewer> — CACHE-FIRST
  // con guardado tras el primer fetch. NO van en OFFLINE_ASSETS: se descargan
  // solo cuando un asesor abre el visor. Una vez vistos quedan en caché, así
  // que la segunda vez abre al instante y funciona sin señal.
  // Ojo: el script viene de CDN (type 'cors'), por eso aquí NO se exige
  // response.type === 'basic' como en los bundles propios.
  /* [v1.63] FOTOS DEL CATALOGO — cache-first bajo demanda, igual que los 3D.
     82 WebP de ~4 KB en img/. No se precachean: el navegador baja solo las que
     se pintan, y una vez vistas quedan en cache y funcionan sin senal. */
  if(/\/img\/[^/]+\.(webp|jpg|png)(\?.*)?$/i.test(url.pathname)){
    event.respondWith(
      caches.match(req).then(function(cached){
        if(cached) return cached;
        return fetch(req).then(function(res){
          if(res && res.status === 200 && res.type === 'basic'){
            const copia = res.clone();
            caches.open(CACHE_ESTABLE).then(function(c){ c.put(req, copia); }).catch(function(){});
          }
          return res;
        }).catch(function(){
          return new Response('', {status: 503, statusText: 'Sin conexion'});
        });
      })
    );
    return;
  }

  const es3D = /\.(glb|usdz)(\?.*)?$/i.test(url.pathname) ||
               (url.hostname === 'unpkg.com' && url.pathname.indexOf('model-viewer') >= 0);
  if(es3D){
    event.respondWith(
      caches.match(req).then(function(cached){
        if(cached) return cached;
        return fetch(req).then(function(response){
          if(response && (response.status === 200 || response.type === 'opaque')){
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache){
              return cache.put(req, clone);
            }).catch(function(err){
              console.warn('[SW] cache.put 3D falló:', err && err.message);
            });
          }
          return response;
        });
      }).catch(function(){
        return caches.match(req);
      })
    );
    return;
  }

  // [v1.10.35] catalog.js y vendors.js — CACHE-FIRST.
  // Pesan mucho (catalog ~830KB, vendors ~1MB) y SOLO cambian cuando sube el
  // BUILD_ID — que va en el querystring (?v=BUILD_ID). Por eso cada versión
  // tiene su propia URL única y es seguro servirlos desde caché: si el
  // BUILD_ID cambió, la URL cambió y se descarga la nueva; si no, se sirve
  // instantáneo desde caché en vez de bajar ~1.8MB de la red en cada arranque.
  // ANTES eran network-first → se descargaban completos en cada apertura.
  // [v1.10.38] catalog-img.js (imágenes del catálogo, ~699KB) también entra aquí.
  // [v1.11.61] app.js (~485KB, el bloque principal que salió del index) entra aquí.
  const esBundlePesado = /\/(app|catalog|catalog-img|vendors)\.js(\?.*)?$/i.test(url.pathname + url.search) ||
                         /\/(app|catalog|catalog-img|vendors)\.js$/i.test(url.pathname);
  if(esBundlePesado){
    // [v1.11.103] vendors.js y catalog-img.js se sirven del caché ESTABLE y se
    // buscan SIN querystring: su contenido no depende del BUILD_ID, así que un
    // bump ya no los invalida. app.js y catalog.js siguen con ?v= porque sí
    // cambian en cada versión.
    // [v1.39.3] app.js ENTRA AQUI. En v1.38 lo mande a CACHE_ESTABLE sellado
    // por contenido (APP_JS_V) y lo saque de OFFLINE_ASSETS, pero olvide
    // agregarlo a esta lista. Resultado: el fetch lo buscaba en CACHE_NAME con
    // la clave 'app.js?v=<hash>' — que ya no existe ahi — y caia a red en cada
    // arranque; y si la red fallaba, el respaldo con ignoreSearch encontraba la
    // copia VIEJA guardada en CACHE_ESTABLE y servia esa. Por eso una version
    // nueva de app.js podia no llegar nunca.
    const esEstable = /\/(app|vendors|catalog-img)\.js/i.test(url.pathname);
    const destino = esEstable ? CACHE_ESTABLE : CACHE_NAME;
    const clave = esEstable ? (url.origin + url.pathname) : req;

    /* [v1.33] catalog.js pedido por el CATÁLOGO PÚBLICO (lleva ?d=fecha) va a
       RED PRIMERO. Antes caía en cache-first como cualquier bundle: el cliente
       que abría un enlace compartido veía los precios de la última vez que su
       teléfono descargó el archivo. Un enlace que se manda por WhatsApp tiene
       que mostrar los precios de hoy, aunque tarde medio segundo más.
       La app (?v=BUILD_ID) sigue con caché: ahí el bump ya invalida la clave. */
    /* [v1.35] SOLO catalog.js, NUNCA catalog-img.js. Las fotos pesan 876 KB y
       NO cambian cuando cambian los precios: mandarlas a red en cada apertura
       hacía que el catálogo tardara de 1 a 2 minutos en red móvil. Los precios
       (162 KB) sí valen la pena traerlos frescos. */
    const esDatosPublicos = /[?&]d=/.test(url.search) && /\/catalog\.js$/i.test(url.pathname);
    if(esDatosPublicos){
      event.respondWith(
        fetch(req).then(function(response){
          if(response && response.status === 200 && response.type === 'basic'){
            const clone = response.clone();
            caches.open(destino).then(function(cache){ return cache.put(clave, clone); })
              .catch(function(){});
          }
          return response;
        }).catch(function(){ return caches.match(clave); })
      );
      return;
    }

    event.respondWith(
      caches.match(clave).then(function(cached){
        if(cached) return cached; // hit: instantáneo
        return fetch(req).then(function(response){
          if(response && response.status === 200 && response.type === 'basic'){
            const clone = response.clone();
            caches.open(destino).then(function(cache){
              return cache.put(clave, clone);
            }).catch(function(err){
              console.warn('[SW] cache.put bundle falló:', err && err.message);
            });
          }
          return response;
        });
      }).catch(function(){
        /* [v1.37] CAUSA RAIZ DE "LA APP NO ABRE".
           Antes esto era `return caches.match(clave)` a secas. Si el equipo no
           estaba en cache Y la red fallaba, caches.match resuelve a UNDEFINED,
           y respondWith(undefined) lanza TypeError: la peticion muere y el
           <script src="app.js?v=..."> NUNCA carga. Pantalla en blanco.
           La ventana en que pasa es justo despues de un bump: la clave lleva
           ?v=BUILD_ID nuevo, el precache pudo fallar en silencio (su .catch se
           traga el error) y activate ya borro el cache anterior.
           Ahora: caida escalonada y SIEMPRE una Response valida al final. */
        return caches.match(clave).then(function(c){
          if(c) return c;
          // 2o intento: la version anterior del mismo archivo, ignorando ?v=.
          // Servir un app.js de hace un build es infinitamente mejor que una
          // pantalla en blanco; el handshake GET_BUILD_ID recarga solo cuando
          // vuelva la red.
          return caches.match(url.origin + url.pathname, {ignoreSearch: true});
        }).then(function(c){
          if(c) return c;
          return fetch(req).catch(function(){
            // Ultimo recurso: una Response REAL de error. Deja que el navegador
            // dispare onerror en vez de romper el service worker.
            return new Response('/* bundle no disponible */', {
              status: 503,
              statusText: 'Bundle no disponible',
              headers: {'Content-Type': 'application/javascript'}
            });
          });
        });
      })
    );
    return;
  }

  const isAppAsset = /\.(html|js|css)(\?.*)?$/i.test(url.pathname) ||
                     url.pathname === SCOPE ||
                     url.pathname === SCOPE + '';

  var esCatalogo = /\/catalogo\.html$/i.test(url.pathname);
  /* [v1.27] El catálogo público y sus datos van SIEMPRE a red primero.
     Con stale-while-revalidate el cliente que abría un enlace compartido veía
     la versión anterior —y peor, precios anteriores— hasta que recargaba.
     Para un enlace que se manda por WhatsApp eso no sirve: se prefiere
     esperar medio segundo a mostrar datos viejos. La caché queda solo como
     respaldo si no hay red. */

  if(isAppAsset){
    // [v1.11.56] Stale-while-revalidate: sirve caché al instante y revalida en
    // segundo plano. ANTES era network-first puro → cada apertura esperaba la
    // descarga completa del HTML (~722KB el index) aun con buena señal; en red
    // móvil floja eso era TODO el "tarda en abrir". La frescura NO se pierde:
    // (1) el fetch en segundo plano deja la versión nueva en caché,
    // (2) el navegador revisa sw.js en cada navegación; si hay versión nueva,
    //     el SW se activa, borra cachés viejos y manda SW_UPDATED → auto-reload,
    // (3) el handshake GET_BUILD_ID del HTML fuerza recarga si HTML ≠ SW.
    // Peor caso tras un deploy: se ve la versión anterior unos segundos y se
    // recarga sola — mismo UX del banner de actualización que ya existía.
    event.respondWith(
      caches.match(req).then(function(cached){
        const fetchPromise = fetch(req).then(function(response){
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
          /* [v1.13.1] El fallback a index.html mandaba el catálogo público a la
             app de colaboradores: catalogo.html viaja con ?a=…&n=…&t=… y esa
             URL exacta no está en caché, así que caía aquí. Ahora el catálogo
             usa su propia copia sin query. */
          if(esCatalogo) return caches.match(SCOPE + 'catalogo.html');
          return cached || caches.match(SCOPE + 'index.html');
        });
        /* El catálogo ignora la query al buscar en caché: el enlace de cada
           asesor es distinto pero el archivo es el mismo. */
        if(esCatalogo) return cached || caches.match(SCOPE + 'catalogo.html') 
          .then(function(c){ return c || fetchPromise; });
        return cached || fetchPromise;
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
