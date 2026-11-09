# Inicio con impulso Android — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar a TechGuide v1.73.0 el inicio estilo hoja AT&T con Android al frente, la pantalla "Recomendación por presupuesto" y la hoja de 6 equipos para WhatsApp.

**Architecture:** Todo se deriva al momento de PRICES, VIGENCY, CAT, PLANS_DATA y MOMENTO_BY_PLAN, sin datos nuevos. La lógica sin DOM vive en un bloque marcado de app.js (`// <reco-puro>` … `// </reco-puro>`) que las pruebas de node cargan solas; el render vive junto a initMomento. La hoja usa el mismo camino del flyer (vendors.js + html2canvas + vista previa + navigator.share).

**Tech Stack:** JS vanilla (PWA), CSS con variables `--hv2-*`, html2canvas 1.4.1 (vendors.js), node 22 (`node:test`), Playwright (Chromium preinstalado).

**Spec:** `docs/superpowers/specs/2026-11-09-inicio-android-design.md`

## Global Constraints

- Versión destino v1.73.0 sobre v1.72.26; entrega: zip con app.js, index.html y sw.js. catalog.js no cambia.
- Todo queda en app.js, sin archivo nuevo, para no tocar la carga versionada por contenido ni el precache.
- Sin fuentes web ni CDNs nuevos; tipografía del sistema.
- No cambia: Calculadora, cotizador y su flyer (solo la guarda del §6), ficha, catálogo público, Descuentos, menú lateral. COMISIONES_OFF, CRM en standby, PRERREGISTRO_OFF y FLASH_OFF siguen igual.
- Nunca iPhone en campaña ni recomendación; Titanio no participa.
- Precio con `resolvePrice`; % mostrado con `pctMostrar`; enganche máx = 3 × renta si el % exacto es ≥ 70, si no `Math.round(precio × 0.5)`.
- "Enganche máx: $X" sin variantes.
- La hoja siempre sale en claro y no registra cotización.
- Leyenda de la hoja, exacta: `* Pago inicial sujeto a aprobación crediticia · Consulta términos y condiciones · Precios sujetos a cambio sin previo aviso`
- Ediciones quirúrgicas (match único); UTF-8; `node --check` a app.js, catalog.js y sw.js.

## Review Focus

1. Monto escrito con formato ("$2,500", "2 500", vacío, letras): se lee solo el número; vacío o 0 no avanza. → prueba en Task 1 (`recoParseMonto`).
2. Imágenes que llegan después (catalog-img.js es diferido): las tarjetas muestran el ícono de respaldo y luego la foto sin recargar. → prueba en Task 2.
3. Nombres largos ("Moto Edge 70 Pro + Watch", "Honor Magic 8 Lite 5G + Jersey") en tarjetas de 2 columnas a 360 px y en la hoja: sin desbordes. → captura a 360 px en Tasks 2–4.
4. Wordmark Black y Platino en modo oscuro: legibles. → prueba de estilo computado en Task 2.
5. Doble toque en "Compartir por WhatsApp": una sola imagen. → prueba en Task 4.

---

### Task 1: Núcleo sin DOM y arnés de pruebas

**Files:**
- Modify: `app.js` (bloque nuevo `// <reco-puro>` justo después de `abrirMomento`, ~línea 513)
- Create: `tests/cargar-app.js`, `tests/inicio-android.test.js`

**Interfaces:**
- Produces (todo en el bloque `<reco-puro>`):
  - `PLAN_VIS`: `{ 'Azul 1'|'Azul 2'|'Azul 3': {cls:'pw-azul', g1:'#2F9BEA', g2:'#0B5CAD', ink:'#0B5CAD'}, 'Plata': {cls:'pw-plata', g1:'#8E9AA8', g2:'#4E5B69', ink:'#4E5B69'}, 'Oro': {cls:'pw-oro', g1:'#C99A1B', g2:'#8A5A00', ink:'#8A5A00'}, 'Black': {cls:'pw-black', g1:'#3A3A3A', g2:'#0A0A0A', ink:'#111111'}, 'Platino': {cls:'pw-platino', g1:'#9A93B3', g2:'#4C4570', ink:'#4C4570'}, 'Diamante': {cls:'pw-diamante', g1:'#22A3B5', g2:'#0B4F5A', ink:'#0B4F5A'} }`
  - `planVis(nombre) → {nombre, gb, renta, cls, g1, g2, ink}` (gb y renta de PLANS_DATA)
  - `ofertaPlan(id, plan, plazo) → {plan, plazo, promo, contado, pct, eng, incluido} | null` (null si no hay contado o `resolvePrice` da null)
  - `modeloBase(nombre) → string` — quita `/\s*\+.*$/` y espacios
  - `recoParseMonto(texto) → number` — solo dígitos; sin dígitos → 0
  - `recoCalcular(monto, planA, planB, plazo) → {planes:[menor, mayor], lista:[{id, nombre, capacidad, contado, a, b}], minimo:number|null}` — `a`/`b` son `ofertaPlan` del plan menor/mayor (orden de PLANS_DATA); `minimo` = menor `max(a.eng, b.eng)` entre los Android vigentes con ambas ofertas; `monto <= 0` → `lista: []`
  - `campanaEquipos() → [{id, nombre, capacidad, contado, a, b}]` — Android vigentes con `status === 'NPI'`, `a = ofertaPlan(id,'Plata',36)`, `b = ofertaPlan(id,'Oro',36)`
  - `vigLargo(id) → {txt, ultimo}`
  - `fmtMoneda(n) → {ent, dec}` (es-MX, 2 decimales: 2798.72 → `{ent:'$2,798', dec:'.72'}`)
- `tests/cargar-app.js` exporta `cargar({extra}) → ctx`: contexto vm con catalog.js, las funciones existentes `isVigent`, `daysLeft`, `resolvePrice`, `pctMostrar`, las constantes `PLAN_ORDER`/`PLAZO_ORDER` (extraídas de app.js por nombre, con un contador de llaves que salta cadenas y comentarios) y el bloque `<reco-puro>`; `extra(ctx)` permite inyectar equipos de prueba en CAT/PRICES/VIGENCY antes de evaluar.

Algoritmo de `recoCalcular` (no lo fija la firma):
```
equipos: CAT.android con isVigent(id) y PRICES[id].contado
a = ofertaPlan(id, menor, plazo); b = ofertaPlan(id, mayor, plazo); si falta alguna → fuera
minimo = min(minimo, max(a.eng, b.eng))
entra si a.eng <= monto y b.eng <= monto
s = ((1 - (monto - a.eng)/monto) + (1 - (monto - b.eng)/monto)) / 2
orden: s desc, contado desc, id asc; luego un equipo por modeloBase(nombre) (queda el primero)
```
`campanaEquipos`: orden contado desc, id asc; un equipo por `modeloBase`; fuera si falta `a` o `b`.
`vigLargo`: null/'indefinido' → `'Vigente hasta nuevo aviso'`; si no, `'Vigente al ' + día + ' de ' + mes completo en minúsculas`; `daysLeft(id) === 0` → agrega `' · último día'` y `ultimo: true`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/inicio-android.test.js` (`node:test` + `node:assert/strict`):
  - `recoCalcular coincide con un cálculo independiente`: oráculo escrito en la prueba (mismas reglas, sin usar el bloque); recorre montos `[1500,2000,2500,3000,4000]` × los 28 pares de los 8 planes × plazos `[24,30,36]`; compara la secuencia de ids y `minimo` en las 420 combinaciones.
  - `planes en cualquier orden`: `recoCalcular(2500,'Oro','Plata',36)` deep-equal a `recoCalcular(2500,'Plata','Oro',36)`.
  - Con equipos inyectados por `extra`:
    - `INCLUIDO entra con 3 rentas`: promo 0 en Plata y Oro a 36 → `a.incluido === true`, `a.eng === 1950`, `b.eng === 2175`; entra con monto 2175.
    - `vencido ayer no entra; último día sí`: VIGENCY = ayer → ausente; VIGENCY = hoy → presente y `vigLargo(id)` es `{txt: 'Vigente al D de mes · último día', ultimo: true}`.
    - `un modelo por tarjeta`: "Fixture X" 128 GB (contado 9000) y 256 GB (contado 9999) y "Fixture X + Regalo" con las mismas ofertas → una sola entrada, la de 9999.
    - `iPhone nunca`: un equipo en CAT.ios con precios bajos no aparece.
    - `sin resultados`: monto 1000 en Plata y Oro → `lista.length === 0` y `minimo` igual al del oráculo.
    - `null no entra`: `resolvePrice` null en un plan → ausente.
  - `campanaEquipos`: con fixtures NPI (uno vencido, uno iOS, uno en 2 capacidades) → solo Android vigentes, un modelo, orden contado desc; cada uno con `a.plan === 'Plata'`, `b.plan === 'Oro'`, `a.plazo === 36`.
  - `vigLargo`: `'2027-01-10'` → `'Vigente al 10 de enero'`; `'indefinido'` → `'Vigente hasta nuevo aviso'`.
  - `fmtMoneda`: `2798.72` → `{ent:'$2,798', dec:'.72'}`; `0` → `{ent:'$0', dec:'.00'}`.
  - `recoParseMonto`: `'$2,500'` → 2500; `'2 500'` → 2500; `''` → 0; `'abc'` → 0.
- [ ] **Step 2: Correr y ver que fallan** — Run: `node --test tests/` · Expected: FAIL (`recoCalcular is not defined`).
- [ ] **Step 3: Implementar `tests/cargar-app.js` y el bloque `<reco-puro>` en app.js** con las firmas de arriba.
- [ ] **Step 4: Correr y ver que pasan** — Run: `node --test tests/ && node --check app.js` · Expected: todas PASS, sin errores de sintaxis.
- [ ] **Step 5: Commit** — `git add app.js tests && git commit -m "v1.73: núcleo de recomendación y campaña con pruebas"`

### Task 2: Inicio — CSS, campaña, Equipos del momento y formulario

**Files:**
- Modify: `index.html` (bloque CSS `/* ═══ [v1.73.0] INICIO ANDROID ═══ */` después de `.hv2-footer-meta`; markup de `#s-home` líneas ~4952–5011; `window._onCatalogImgReady` ~5377)
- Modify: `app.js` (reemplazar el cuerpo de `initMomento`, líneas 451–499; llamadas en el bloque de Stats ~1353)
- Create: `tests/navegador.js` (Playwright; reutiliza `srv.js` del scratchpad copiado a `tests/srv.js` y la sesión falsa `primemx_sesion_v1`)

**Interfaces:**
- Consumes: Task 1 (`planVis`, `ofertaPlan`, `campanaEquipos`, `vigLargo`, `fmtMoneda`, `recoParseMonto`).
- Produces:
  - CSS compartido (lo usa Task 3): `.pw` + `.pw-azul|pw-plata|pw-oro|pw-black|pw-platino|pw-diamante` (degradado `--pw1/--pw2` y tinta `--pink`, con versión `[data-theme="dark"]` clara: Azul #7CC4FF/#3B95E6 tinta #7CC4FF; Plata #DCE3EA/#9AA7B4 tinta #C9D2DC; Oro #F4CF62/#C99A1B tinta #F0C24B; Black #F5F5F5/#A3A3A3 tinta #EDEDED; Platino #D9D2F2/#9A93B3 tinta #CFC7EE; Diamante #7FE3F0/#22A3B5 tinta #6FD8E6), `.hv3-card`, `.hv3-check`, `.hv3-sello`, `.hv3-antes`, `.hv3-eng`, `.hv3-vig` / `.hv3-vig.urg` (#B91C1C; oscuro #F2827A), `.hv3-btn` (azul marino, como `.hv2-cta`).
  - `wordmarkHTML(plan, px) → string`, `selloHTML(pct, px) → string` (estrella de 40 picos del mockup: fill #FFFFFF, stroke #D61F45, ancho 2.5; texto #0B1524), `checkHTML() → string` (círculo #1D8CF0 + palomita blanca), `fotoHTML(id, px) → string` (`<img data-img-id>` con `imgSrc(id)`, o el ícono de respaldo actual si no hay foto).
  - `columnaPlanHTML(of, variante) → string`, `variante: 'camp' | 'reco'`. `camp`: wordmark, "GB | $renta", "a N meses", precio o INCLUIDO, "Antes $contado" + sello, "Enganche máx: $X". `reco`: wordmark, precio o INCLUIDO, "-X %" (#C8102E), "Enganche máx $X".
  - `initCampana()` → pinta `#camp-wrap` (atributo `hidden` si `campanaEquipos()` está vacío); tarjeta por equipo con `columnaPlanHTML(..,'camp')` y pie `vigLargo` + "Protégelo por sólo $X al mes" (`getSeguroPrice(contado)`); puntos solo con 2 o más; el punto activo sigue al scroll. Tocar → `abrirMomento('android', id, 'Plata', 36)`.
  - `initMomento()` → `#momento-cards` con pestañas de MOMENTO_PLANS (`role="tab"`, `aria-selected`), encabezado wordmark + "GB | $renta al mes" y tarjetas del plan `_momPlan` (por defecto `'Plata'`): vigentes de MOMENTO_BY_PLAN, máximo 8, con nombre, capacidad · "N meses", precio o INCLUIDO, Antes + sello si `desc > 0`, "Enganche máx: $X", vigencia. `momentoTab(plan)` cambia y repinta. Tocar → `abrirMomento` igual que hoy.
  - `recoState = {monto: 2500, planes: ['Plata','Oro'], plazo: 36, todos: false}` (global, vive mientras la app esté abierta).
  - `recoHomeRender()` → `#reco-home`: input `#reco-monto-home` (`inputmode="numeric"`, valor con comas), selects `#reco-plan-a` / `#reco-plan-b` (8 planes; si quedan iguales, el otro toma el valor anterior), select `#reco-plazo` (24/30/36), botón "Ver equipos" → `recoVer()`, línea `#reco-home-msg`.
  - `recoVer()` → lee con `recoParseMonto`; si es 0 muestra "Escribe el enganche del cliente" en `#reco-home-msg` y enfoca el input; si no, actualiza `recoState`, `show('s-reco')` y `recoRender()` (Task 3).
- Markup de `#s-home`: después del botón "Nueva cotización" va `<div id="camp-wrap" class="hv3-camp hv2-rise" style="--d:0.26s" hidden></div>`; en `.hv2-side`, en este orden: `Equipos del momento` + `#momento-cards`, `Recomendación por presupuesto` + `#reco-home`, `Catálogo` + `.hv2-stats` (los 4 ids actuales). Sale `.hv2-momento-hint`. Pulso, racha, pendientes y pie quedan igual.
- `_onCatalogImgReady`: además de `initMomento()`, llama `initCampana()` si el inicio está activo.

- [ ] **Step 1: Escribir `tests/navegador.js`** (sirve el repo con `tests/srv.js`, iPhone 13, sesión falsa, `serviceWorkers:'block'`, sin red externa) con estas comprobaciones, que deben fallar hoy:
  - `#camp-wrap .hv3-camp-card` cuenta = `campanaEquipos().length` evaluado en la página; puntos = esa cuenta si es ≥ 2, 0 si no.
  - `#momento-cards [role=tab]` = 6; el seleccionado dice "Plata"; tarjetas ≤ 8; clic en "Oro" → el encabezado dice "ORO".
  - `#reco-monto-home` vale "2,500"; planes Plata y Oro; plazo 36.
  - Fotos diferidas: con `IMG` vacío, la primera tarjeta muestra el ícono de respaldo; tras llenar `IMG` y llamar `_onCatalogImgReady()`, la primera `img[data-img-id]` tiene `src` no vacío.
  - Oscuro: color computado de `--pw1` en `.pw-black` es `#F5F5F5`.
  - Cero `pageerror`. Capturas: 390 px claro y oscuro, 360 px claro y 1280 px claro (`/tmp/v173/inicio-*.png`).
- [ ] **Step 2: Correr y ver que falla** — Run: `node tests/navegador.js inicio` · Expected: FAIL en `#camp-wrap`.
- [ ] **Step 3: Implementar CSS, markup, `initCampana`, `initMomento`, `momentoTab`, `recoHomeRender`, `recoVer` y las llamadas** (Stats: `initMomento(); initCampana(); recoHomeRender();`).
- [ ] **Step 4: Correr y revisar** — Run: `node tests/navegador.js inicio && node --test tests/ && node --check app.js` · Expected: PASS; revisar las 4 capturas contra el mockup (sin desbordes a 360 px; escritorio en 2 columnas).
- [ ] **Step 5: Commit** — `git commit -am "v1.73: inicio con campaña, momento por pestañas y formulario"`

### Task 3: Pantalla "Recomendación por presupuesto" (#s-reco)

**Files:**
- Modify: `index.html` (pantalla `#s-reco` después de `#s-calc`; CSS en el bloque v1.73)
- Modify: `app.js` (render y manejadores debajo de `recoVer`)
- Modify: `tests/navegador.js` (modo `reco`)

**Interfaces:**
- Consumes: Task 1 (`recoCalcular`, `recoParseMonto`, `fmtMoneda`, `vigLargo`), Task 2 (`recoState`, `columnaPlanHTML(..,'reco')`, `fotoHTML`, `checkHTML`, clases `.hv3-*`, `.pw-*`).
- Produces: `recoRender()`, `recoSetMonto(texto)` (actualiza `recoState.monto` y repinta solo `#reco-res`, para no mover el cursor), `recoTogglePlan(nombre)` (si no está: `planes = [planes[1], nombre]`), `recoSetPlazo(z)`, `recoVerTodos()`. Markup: `#s-reco` con botón atrás (`show('s-home')`), título "Recomendación por presupuesto", `#reco-ctrl` (input `#reco-monto`, 8 botones `.hv3-planbtn[aria-pressed]`, plazo segmentado `.hv3-seg`) y `#reco-res`.
- `#reco-res`: "N equipos" | "1 equipo" | "Sin equipos" + "Enganche mínimo para A y B: $X" (si hay `minimo`); tarjetas `.hv3-rcard` (foto, nombre + palomita, "capacidad · Antes $contado", columnas `a | b` con `columnaPlanHTML(..,'reco')`, vigencia); 6 o todas con `recoState.todos`; botón "Ver los N" si N > 6 y no `todos`; botón "Compartir por WhatsApp" solo si N > 0 → `recoGenerarHoja()` (Task 4). Tocar tarjeta → `abrirMomento('android', id, r.planes[0], recoState.plazo)`, donde `r` es el resultado de `recoCalcular` (plan menor, no el orden de selección).

- [ ] **Step 1: Agregar el modo `reco` a `tests/navegador.js`**, que falla hoy:
  - Clic en "Ver equipos" → `#s-reco` activo; el título de resultados = `recoCalcular(2500,'Plata','Oro',36).lista.length + ' equipos'`; nombres de las tarjetas = los primeros 6 de esa lista.
  - Monto "2000" → "Sin equipos" y "Enganche mínimo para Plata y Oro: $" + `minimo` (formato es-MX); sin botón de compartir.
  - Clic en "Azul 3" con Plata y Oro elegidos → quedan Oro y Azul 3, y el resultado coincide con `recoCalcular(2000,'Azul 3','Oro',36)`.
  - "Ver los N" → N tarjetas.
  - Monto vacío en el inicio + "Ver equipos" → sigue en `#s-home` y `#reco-home-msg` dice "Escribe el enganche del cliente".
  - `page.goBack()` desde `#s-reco` → `#s-home` activo.
  - A 360 px, ninguna `.hv3-rcard` ni `.hv3-mcard` (ni sus hijos) tiene `scrollWidth > clientWidth`.
  - Capturas 390 px claro/oscuro y 360 px (`/tmp/v173/reco-*.png`), incluida la vacía.
- [ ] **Step 2: Correr y ver que falla** — Run: `node tests/navegador.js reco` · Expected: FAIL (`#s-reco` no existe).
- [ ] **Step 3: Implementar markup, CSS y funciones.**
- [ ] **Step 4: Correr** — Run: `node tests/navegador.js inicio && node tests/navegador.js reco && node --test tests/` · Expected: PASS; capturas revisadas.
- [ ] **Step 5: Commit** — `git commit -am "v1.73: pantalla de recomendación por presupuesto"`

### Task 4: Hoja para WhatsApp

**Files:**
- Modify: `app.js` (funciones de la hoja; guardas en `generateFlyerImage`, `shareFlyerImage`, `closeFlyerPreview`)
- Modify: `index.html` (CSS `.hoja-reco` en el bloque v1.73)
- Modify: `tests/navegador.js` (modo `hoja`)

**Interfaces:**
- Consumes: Task 1 (`recoCalcular`, `planVis`, `fmtMoneda`, `vigLargo`), Task 3 (`recoState`), existentes `loadVendors`, `html2canvas`, `getPerfilEfectivo`, `getSeguroPrice`, `imgSrc`, `lastGeneratedBlob`, `#cot-flyer-render`, `#flyer-preview-overlay`.
- Produces:
  - `var _flyerModo = 'cot'` (global).
  - `recoHojaHTML(lista, plazo, perfil) → string`, raíz `<div class="hoja-reco">` de 540 px, colores fijos de claro (sin variables ni clases `.pw-*`). Por tarjeta: nombre + capacidad + palomita; foto en caja cuadrada (html2canvas no respeta object-fit); columnas a | b con wordmark en SVG `<text>` con `linearGradient` g1→g2 (html2canvas no pinta background-clip:text), "GB | $renta", "a N meses", precio o INCLUIDO en tinta del plan, sello -X %, "Antes $contado"; pie con `vigLargo(id).txt` y "Protégelo por sólo $X al mes". Pie de la hoja: nombre del asesor y "sucursal · teléfono" (omite lo vacío), PRIMEMX, "Distribuidor autorizado AT&T" y la leyenda exacta de Global Constraints.
  - `async recoGenerarHoja()`: si ya está generando, no hace nada; `_flyerModo = 'reco'`; mismo flujo de `generateFlyerImage` (vendors, `#cot-flyer-render`, esperar imágenes, `html2canvas(el,{scale:2, backgroundColor:'#FFFFFF', logging:false, useCORS:true, allowTaint:true, width:540, windowWidth:540})`, vista previa, `lastGeneratedBlob`) con los primeros 6 de `recoCalcular(...)`.
  - `async recoCompartirHoja()`: `navigator.share({files:[png], title:'Equipos recomendados · Prime MX'})`; AbortError → no hace nada; sin share → descarga `recomendacion-primemx-<ms>.png`. Nunca llama `registrarCotizacion` ni el modal de CRM. Al terminar, `closeFlyerPreview()`.
  - Guardas: `shareFlyerImage` empieza con `if(_flyerModo === 'reco') return recoCompartirHoja();`; `closeFlyerPreview` y el inicio de `generateFlyerImage` ponen `_flyerModo = 'cot'`.

- [ ] **Step 1: Agregar el modo `hoja` a `tests/navegador.js`**, que falla hoy:
  - En `#s-reco` ($2,500 · Plata · Oro · 36), clic en "Compartir por WhatsApp" dos veces seguidas → `#flyer-preview-overlay` con clase `show`, una sola `img` en `#flyer-preview-container`, de 1080 px de ancho natural; se guarda en `/tmp/v173/hoja.png`.
  - El HTML de `#cot-flyer-render .hoja-reco` contiene la leyenda exacta y el nombre del asesor de la sesión falsa.
  - Con `window.registrarCotizacion` espiada, clic en "Compartir imagen" (sin `navigator.share` en headless → descarga) → hay descarga `.png` y el espía no se llamó; después `_flyerModo === 'cot'`.
- [ ] **Step 2: Correr y ver que falla** — Run: `node tests/navegador.js hoja` · Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr y revisar** — Run: `node tests/navegador.js hoja && node tests/navegador.js reco && node --test tests/` · Expected: PASS; revisar `/tmp/v173/hoja.png` a ojo (wordmarks con degradado, fotos sin deformar, nombres largos completos, pie y leyenda).
- [ ] **Step 5: Commit** — `git commit -am "v1.73: hoja de recomendación para WhatsApp"`

### Task 5: Versión, verificación final y zip

**Files:**
- Modify: `index.html` (`window.BUILD_ID`, `APP_VERSION = 'v1.73.0'`, `window.APP_JS_V`), `sw.js` (`CACHE_NAME = 'techguide-v1730-inicio-android'`, `BUILD_ID`, `APP_JS_V`)

- [ ] **Step 1: Ritual** — BUILD_ID = el actual + 86400 (en index.html y sw.js); `APP_JS_V` = primeros 10 de `sha1sum app.js` (en los dos); APP_VERSION y CACHE_NAME como arriba.
- [ ] **Step 2: Verificación** — Run: `node --check app.js && node --check catalog.js && node --check sw.js && node --test tests/ && node tests/navegador.js inicio && node tests/navegador.js reco && node tests/navegador.js hoja` · Expected: todo PASS. Además: `grep` confirma `COMISIONES_OFF = true`, `FLASH_OFF = true`, `PRERREGISTRO_OFF = true` y el CRM sin cambios; `git diff --stat da75e93 -- catalog.js` vacío (da75e93 = v1.72.26); precio y "Enganche máx" de 3 equipos al azar iguales entre la tarjeta de recomendación y la ficha abierta en ese plan y plazo (Playwright).
- [ ] **Step 3: Zip** — `techguide-v1.73.0.zip` con `app.js`, `index.html` y `sw.js`; enviarlo a Diego.
- [ ] **Step 4: Commit** — `git commit -am "v1.73.0: inicio con impulso Android"`
