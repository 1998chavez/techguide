# Inicio con impulso Android — diseño

**Fecha:** 9 nov 2026 · **Versión destino:** v1.73.0 · **Base:** v1.72.26 (en producción)
**Mockups aprobados:** canvas "TechGuide · Impulso Android", versión 10 (Inicio, Recomendación por presupuesto, Hoja para WhatsApp)

## 1. Para qué

Crédito endureció criterios a nivel nacional y un iPhone ya casi no se aprueba; la empresa empuja Android. TechGuide empuja igual: un inicio más visual y formal (estilo hoja AT&T) con Android al frente, y una herramienta para que el asesor arme en segundos una propuesta de 6 Android según el enganche del cliente y la mande por WhatsApp.

**Éxito**
- Del inicio a la hoja lista para WhatsApp en 3 pasos: escribir el enganche → Ver equipos → Compartir por WhatsApp.
- Precio, % y enganche idénticos a la ficha y a Equipos del momento (mismas funciones, no copias).
- Los datos del catálogo no cambian: todo se deriva al momento de PRICES, VIGENCY y CAT.

## 2. Lo que pidió Diego y lo que se supone

**Pidió:** opción 2 (Android al frente) y opción 3 (recomendación por presupuesto); estilo formal tipo hoja AT&T; sin texto redundante; 6 equipos; el asesor escoge 2 planes y el plazo de una vez; sin "Mayor valor"; criterio de la Calculadora (lo que alcanza y lo más parecido al monto), sin rango de ±$500 ni tope de $10 mil.

**Confirmó (9 nov):** el pulso del día se queda; la campaña muestra los Android más nuevos; la hoja no cuenta como cotización; diseño aprobado para construir.

## 3. Alcance

**Entra:** (1) inicio rediseñado; (2) pantalla nueva "Recomendación por presupuesto"; (3) hoja para WhatsApp.

**No cambia:** Calculadora (pantalla y orden), cotizador y su flyer (solo se agrega la guarda del §6 para compartir la hoja), ficha, catálogo público, Descuentos, menú lateral, specs de equipos. COMISIONES_OFF, CRM en standby, PRERREGISTRO_OFF y FLASH_OFF siguen como están.

## 4. Inicio

De arriba abajo, en celular:

1. Barra: menú + PRIMEMX — igual que hoy.
2. Saludo — igual (updateGreeting).
3. Pulso del día y racha — igual (decisión A).
4. "Nueva cotización" — igual (abrirPlatSheet).
5. **Tarjeta de campaña**, sin título de sección. Carrusel deslizable; los puntos solo aparecen con 2 o más equipos. Por equipo: nombre + capacidad + palomita; foto; dos columnas de plan (plan menor a la izquierda) con wordmark (PLATA, ORO…), "GB | $renta", "a N meses", precio o INCLUIDO, "Antes $contado" tachado + sello -X %, "Enganche máx: $X"; pie con vigencia y "Protégelo por sólo $X al mes". Tocar abre la ficha en el plan de la izquierda y su plazo. Equipos: los Android más nuevos (decisión B), en Plata y Oro a 36 meses.
6. **Equipos del momento**: pestañas por plan (Azul 1 → Black; abre en Plata); encabezado con wordmark del plan y "GB | $renta al mes"; tarjetas horizontales con foto, nombre + palomita, capacidad · plazo, precio o INCLUIDO, Antes tachado + sello, "Enganche máx: $X" (sin variantes, regla vigente) y vigencia. Mismos datos que hoy: MOMENTO_BY_PLAN filtrado por vigencia, 8 por plan. Tocar → abrirMomento (igual). Sale el texto "Menor enganche por plan · desliza para ver más". Se conserva id="momento-cards" (el menú lateral hace scroll ahí).
7. **Recomendación por presupuesto** (formulario): Enganche disponible ($, solo números), Planes (2 selectores con los 8 planes Azul 1 → Diamante; no se puede repetir el mismo), Plazo (24, 30, 36) y botón "Ver equipos". Abre en $2,500 · Plata · Oro · 36 meses y recuerda lo último usado mientras la app esté abierta. Sin enganche, el botón no avanza y lo dice en una línea.
8. Catálogo: las 4 cifras de hoy.
9. Pendientes (cola sin señal) y pie con versión — igual.

**Escritorio (≥1080 px):** columna izquierda con saludo, pulso, cotización y campaña; derecha con momento, recomendación y catálogo.
**Modo oscuro:** todo con las variables --hv2-*; cada wordmark de plan tiene versión clara para fondo oscuro. La hoja para WhatsApp siempre sale en claro.
**Tipografía:** la del sistema, la de hoy. Sin fuentes web ni CDNs nuevos.

## 5. Recomendación por presupuesto (pantalla nueva s-reco)

Arriba van los mismos controles: enganche, 8 botones de plan (se eligen 2; tocar un tercero reemplaza al más antiguo) y plazo. Cualquier cambio recalcula al instante.

**Cálculo** (función pura, sin DOM, probable en node):
- Equipos: CAT.android vigentes (isVigent) con precio de contado. Nunca iPhone; Titanio no participa.
- Precio: resolvePrice(id, plan, plazo), la misma regla de la ficha y del flyer. Si da null, el equipo no entra.
- % = (1 − precio/contado) × 100. Enganche máx = 3 × renta si el % es 70 o más; si no, 50 % del precio, redondeado. Rentas de PLANS_DATA. El % se muestra con pctMostrar.
- Entra si el enganche máx cabe en el monto en los dos planes.
- Orden: puntaje de la Calculadora, promediado en los 2 planes: 1 − (monto − enganche) / monto; mayor primero. Empate: mayor precio de lista; después id.
- Un modelo por tarjeta: el mismo nombre (sin el "+ regalo") cuenta como un modelo; queda el mejor colocado.
- Se ven 6; "Ver los N" despliega todos.
- Sin resultados: "Sin equipos" y "Enganche mínimo para A y B: $X", donde X es el menor monto con el que entraría al menos uno.

**Tarjeta:** foto; nombre + palomita; capacidad · Antes tachado; columnas plan A | plan B (el menor a la izquierda) con wordmark, precio o INCLUIDO, -X % y "Enganche máx $X"; vigencia (en rojo el último día). Tocar → ficha en el plan de la izquierda y el plazo elegido.

**Compartir por WhatsApp:** solo aparece si hay resultados; arma la hoja con los primeros 6 (o los que haya, si son menos).

## 6. Hoja para WhatsApp

- PNG de 540 px de ancho a escala 2, por el mismo camino del flyer: vendors.js bajo demanda, html2canvas, vista previa (#flyer-preview-overlay) y navigator.share con archivo; si no hay share, se descarga.
- Tarjetas: nombre + capacidad + palomita; foto; columnas plan A | plan B con wordmark, "GB | $renta", "a N meses", precio o INCLUIDO, sello -X % y "Antes $contado"; pie con vigencia y "Protégelo por sólo $X al mes" (getSeguroPrice).
- Pie de la hoja: nombre, sucursal y teléfono del asesor (getPerfilEfectivo, como el flyer) · PRIMEMX · "Distribuidor autorizado AT&T" · la misma leyenda del flyer: "* Pago inicial sujeto a aprobación crediticia · Consulta términos y condiciones · Precios sujetos a cambio sin previo aviso". La leyenda no venía en el mockup; se agrega porque es una hoja con precios para el cliente.
- No registra cotización (decisión C). No toca cotState ni el flujo del flyer: el botón de la vista previa sabe si comparte flyer u hoja.

## 7. Cómo se arma

- **app.js**, sección nueva "INICIO ANDROID v1.73": utilidades visuales compartidas (wordmark de plan claro/oscuro, sello, vigencia larga, columna de plan); campaña; Equipos del momento (reemplaza el render de initMomento; abrirMomento queda igual); recomendación (cálculo puro + pantalla); hoja (HTML, imagen y compartir); y una guarda mínima en shareFlyerImage y closeFlyerPreview.
- **index.html:** bloque de CSS v1.73 con las variables --hv2-*, markup del inicio reordenado, pantalla #s-reco y ritual (BUILD_ID, APP_VERSION, APP_JS_V).
- **sw.js:** CACHE_NAME, BUILD_ID y APP_JS_V.
- **catalog.js:** sin cambios.
- Todo queda en app.js, sin archivo nuevo, para no tocar la carga versionada por contenido ni el precache.

## 8. Pruebas antes de entregar

- Node: el cálculo contra uno independiente en las 420 combinaciones (5 montos × 28 pares de planes × 3 plazos), más casos borde: precio 0 (INCLUIDO), vencido ayer, último día, sin resultados, mismo modelo en 2 capacidades o con regalo.
- Navegador (Playwright, 390 px y 1280 px, claro y oscuro): inicio, recomendación con resultados y sin resultados, y la hoja generada (PNG revisado a ojo).
- Precio de 3 equipos al azar contra la ficha en el mismo plan y plazo.
- node --check de app.js, catalog.js y sw.js; invariantes (COMISIONES_OFF, CRM, PRERREGISTRO_OFF, FLASH_OFF); ritual de versión completo.
- Entrega: zip con app.js, index.html y sw.js.

## 9. Decisiones (confirmadas por Diego el 9 nov)

- **A. Pulso del día ("cotizaste hoy", racha):** se queda donde está hoy.
- **B. Equipos de la campaña:** "pon los equipos más nuevos android". Son los Android vigentes con estatus NPI (el estatus de lanzamiento de la lista de precios, columna A), un modelo por tarjeta, del mayor al menor precio de lista, en Plata y Oro a 36 meses. Se actualiza solo con cada carga de precios: el equipo que deja de ser NPI o vence, sale. Si no hay ninguno, la tarjeta se oculta. Hoy saldrían 7: Galaxy S26 FE, Honor 600 Elite, Redmi Note 17 Pro 5G, Moto G47, Honor X7E, Honor X6E y Moto G37.
- **C. La hoja no cuenta como cotización.** El registro de cotizaciones y los tableros son de 1 equipo, 1 plan y 1 plazo; contar una hoja de 6 equipos movería las cifras. Si se quiere medir, va aparte después.
