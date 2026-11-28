// [v1.73.0] Pruebas en navegador (Playwright, Chromium preinstalado).
// Uso: node tests/navegador.js <inicio|reco|hoja|ficha|puntos|precal|platino|uso|rediseno|inventario>
// Sirve el repo, entra con una sesión falsa, sin service worker ni red externa,
// y deja capturas en /tmp/v173 para revisarlas a ojo.
'use strict';
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');
const { servir } = require('./srv.js');

const RAIZ = path.join(__dirname, '..');
const OUT = '/tmp/v173';
fs.mkdirSync(OUT, { recursive: true });
const SES = {
  name: 'DIEGO CHAVEZ COLIN', attuid: 'DC499W', rol: 'regional', tiendasAsignadas: ['PRM TDA LEON CENTRO'],
  region: 'BAJIO', tienda: 'PRM TDA LEON CENTRO', sucursal: 'PRM TDA LEON CENTRO', phone: '4771234567',
  regionesAsignadas: [], loginAt: Date.now(),
};

const fallas = [];
let bien = 0;
function chk(nombre, cond, detalle) {
  if (cond) { bien++; console.log('  ok    ' + nombre); return; }
  fallas.push(nombre);
  console.log('  FALLA ' + nombre + (detalle !== undefined ? ' → ' + JSON.stringify(detalle) : ''));
}

async function abrir(nav, base, { ancho = 390, alto = 844, tema = 'light', bloquearFotos = false, ses = SES } = {}) {
  const movil = ancho < 800;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, isMobile: movil, hasTouch: movil,
    userAgent: movil ? devices['iPhone 13'].userAgent : undefined, serviceWorkers: 'block',
    colorScheme: tema, timezoneId: 'America/Mexico_City', locale: 'es-MX', acceptDownloads: true,
  });
  await ctx.addInitScript((s) => { try { localStorage.setItem('primemx_sesion_v1', s); } catch (e) {} }, JSON.stringify(ses));
  if (bloquearFotos) await ctx.route('**/catalog-img.js*', (r) => r.abort());
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.errores = [];
  p.on('pageerror', (e) => p.errores.push(String(e.message).slice(0, 160)));
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  if (tema === 'dark') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  return { ctx, p };
}

// La app hace scroll dentro de .scroll-area, no en el documento: para la
// captura completa se suelta la altura un momento.
async function captura(p, ruta) {
  const h = await p.addStyleTag({ content: 'html,body,#app,.screen.active,.screen.active .scroll-area{height:auto!important;max-height:none!important;overflow:visible!important}' });
  await p.waitForTimeout(150);
  await p.screenshot({ path: ruta, fullPage: true });
  await h.evaluate((el) => el.remove());
}

// Elementos (y sus hijos) cuyo contenido no cabe a lo ancho.
function desbordes(p, sel) {
  return p.evaluate((s) => {
    const malos = [];
    document.querySelectorAll(s).forEach((raiz) => {
      [raiz, ...raiz.querySelectorAll('*')].forEach((el) => {
        const cs = getComputedStyle(el);   // [v1.73.23] un texto cortado a propósito con "…" no es desborde
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'auto' && cs.textOverflow !== 'ellipsis') malos.push((el.className || el.tagName) + ': ' + (el.textContent || '').trim().slice(0, 40));
      });
    });
    return malos;
  }, sel);
}

async function inicio(nav, base) {
  let { ctx, p } = await abrir(nav, base);
  const n = await p.evaluate(() => campanaEquipos().length);
  chk('campaña: una tarjeta por equipo nuevo', n > 0 && (await p.locator('#camp-wrap .hv3-camp-card').count()) === n, n);
  chk('campaña: puntos solo con 2 o más', (await p.locator('#camp-wrap .hv3-dot').count()) === (n >= 2 ? n : 0));
  chk('momento: 6 pestañas', (await p.locator('#momento-cards [role=tab]').count()) === 6);
  chk('momento: abre en Plata', (await p.locator('#momento-cards [role=tab][aria-selected=true]').innerText()).trim() === 'Plata');
  const nm = await p.locator('#momento-cards .hv3-mcard').count();
  chk('momento: de 1 a 8 tarjetas', nm >= 1 && nm <= 8, nm);
  const sello = await p.evaluate(() => { const e = document.querySelector('#momento-cards .hv3-sello'); return e && { w: e.getBoundingClientRect().width, t: e.textContent, rojo: e.innerHTML.includes('#C8102E') }; });
  chk('momento: sello rojo de 50 px con DESCUENTO', sello && sello.w === 50 && /DESCUENTO/.test(sello.t) && sello.rojo, sello);
  const fuera = await p.evaluate(() => [...document.querySelectorAll('.hv3-sello')].filter((s) => {
    const c = s.closest('.hv3-mcard,.hv3-col-camp'); if (!c) return false; const a = s.getBoundingClientRect(), b = c.getBoundingClientRect();
    return a.right > b.right + 0.5 || a.left < b.left - 0.5; }).length);
  chk('sellos dentro de su tarjeta', fuera === 0, fuera);
  // [v1.73.8] Mensualidad con el enganche máximo en campaña y Equipos del momento.
  const mens = await p.evaluate(() => {
    const txt = (e) => [...e.querySelectorAll('.hv3-eng')].map((x) => x.textContent.trim());
    const camp = txt(document.querySelector('#camp-wrap .hv3-camp-card[onclick*="\'opreno16\'"]'));
    const plan = document.querySelector('#momento-cards [role=tab][aria-selected=true]').textContent.trim();
    const mom = [...document.querySelectorAll('#momento-cards .hv3-mcard')].map((c) => {
      const id = /'(?:ios|android)','([^']+)'/.exec(c.getAttribute('onclick'))[1];
      const m = MOMENTO_BY_PLAN[plan].find((x) => x.id === id);
      const t = [...c.querySelectorAll('.hv3-eng')].map((x) => x.textContent.trim());
      return t[1] === 'Mensualidad: $' + mensualidadMax(m.promo, m.contado, planVis(plan).renta, m.plazo).toLocaleString('es-MX');
    });
    return { camp, mom };
  });
  chk('campaña: Reno 16 Plata $781 y Oro $834 al mes', JSON.stringify(mens.camp) === JSON.stringify(['Enganche máx: $4,719', 'Mensualidad: $781', 'Enganche máx: $3,919', 'Mensualidad: $834']), mens.camp);
  chk('momento: cada tarjeta trae su mensualidad', mens.mom.length > 0 && mens.mom.every(Boolean), mens.mom);
  // [v1.73.14] Ajustados a crédito: pestañas por plan, 8 tarjetas = creditoEquipos.
  // [v1.73.15] Sin selector de plazo: cada tarjeta muestra el plazo de su enganche más bajo.
  const cred = async () => p.evaluate(() => {
    const el = document.getElementById('credito-cards');
    const tarjetas = [...el.querySelectorAll('.hv3-mcard')].map((c) => {
      const m = /'(?:ios|android)','([^']+)','[^']+',(\d+)/.exec(c.getAttribute('onclick'));
      return m[1] + '@' + m[2] + '|' + ((c.querySelector('.hv3-msub') || {}).textContent || '').includes(m[2] + ' meses');
    });
    const plan = (el.querySelector('[role=tab][aria-selected=true]') || {}).textContent;
    const sellos = [...el.querySelectorAll('.hv3-sello')].map((s) => Number(s.getAttribute('aria-label').replace(/\D/g, '')));
    return { tarjetas, plan, sellos, esperado: creditoEquipos(plan).map((x) => x.id + '@' + x.plazo + '|true'),
      tabs: el.querySelectorAll('[role=tab]').length, selector: el.querySelectorAll('.hv3-seg').length };
  });
  let cr = await cred();
  chk('crédito: 6 pestañas, abre en Plata y sin selector de plazo', cr.tabs === 6 && cr.plan === 'Plata' && cr.selector === 0, cr);
  chk('crédito: Plata = creditoEquipos con su plazo (máx 8)', cr.tarjetas.length > 0 && cr.tarjetas.length <= 8 && JSON.stringify(cr.tarjetas) === JSON.stringify(cr.esperado), cr);
  chk('crédito: ningún sello pasa de 50%', cr.sellos.every((n) => n <= 50), cr.sellos);
  await p.locator('#credito-cards [role=tab]', { hasText: 'Azul 1' }).click();
  cr = await cred();
  chk('crédito: Azul 1 también cuadra', cr.plan === 'Azul 1' && cr.tarjetas.length === 8 && JSON.stringify(cr.tarjetas) === JSON.stringify(cr.esperado), cr);
  await p.locator('#credito-cards [role=tab]', { hasText: 'Plata' }).click();
  await p.locator('#momento-cards [role=tab]', { hasText: 'Oro' }).click();
  chk('momento: pestaña Oro', (await p.locator('#momento-cards .hv3-planhead .pw').innerText()).trim() === 'ORO');
  chk('formulario: $2,500', (await p.inputValue('#reco-monto-home')) === '2,500');
  chk('formulario: Plata', (await p.inputValue('#reco-plan-a')) === 'Plata');
  chk('formulario: Oro', (await p.inputValue('#reco-plan-b')) === 'Oro');
  chk('formulario: 36 meses', (await p.inputValue('#reco-plazo')) === '36');
  await p.locator('#momento-cards [role=tab]', { hasText: 'Plata' }).click();
  await captura(p, OUT + '/inicio-claro-390.png');
  chk('claro: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();

  ({ ctx, p } = await abrir(nav, base, { tema: 'dark' }));
  await p.locator('#momento-cards [role=tab]', { hasText: 'Black' }).click();
  const pw1 = await p.evaluate(() => getComputedStyle(document.querySelector('#momento-cards .hv3-planhead .pw')).getPropertyValue('--pw1').trim().toUpperCase());
  chk('oscuro: wordmark Black claro', pw1 === '#F5F5F5', pw1);
  await p.locator('#momento-cards [role=tab]', { hasText: 'Plata' }).click();
  await captura(p, OUT + '/inicio-oscuro-390.png');
  chk('oscuro: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();

  ({ ctx, p } = await abrir(nav, base, { ancho: 360, alto: 780 }));
  chk('360 px: sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= 360));
  const d = await desbordes(p, '.hv3-camp-card, .hv3-mcard, #reco-home');
  const enLinea = await p.evaluate(() => [...document.querySelectorAll('#camp-wrap .hv3-antes-row')].every((r) => {
    const a = r.querySelector('.hv3-antes'), s = r.querySelector('.hv3-sello'); if (!s) return true;
    const x = a.getBoundingClientRect(), y = s.getBoundingClientRect(); return y.top < x.bottom && y.bottom > x.top; }));
  chk('360 px: en campaña el sello va junto a "Antes"', enLinea);
  chk('360 px: nada se desborda en tarjetas ni formulario', d.length === 0, d.slice(0, 5));
  await captura(p, OUT + '/inicio-claro-360.png');
  await ctx.close();

  ({ ctx, p } = await abrir(nav, base, { ancho: 1280, alto: 900 }));
  const izq = await p.locator('#camp-wrap').boundingBox();
  const der = await p.locator('#momento-cards').boundingBox();
  chk('escritorio: campaña a la izquierda y momento a la derecha', izq && der && izq.x < 640 && der.x > 640, { izq, der });
  await captura(p, OUT + '/inicio-claro-1280.png');
  chk('escritorio: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();

  ({ ctx, p } = await abrir(nav, base, { bloquearFotos: true }));
  const sinFoto = await p.evaluate(() => {
    const c = document.querySelector('#camp-wrap .hv3-camp-card');
    return !!c && !c.querySelector('img') && !!c.querySelector('svg');
  });
  chk('fotos diferidas: ícono de respaldo mientras no llegan', sinFoto);
  const src = await p.evaluate(() => {
    const id = campanaEquipos()[0].id;
    IMG[id] = 'img/' + id + '.webp';
    window._onCatalogImgReady();
    const img = document.querySelector('#camp-wrap img[data-img-id]');
    return img ? img.getAttribute('src') : '';
  });
  chk('fotos diferidas: la foto aparece al llegar', !!src, src);
  await ctx.close();
}

async function reco(nav, base) {
  let { ctx, p } = await abrir(nav, base);
  const activa = () => p.evaluate(() => (document.querySelector('.screen.active') || {}).id);
  const titulo = () => p.locator('#reco-res .hv3-rtitulo').innerText();
  const nombres = () => p.locator('#reco-res .hv3-rcard .hv3-rname b').allInnerTexts();
  const esperado = (m, a, b, z) => p.evaluate(([m, a, b, z]) => {
    const r = recoCalcular(m, a, b, z);
    const n = r.lista.length;
    return { titulo: n === 0 ? 'Sin equipos' : (n === 1 ? '1 equipo' : n + ' equipos'), n, seis: r.lista.slice(0, 6).map((x) => x.nombre), minimo: r.minimo };
  }, [m, a, b, z]);

  await p.locator('#reco-home .hv3-btn').click();
  chk('Ver equipos abre la pantalla', (await activa()) === 's-reco');
  let e = await esperado(2500, 'Plata', 'Oro', 36);
  chk('$2,500 Plata y Oro: título', (await titulo()).trim() === e.titulo, [await titulo(), e.titulo]);
  chk('$2,500 Plata y Oro: los 6 primeros', JSON.stringify(await nombres()) === JSON.stringify(e.seis), await nombres());
  chk('hay botón de compartir', (await p.locator('#reco-res .hv3-compartir').count()) === 1);
  const rr = await p.evaluate(() => ({ n: document.querySelectorAll('#reco-res .hv3-rcard').length, t: document.getElementById('reco-res').textContent }));
  chk('recomendación: sin mensualidad (no se pidió)', rr.n > 0 && !/Mensualidad/.test(rr.t), [rr.n, rr.t.slice(0, 120)]);
  await captura(p, OUT + '/reco-claro-390.png');
  if (e.n > 6) {
    await p.locator('#reco-res .hv3-mas').click();
    chk('Ver los N muestra todos', (await p.locator('#reco-res .hv3-rcard').count()) === e.n, e.n);
  }

  const marcas = await p.evaluate(() => recoMarcas());
  chk('marca: un botón por marca + Todas', (await p.locator('#reco-ctrl .hv3-marcabtn').count()) === marcas.length + 1, marcas);
  chk('marca: abre en Todas', (await p.locator('#reco-ctrl .hv3-marcabtn[aria-pressed=true]').innerText()).trim() === 'Todas');
  await p.locator('#reco-ctrl .hv3-marcabtn', { hasText: 'Samsung' }).click();
  const eS = await p.evaluate(() => { const r = recoCalcular(2500, 'Plata', 'Oro', 36, 'SAMSUNG'); const n = r.lista.length; return { titulo: n === 0 ? 'Sin equipos' : (n === 1 ? '1 equipo' : n + ' equipos'), seis: r.lista.slice(0, 6).map((x) => x.nombre) }; });
  chk('marca Samsung: título y equipos de Samsung', (await titulo()).trim() === eS.titulo && JSON.stringify(await nombres()) === JSON.stringify(eS.seis), [await titulo(), eS]);
  chk('marca Samsung: todos los nombres son Samsung', (await nombres()).every((n) => /Galaxy|Samsung/.test(n)), await nombres());
  await captura(p, OUT + '/reco-samsung-390.png');
  await p.locator('#reco-ctrl .hv3-marcabtn', { hasText: 'Todas' }).click();
  chk('marca: Todas regresa la lista completa', (await titulo()).trim() === (await esperado(2500, 'Plata', 'Oro', 36)).titulo);
  await p.fill('#reco-monto', '2000');
  e = await esperado(2000, 'Plata', 'Oro', 36);
  chk('$2,000 Plata y Oro: Sin equipos', (await titulo()).trim() === 'Sin equipos' && e.n === 0, await titulo());
  chk('$2,000: dice el enganche mínimo', (await p.locator('#reco-res .hv3-rmin').innerText()).trim() === 'Enganche mínimo para Plata y Oro: $' + e.minimo.toLocaleString('es-MX'));
  chk('sin equipos no hay compartir', (await p.locator('#reco-res .hv3-compartir').count()) === 0);
  await captura(p, OUT + '/reco-vacia-390.png');

  await p.locator('#reco-ctrl .hv3-planbtn', { hasText: 'Azul 3' }).click();
  const presionados = await p.locator('#reco-ctrl .hv3-planbtn[aria-pressed=true]').allInnerTexts();
  chk('Azul 3 reemplaza al plan más antiguo', JSON.stringify(presionados.sort()) === JSON.stringify(['Azul 3', 'Oro']), presionados);
  e = await esperado(2000, 'Azul 3', 'Oro', 36);
  chk('$2,000 Azul 3 y Oro: coincide con el cálculo', (await titulo()).trim() === e.titulo && JSON.stringify(await nombres()) === JSON.stringify(e.seis), [await titulo(), e.titulo]);

  await p.goBack();
  await p.waitForTimeout(300);
  chk('atrás del teléfono regresa al inicio', (await activa()) === 's-home', await activa());
  chk('el inicio recuerda el último monto', (await p.inputValue('#reco-monto-home')) === '2,000', await p.inputValue('#reco-monto-home'));
  await p.fill('#reco-monto-home', '');
  await p.locator('#reco-home .hv3-btn').click();
  chk('sin enganche no avanza', (await activa()) === 's-home');
  chk('sin enganche lo dice', (await p.locator('#reco-home-msg').innerText()).trim() === 'Escribe el enganche del cliente');
  chk('reco claro: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();

  ({ ctx, p } = await abrir(nav, base, { tema: 'dark' }));
  await p.locator('#reco-home .hv3-btn').click();
  await captura(p, OUT + '/reco-oscuro-390.png');
  chk('reco oscuro: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();

  ({ ctx, p } = await abrir(nav, base, { ancho: 360, alto: 780 }));
  await p.locator('#reco-home .hv3-btn').click();
  await p.locator('#reco-res .hv3-mas').click().catch(() => {});
  const d = await desbordes(p, '.hv3-rcard, .hv3-mcard');
  chk('360 px: tarjetas sin desbordes', d.length === 0, d.slice(0, 5));
  chk('360 px: sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= 360));
  await captura(p, OUT + '/reco-claro-360.png');
  await ctx.close();
}

const LEYENDA = '* Pago inicial sujeto a aprobación crediticia · Consulta términos y condiciones · Precios sujetos a cambio sin previo aviso';

async function hoja(nav, base) {
  const { ctx, p } = await abrir(nav, base);
  await p.locator('#reco-home .hv3-btn').click();
  const btn = p.locator('#reco-res .hv3-compartir');
  await btn.dispatchEvent('click');
  await btn.dispatchEvent('click'); // doble toque
  await p.waitForSelector('#flyer-preview-container img', { timeout: 20000 });
  await p.waitForTimeout(400);
  chk('la vista previa se abre', await p.evaluate(() => document.getElementById('flyer-preview-overlay').classList.contains('show')));
  chk('doble toque: una sola imagen', (await p.locator('#flyer-preview-container img').count()) === 1);
  const ancho = await p.evaluate(() => document.querySelector('#flyer-preview-container img').naturalWidth);
  chk('la imagen mide 1080 px de ancho (540 a escala 2)', ancho === 1080, ancho);
  const src = await p.evaluate(() => document.querySelector('#flyer-preview-container img').src);
  fs.writeFileSync(OUT + '/hoja.png', Buffer.from(src.split(',')[1], 'base64'));
  const html = await p.evaluate(() => (document.querySelector('#cot-flyer-render .hoja-reco') || {}).innerHTML || '');
  chk('la hoja trae la leyenda exacta', html.includes(LEYENDA));
  chk('la hoja trae el nombre del asesor', html.includes(SES.name));
  chk('la hoja trae el sello con DESCUENTO', html.includes('>DESCUENTO</text>'));
  const nTarjetas = await p.evaluate(() => document.querySelectorAll('#cot-flyer-render .hoja-card').length);
  const esperadas = await p.evaluate(() => Math.min(6, recoCalcular(recoState.monto, recoState.planes[0], recoState.planes[1], recoState.plazo).lista.length));
  chk('la hoja trae los primeros 6', nTarjetas === esperadas && nTarjetas > 0, [nTarjetas, esperadas]);
  await p.evaluate(() => {
    window.__reg = 0;
    const orig = window.registrarCotizacion;
    window.registrarCotizacion = function () { window.__reg++; return orig.apply(this, arguments); };
  });
  const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.locator('#flyer-share-btn').click()]);
  chk('sin share del sistema se descarga el PNG', /^recomendacion-primemx-\d+\.png$/.test(descarga.suggestedFilename()), descarga.suggestedFilename());
  await p.waitForTimeout(300);
  chk('compartir la hoja no registra cotización', (await p.evaluate(() => window.__reg)) === 0);
  chk('al cerrar, el flyer de cotización vuelve a su modo', (await p.evaluate(() => _flyerModo)) === 'cot');
  chk('sin marca elegida la hoja no lleva título', (await p.evaluate(() => document.querySelectorAll('#cot-flyer-render .hoja-titulo').length)) === 0);
  await p.evaluate(() => { recoState.monto = 2500; recoState.planes = ['Plata', 'Oro']; recoState.plazo = 36; recoState.marca = 'SAMSUNG'; document.getElementById('flyer-preview-container').innerHTML = ''; return recoGenerarHoja(); });
  await p.waitForSelector('#flyer-preview-container img', { timeout: 20000 });
  const tit = await p.evaluate(() => (document.querySelector('#cot-flyer-render .hoja-titulo') || {}).textContent || '');
  chk('con marca, la hoja lleva la marca de título', tit.trim() === 'SAMSUNG', tit);
  const marcasHoja = await p.evaluate(() => [...document.querySelectorAll('#cot-flyer-render .hoja-nombre b')].map((b) => b.textContent));
  chk('con marca, la hoja trae solo esa marca', marcasHoja.length > 0 && marcasHoja.every((n) => /Galaxy|Samsung/.test(n)), marcasHoja);
  const dT = await desbordes(p, '#cot-flyer-render .hoja-titulo');
  chk('el título no se desborda', dT.length === 0, dT);
  const sm = await p.evaluate(() => document.querySelector('#flyer-preview-container img').src);
  fs.writeFileSync(OUT + '/hoja-samsung.png', Buffer.from(sm.split(',')[1], 'base64'));
  await p.evaluate(() => { recoState.marca = ''; closeFlyerPreview(); });
  // Nombres largos e INCLUIDO: Black y Platino con $4,000 trae "Moto Edge 70 Pro + Watch"; Azul 1 y 2 con $1,500 trae equipos incluidos.
  for (const [m, pa, pb, archivo] of [[4000, 'Black', 'Platino', 'hoja-larga.png'], [1500, 'Azul 1', 'Azul 2', 'hoja-incluido.png'], [6000, 'Plata', 'Oro', 'hoja-cara.png']]) {
    await p.evaluate(([m, pa, pb]) => { recoState.monto = m; recoState.planes = [pa, pb]; recoState.plazo = 36; recoState.todos = false; }, [m, pa, pb]);
    await p.evaluate(() => { document.getElementById('flyer-preview-container').innerHTML = ''; return recoGenerarHoja(); });
    await p.waitForSelector('#flyer-preview-container img', { timeout: 20000 });
    const d = await desbordes(p, '#cot-flyer-render .hoja-card');
    if (pb === 'Platino') { const t = await p.evaluate(() => document.querySelector('#cot-flyer-render .hoja-reco').textContent); chk('rentas con separador de miles ($1,035)', t.includes('50 GB | $1,035') && t.includes('42 GB | $825')); }
    chk(archivo + ': nada se desborda en las tarjetas', d.length === 0, d.slice(0, 5));
    const s2 = await p.evaluate(() => document.querySelector('#flyer-preview-container img').src);
    fs.writeFileSync(OUT + '/' + archivo, Buffer.from(s2.split(',')[1], 'base64'));
    await p.evaluate(() => closeFlyerPreview());
  }
  chk('la hoja no lleva mensualidad', !/Mensualidad/.test(await p.evaluate(() => document.querySelector('#cot-flyer-render').textContent)));
  chk('hoja: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();
}

// Precio y "Enganche máx" de la tarjeta = lo que muestra la ficha en ese plan y plazo.
async function ficha(nav, base) {
  const { ctx, p } = await abrir(nav, base);
  await p.locator('#reco-home .hv3-btn').click();
  const lista = await p.evaluate(() => recoCalcular(2500, 'Plata', 'Oro', 36).lista.slice(0, 6).map((x) => ({ id: x.id, nombre: x.nombre, promo: x.a.promo, eng: x.a.eng, pct: x.a.pct })));
  for (const i of [0, 3, 5]) {
    const x = lista[i];
    if (!x) continue;
    await p.evaluate(() => { show('s-reco'); recoRender(); });
    await p.locator('#reco-res .hv3-rcard').nth(i).click();
    await p.waitForTimeout(900);
    // [v1.73.23] Tarjeta de precio compacta (.fx-precio): plan y plazo en data-*,
    // % en el sello y el enganche máx (o el tope de rentas) en la primera columna.
    const f = await p.evaluate(() => {
      const c = document.querySelector('#price-result .fx-precio');
      if (!c) return { plan: '', plazo: '', promo: '', pct: '', eng: '' };
      const t = (s) => (c.querySelector(s) || {}).textContent || '';
      const sello = c.querySelector('.hv3-sello');
      return { plan: c.dataset.plan, plazo: c.dataset.plazo, promo: t('.fx-monto'), pct: sello ? sello.getAttribute('aria-label') : '', eng: t('.fx-col b') };
    });
    const promoFicha = f.promo.includes('Incluido') ? 0 : Number(f.promo.replace(/[^0-9.]/g, ''));
    const engFicha = Number((f.eng.split(' a ').pop() || '').replace(/[^0-9.]/g, ''));
    chk(x.nombre + ': la ficha abre en Plata a 36 meses', f.plan === 'Plata' && f.plazo === '36', f);
    chk(x.nombre + ': mismo precio que la tarjeta', Math.abs(promoFicha - x.promo) < 0.005, [promoFicha, x.promo]);
    chk(x.nombre + ': mismo % que la tarjeta', f.pct === (x.promo === 0 ? '' : x.pct + '% de descuento'), [f.pct, x.pct]);
    chk(x.nombre + ': mismo enganche máx que la tarjeta', engFicha === x.eng, [f.eng, x.eng]);
  }
  chk('ficha: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();
}

// [v1.73.7] Pastilla de puntos de marca: donde la ve el asesor sí, donde la ve el cliente no.
async function puntos(nav, base) {
  const { ctx, p } = await abrir(nav, base);
  const pts = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);
  // Campaña: la primera es el Reno 16.
  const camp = await pts('#camp-wrap .hv3-camp-card[onclick*="\'opreno16\'"] .hv3-camp-name .pts-pill');
  chk('campaña: el Reno 16 lleva 330 pts', camp.length === 1 && camp[0] === '330 pts', camp);
  const estilo = await p.evaluate(() => [...document.querySelectorAll('.pts-pill')].map((e) => { const b = getComputedStyle(e.querySelector('b')), q = getComputedStyle(e); return b.color + '|' + q.color + '|' + q.backgroundColor; }));
  chk('pastilla: número dorado y "pts" blanco sobre marino en todas', estilo.length > 0 && estilo.every((x) => x === 'rgb(255, 197, 49)|rgb(255, 255, 255)|rgb(19, 32, 62)'), [...new Set(estilo)]);
  // Momento y recomendación: pastilla solo en los equipos con puntos.
  const cuadra = (sel, foto) => p.evaluate(([s, f]) => [...document.querySelectorAll(s)].every((c) => {
    const id = (/'(?:ios|android)','([^']+)'/.exec(c.getAttribute('onclick')) || [])[1];
    const el = c.querySelector(f + ' .pts-pill'); const n = puntosEquipo(id);
    return n ? !!el && el.textContent.includes(String(n)) : !el; }), [sel, foto]);
  chk('momento: pastilla justo en los equipos con puntos', await cuadra('#momento-cards .hv3-mcard', '.hv3-mfoto'));
  await p.locator('#reco-home .hv3-btn').click();
  chk('recomendación: pastilla justo en los equipos con puntos', await cuadra('#reco-res .hv3-rcard', '.hv3-rfoto'));
  // Catálogo (cuadrícula y lista).
  await p.evaluate(() => { showCatalog('android'); setFilter('OPPO'); });
  const grid = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#dev-wrap .d-card')].map((c) => [/showFicha\('([^']+)'\)/.exec(c.getAttribute('onclick'))[1], (c.querySelector('.cv-foto .pts-pill') || {}).textContent || ''])));
  // El Reno 16F solo cuenta mientras esté vigente (su lista vence y se oculta del catálogo).
  const r16fVig = await p.evaluate(() => isVigent('opreno16f'));
  chk('catálogo: Reno 16 330, Reno 16F 225 (si está vigente), A6 45', /330/.test(grid.opreno16) && (!r16fVig || /225/.test(grid.opreno16f)) && (r16fVig || !('opreno16f' in grid)) && /45/.test(grid.opa6), grid);
  chk('catálogo: A5 sin pastilla y Find X9 Pro sigue oculto', grid.opa5 === '' && !('opfindx9pro' in grid), grid);
  await p.evaluate(() => toggleView());
  const lista = await pts('#dev-wrap .d-row .cv-chips .pts-pill');
  chk('catálogo en lista también la lleva', lista.length === Object.values(grid).filter(Boolean).length, lista);
  await p.evaluate(() => toggleView());
  // Ficha + Tu comisión.
  await p.evaluate(() => { show('s-ficha'); showFicha('hx6e_256'); });
  await p.waitForTimeout(500);
  const fb = await pts('#s-ficha .fx-foto .pts-pill');
  chk('ficha Honor X6E 256: 130 pts y sin "+$"', fb.length === 1 && fb[0] === '130 pts' && (await p.locator('#s-ficha .comm-badge-ficha').count()) === 0, fb);
  await p.evaluate(() => { showFicha('opreno16'); selectPlan('Plata'); openCotModal(); });
  await p.waitForTimeout(500);
  const com = await p.evaluate(() => ({ t: document.getElementById('comm-body-inner').textContent, total: document.getElementById('comm-amount').textContent, plan: getPlanCommission('Plata') }));
  chk('Tu comisión: +330 pts aparte del total en pesos', /Puntos oppo\s*\+330 pts/i.test(com.t) && com.total === '$' + com.plan.toLocaleString('es-MX'), com);
  await p.evaluate(() => { if (typeof closeCotModal === 'function') closeCotModal(); selectPlan('Azul 2'); openCotModal(); });
  await p.waitForTimeout(500);
  const com2 = await p.evaluate(() => document.getElementById('comm-body-inner').textContent);
  chk('Tu comisión en Azul 2: avisa los 330 pts desde Azul 3', /330 pts desde plan Azul 3/.test(com2), com2);
  await p.evaluate(() => { if (typeof closeCotModal === 'function') closeCotModal(); });
  // Top comisiones: ranking por puntos.
  await p.evaluate(() => { showTopComm(); setTopCommPlan('Plata'); });
  const top = await p.evaluate(() => ({ h: document.getElementById('top-comm-list').textContent, n: document.querySelectorAll('#top-comm-list .top-comm-item').length, primero: (document.querySelector('#top-comm-list .top-comm-name') || {}).textContent }));
  chk('Top comisiones: arriba el Edge 70 Pro con 450 pts, sin pesos de bono', /450 pts/.test(top.h) && /Edge 70 Pro/.test(top.primero) && !/\+\$/.test(top.h) && !/Find X9/.test(top.h), top);
  await p.evaluate(() => setTopCommPlan('Azul 2'));
  chk('Top comisiones en Azul 2: los puntos aplican desde Azul 3', /desde plan Azul 3/.test(await p.evaluate(() => document.getElementById('top-comm-list').textContent)));
  // Vigencias (solo Diego): los flyers de puntos con su fecha, sin pesos.
  const vig = await p.evaluate(() => { const r = vigenciasResumen(); openVigencias(); const t = document.getElementById('vig-overlay').textContent; document.getElementById('vig-overlay').remove(); document.body.style.overflow = '';
    return { n: r.bonos.length, venc: r.bonosVencidos.length, nombres: r.bonos.map((b) => b.name), t }; });
  chk('Vigencias: 16 equipos con puntos, ninguno vencido', vig.n === 16 && vig.venc === 0, vig.n);
  chk('Vigencias: X6E 128 y 256 por separado', vig.nombres.includes('Honor X6E 128 GB') && vig.nombres.includes('Honor X6E 256 GB'), vig.nombres);
  chk('Vigencias: en puntos, sin "$" de bono', /450 pts/.test(vig.t) && !/\$\d/.test(vig.t), vig.t.slice(0, 300));
  // [v1.73.16] Si dos capacidades comparten nombre, la lista de equipos dice cuál es.
  const vig2 = await p.evaluate(() => {
    const r = vigenciasResumen(), all = CAT.ios.concat(CAT.android);
    const filas = r.porVencer.concat(r.vencidosBono, r.vencidos);
    const malos = filas.filter((f) => { const d = all.find((x) => x.id === f.id); return all.some((x) => x.id !== d.id && x.name === d.name) && f.name === d.name; });
    openVigencias(); const t = document.getElementById('vig-overlay').textContent; document.getElementById('vig-overlay').remove(); document.body.style.overflow = '';
    return { malos: malos.map((f) => f.id + ':' + f.name), bono: /bono/i.test(t) };
  });
  chk('Vigencias: equipos con nombre repetido llevan su capacidad', vig2.malos.length === 0, vig2.malos);
  chk('Vigencias: ya no dice "bono"', !vig2.bono);
  chk('puntos: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();
  // Hoja de WhatsApp (va al cliente): nunca, aunque la lista traiga equipos con puntos.
  const h = await abrir(nav, base);
  await h.p.locator('#reco-home .hv3-btn').click();
  const conPts = await h.p.evaluate(() => recoCalcular(2500, 'Plata', 'Oro', 36).lista.slice(0, 6).filter((x) => puntosEquipo(x.id)).length);
  await h.p.locator('#reco-res .hv3-compartir').dispatchEvent('click');
  await h.p.waitForSelector('#flyer-preview-container img', { timeout: 20000 });
  const txt = await h.p.evaluate(() => document.querySelector('#cot-flyer-render').textContent);
  chk('hoja de WhatsApp sin puntos (' + conPts + ' equipos de la hoja traen puntos)', (await h.p.locator('#cot-flyer-render .pts-pill').count()) === 0 && !/\bpts\b|puntos/i.test(txt));
  await h.ctx.close();
}

// [v1.73.18] Precalificación: quién ve el botón y el flujo completo de punta a punta.
async function precal(nav, base) {
  const asesor = (tienda, attuid) => Object.assign({}, SES, { name: 'ASESOR PRUEBA', attuid: attuid || 'AP123X', rol: 'asesor', tiendasAsignadas: [], tienda, sucursal: tienda });
  const casos = [
    ['DC499W', SES, true],
    ['asesor de León Centro', asesor('PRM TDA LEON CENTRO'), true],
    ['asesor de Plaza Nogal León', asesor('PRM TDA PLAZA NOGAL LEON'), true],
    ['asesor de León Flagship', asesor('PRM TDA LEON FLAGSHIP'), false],
    ['regional con León Centro asignada', Object.assign(asesor('PRM TDA PLAZA ROSSINI', 'RG777X'), { rol: 'regional', tiendasAsignadas: ['PRM TDA LEON CENTRO'] }), false],
  ];
  for (const [nombre, ses, ve] of casos) {
    const { ctx, p } = await abrir(nav, base, { ses });
    const vis = await p.evaluate(() => getComputedStyle(document.getElementById('precal-home-card')).display !== 'none');
    await p.evaluate(() => precalAbrir()); await p.waitForTimeout(300);
    const abre = await p.evaluate(() => document.getElementById('s-precal').classList.contains('active'));
    chk('acceso ' + nombre + (ve ? ': ve el botón y abre' : ': ni botón ni pantalla'), vis === ve && abre === ve, { vis, abre });
    await ctx.close();
  }
  for (const tema of ['light', 'dark']) {
    const { ctx, p } = await abrir(nav, base, { tema });
    await p.evaluate(() => pmdOpen()); await p.waitForTimeout(300);
    await p.locator('#precal-home-card').click(); await p.waitForTimeout(900);
    await p.locator('.pc-inicio').click(); await p.waitForTimeout(200);
    const ins = p.locator('#precal-wrap input');
    await ins.nth(0).fill('maría lópez'); await ins.nth(1).fill('LOHM900215MGTPRR08'); await ins.nth(2).fill('1990-02-15'); await ins.nth(3).fill('2031'); await ins.nth(4).fill('4771234567');
    await p.locator('.pc-check input').check();
    chk(tema + ': CURP válida e INE vigente', (await p.locator('#pc-chips .pc-ok').count()) === 2);
    await p.locator('.pc-sig').click(); await p.waitForTimeout(200);
    await p.locator('#precal-wrap .hv3-btn', { hasText: 'Calcular' }).click(); await p.waitForTimeout(300);
    chk(tema + ': sin respuestas no calcula y dice cuántas faltan', /Faltan 11 respuestas/.test(await p.locator('#pc-msg').textContent()) && (await p.locator('.pc-q.falta').count()) === 11);
    const R = [['Portabilidad'], ['Pospago, 1 año o más'], ['Sin adeudos', 0], ['$10,000 a $15,000'], ['Oro'], ['36 meses'], ['Departamental o de tienda'], ['No', 'limite'], ['Ninguno', 'vivienda'], ['No', 'negado'],
      ['No', 'atraso'], ['Menos de 1 mes', 'peor'], ['Sin adeudos', 'otra'], ['$12,000 a $20,000'], ['$1,000 a $3,000'], ['Sí', 'comprobante']];
    for (const [txt, k] of R) {
      const sel = typeof k === 'string' ? '#pcq-' + k + ' button' : '#precal-wrap button';
      await p.locator(sel, { hasText: new RegExp('^' + txt.replace(/[$()]/g, '\\$&') + '$') }).first().click();
    }
    await p.locator('#precal-wrap .hv3-btn', { hasText: 'Calcular' }).click(); await p.waitForTimeout(400);
    const res = await p.evaluate(() => ({ pct: document.querySelector('.pc-anillo-n').textContent, perfil: document.querySelector('.pc-perfil').textContent, alt: (document.querySelector('.pc-alt-t') || {}).textContent }));
    chk(tema + ': resultado del ejemplo del mockup (58%, perfil B, alterna Azul 2)', res.pct === '58%' && res.perfil === 'Perfil B' && /^Azul 2 · /.test(res.alt || ''), res);
    chk(tema + ': nada se sale a lo ancho en el resultado', (await desbordes(p, '#precal-wrap')).length === 0, await desbordes(p, '#precal-wrap'));
    await p.locator('#precal-wrap .hv3-btn', { hasText: 'Guardar' }).click(); await p.waitForTimeout(300);
    const g = await p.evaluate(() => JSON.parse(localStorage.getItem('tg_precal_v1_DC499W'))[0]);
    chk(tema + ': se guarda con nombre, sin CURP ni fecha de nacimiento', g.nombre === 'MARÍA LÓPEZ' && !/LOHM900215|1990-02-15/.test(JSON.stringify(g)) && g.bitacora.versionConfig === 'v2-inicial', g.datos.identidad);
    chk(tema + ': queda pendiente y abierta para registrar', /Pendientes · 1/.test(await p.locator('.pc-seg').textContent()) && (await p.locator('.pc-item.abierto').count()) === 1);
    await p.locator('.pc-reg .pc-chip', { hasText: 'Solicitado · Oro' }).click();
    await p.locator('.pc-reg .pc-chip', { hasText: 'Aprobada con otro plan' }).click();
    await p.locator('.pc-reg .pc-chip', { hasText: /^Plata$/ }).click();
    await p.locator('.pc-reg .hv3-btn').click(); await p.waitForTimeout(300);
    const reg = await p.evaluate(() => JSON.parse(localStorage.getItem('tg_precal_v1_DC499W'))[0].registro);
    chk(tema + ': resultado de AT&T registrado con sus filas de calibración', reg && reg.resp === 'otro' && reg.plan === 'Plata' && reg.filas.map((f) => f.y).join() === '0,1', reg);
    chk(tema + ': sin pendientes después de registrar', /Pendientes · 0/.test(await p.locator('.pc-seg').textContent()));
    chk(tema + ': sin errores de página', p.errores.length === 0, p.errores);
    await ctx.close();
  }
}

// [v1.73.19] Platino + (solo 36 meses, sin portabilidad) en la ficha y la cotización; Diamante ya no sale.
async function platino(nav, base) {
  const { ctx, p } = await abrir(nav, base);
  await p.evaluate(() => { show('s-ficha'); showFicha('ip17'); }); await p.waitForTimeout(900);
  const chips = await p.evaluate(() => [...document.querySelectorAll('#plan-chips .plan-chip')].map((c) => c.dataset.plan));
  chk('iPhone 17: trae Platino + y no Diamante', chips.includes('Platino +') && !chips.includes('Diamante'), chips);
  chk('iPhone 17: sin Titanio (oculto 24-nov)', !chips.includes('Titanio'), chips);
  await p.evaluate(() => { setPlazo(24, document.querySelector('.plazo-btn')); selectPlan('Platino +'); }); await p.waitForTimeout(300);
  const f = await p.evaluate(() => ({
    plazos: [...document.querySelectorAll('.plazo-btn')].map((b) => [b.textContent.trim(), b.style.pointerEvents !== 'none', b.classList.contains('active')]),
    plan: ((c) => c ? c.dataset.plan + ' · ' + c.dataset.plazo + ' meses' : '')(document.querySelector('#price-result .fx-precio')),
    promo: (document.querySelector('#price-result .fx-monto') || {}).textContent || '', cur: curPlazo }));
  chk('Platino +: solo 36 meses y salta solo a 36', f.cur === 36 && f.plazos.map((x) => x[1]).join() === 'false,false,true' && f.plazos[2][2], f);
  chk('Platino +: iPhone 17 incluido a 36 meses', /Platino \+ · 36 meses/.test(f.plan) && /Incluido/i.test(f.promo), f);
  await p.evaluate(() => openCotModal()); await p.waitForTimeout(500);
  const port = await p.evaluate(() => getComputedStyle(document.getElementById('cot-port-switch').closest('.cot-section')).display);
  chk('Platino +: la cotización no ofrece portabilidad', port === 'none', port);
  const com = await p.evaluate(() => { const r = [...document.querySelectorAll('#comm-body-inner .comm-row')].find((x) => /Plan Platino \+/.test(x.textContent)); return r ? r.textContent : ''; });
  chk('Platino +: comisión del plan "—" (sin dato en el esquema)', /—/.test(com) && !/\$0/.test(com), com);
  await p.evaluate(() => cotClose());
  await p.evaluate(() => { selectPlan('Platino'); }); await p.waitForTimeout(200);
  const vuelta = await p.evaluate(() => [...document.querySelectorAll('.plazo-btn')].map((b) => b.style.pointerEvents !== 'none'));
  chk('de regreso a Platino se habilitan los 3 plazos', vuelta.every(Boolean), vuelta);
  await p.evaluate(() => openCotModal()); await p.waitForTimeout(400);
  const port2 = await p.evaluate(() => getComputedStyle(document.getElementById('cot-port-switch').closest('.cot-section')).display);
  chk('en Platino sí se ofrece portabilidad', port2 !== 'none', port2);
  await p.evaluate(() => cotClose());
  await p.evaluate(() => { show('s-ficha'); showFicha('ip18pro'); }); await p.waitForTimeout(700);
  const ch18 = await p.evaluate(() => [...document.querySelectorAll('#plan-chips .plan-chip')].map((c) => c.dataset.plan));
  chk('iPhone 18 Pro: sigue con Titanio', ch18.includes('Titanio'), ch18);
  // Un Android no muestra Platino + ni Diamante.
  await p.evaluate(() => { show('s-ficha'); showFicha('opreno16'); }); await p.waitForTimeout(700);
  const ch2 = await p.evaluate(() => [...document.querySelectorAll('#plan-chips .plan-chip')].map((c) => c.dataset.plan));
  chk('Reno 16: sin Platino + ni Diamante', !ch2.includes('Platino +') && !ch2.includes('Diamante') && ch2.includes('Platino'), ch2);
  // Descuentos: pestaña Platino + a 36 meses con el iPhone 17 incluido.
  await p.evaluate(() => { showDescuentos(); descSetPlan('Platino +'); descSetPlazo('36'); }); await p.waitForTimeout(400);
  const d = await p.evaluate(() => ({ pills: [...document.querySelectorAll('#desc-plan-pills button')].map((b) => b.textContent), txt: document.getElementById('desc-list').textContent }));
  chk('Descuentos: pestaña Platino + (sin Diamante) con el iPhone 17 incluido', d.pills.includes('Platino +') && !d.pills.includes('Diamante') && /iPhone 17/.test(d.txt) && /incluido/i.test(d.txt), d.pills);
  chk('platino: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();
  // Catálogo público: iPhone 17 ofrece Platino + solo a 36 meses.
  const c2 = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const q = await c2.newPage(); const err = []; q.on('pageerror', (e) => err.push(e.message));
  await q.goto(base + 'catalogo.html', { waitUntil: 'load' }); await q.waitForTimeout(1500);
  const pl = await q.evaluate(() => { try { var o = Object.values(window).find((v) => v && typeof v === 'object' && Array.isArray(v.PL) && typeof v.mensual === 'function'); return o ? { PL: o.PL, m36: o.mensual('ip17', 'Platino +', 36, 0), m24: o.mensual('ip17', 'Platino +', 24, 0) } : null; } catch (e) { return String(e); } });
  chk('catálogo público: Platino + $1,299 a 36 meses, nada a 24', pl && pl.PL.includes('Platino +') && !pl.PL.includes('Diamante') && pl.m36 === 1299 && pl.m24 === null, pl);
  chk('catálogo público: sin errores de página', err.length === 0, err);
  await c2.close();
}

// [v1.73.21] Uso de la app: los clics reales suman en su herramienta, se mandan sin datos de la persona
// y el panel Desarrollador solo lo ve DC499W.
const USO_FIXTURE = [
  { tipo: 'uso', fecha: '2026-11-20', region: 'BAJIO', tienda: { PRM_TDA_LEON_CENTRO: { ini_campana: 40, ficha_cotizar: 31, ficha_plan: 58, cot_texto: 22, menu_calc: 3 }, PRM_TDA_PLAZA_NOGAL_LEON: { ini_campana: 18, ini_reco: 12, ficha_plan: 20 } } },
  { tipo: 'uso', fecha: '2026-11-21', region: 'BAJIO', tienda: { PRM_TDA_LEON_CENTRO: { ini_mom_eq: 25, cat_eq: 44, cot_imagen: 9 } } },
  { tipo: 'uso', fecha: '2026-11-21', region: 'NORTE', tienda: { PRM_TDA_MONTERREY: { cat_eq: 70, ficha_t_specs: 15 } } },
];
async function uso(nav, base) {
  const asesor = Object.assign({}, SES, { name: 'ASESOR PRUEBA', attuid: 'AP123X', rol: 'asesor', tiendasAsignadas: [], tienda: 'PRM TDA LEON CENTRO', sucursal: 'PRM TDA LEON CENTRO' });
  let { ctx, p } = await abrir(nav, base, { ses: asesor });
  await p.evaluate(() => localStorage.removeItem('primemx_uso_clics_v1'));
  const clic = async (sel) => { await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.locator(sel).first().click(); await p.waitForTimeout(350); };
  await clic('.hv3-camp-card'); await p.evaluate(() => show('s-home'));
  await clic('#momento-cards .hv3-tab >> nth=1');
  await clic('#reco-home .hv3-btn'); await clic('#reco-res .hv3-rcard'); await p.evaluate(() => show('s-home'));
  await clic('#pmd-burger'); await clic('[onclick="pmdGo(\'calc\')"]'); await p.waitForTimeout(300);
  await p.evaluate(() => show('s-home')); await clic('[onclick^="abrirPlatSheet"]'); await clic('[onclick="elegirPlataforma(\'android\')"]');
  await clic('#dev-wrap .d-card, #dev-wrap .d-row'); await clic('.plan-chip >> nth=1'); await clic('.plazo-btn >> nth=2');
  await clic('[onclick^="enviarCotizacion"]'); await clic('#cot-port-switch');
  await p.evaluate(() => cotClose());
  const hoy = await p.evaluate(() => usoFechaLocal());
  const reg = await p.evaluate(() => JSON.parse(localStorage.getItem('primemx_uso_clics_v1') || '{}'));
  const dia = (reg.dias || {})[hoy] || {};
  const esperadas = ['ini_campana', 'ini_mom_tab', 'ini_reco', 'reco_eq', 'menu_abrir', 'menu_calc', 'ini_catalogo', 'cat_eq', 'ficha_plan', 'ficha_plazo', 'ficha_cotizar', 'cot_port'];
  chk('clics reales: cada uno suma en su herramienta', esperadas.every((k) => dia[k] >= 1), { faltan: esperadas.filter((k) => !dia[k]), dia });
  chk('asesor: no ve el botón Desarrollador ni abre el panel', await p.evaluate(() => { usoAbrir(); return getComputedStyle(document.getElementById('dev-home-card')).display === 'none' && !document.getElementById('s-uso').classList.contains('active'); }));
  // Envío con Firestore simulado: solo días anteriores, sin datos de la persona.
  const env = await p.evaluate(async (hoy) => {
    const r = JSON.parse(localStorage.getItem('primemx_uso_clics_v1'));
    r.dias['2026-01-02'] = { ini_campana: 3, menu_calc: 1 };
    localStorage.setItem('primemx_uso_clics_v1', JSON.stringify(r));
    window.__escrito = [];
    window.loadFirebase = async () => {};
    firestoreDB = {};
    firestoreFns = { doc: (db, col, id) => ({ col, id }), increment: (n) => ({ inc: n }),
      setDoc: async (ref, data, opt) => { window.__escrito.push({ ref, data, opt }); } };
    await usoEnviar();
    const despues = JSON.parse(localStorage.getItem('primemx_uso_clics_v1'));
    return { escrito: window.__escrito, quedan: Object.keys(despues.dias), hoy };
  }, hoy);
  const w = env.escrito[0] || {};
  chk('envío: una escritura por día pendiente a /resumenes/uso_{fecha}_{región}', env.escrito.length === 1 && w.ref.col === 'resumenes' && w.ref.id === 'uso_2026-01-02_BAJIO' && w.opt.merge === true, env.escrito.map((x) => x.ref));
  chk('envío: solo tipo, fecha, región y conteos por tienda (con increment)', JSON.stringify(Object.keys(w.data || {})) === '["tipo","fecha","region","total","tienda"]'
    && w.data.tienda.PRM_TDA_LEON_CENTRO.ini_campana.inc === 3 && w.data.total.menu_calc.inc === 1, w.data);
  chk('envío: sin ATTUID, nombre ni teléfono', !/AP123X|ASESOR PRUEBA|4771234567/.test(JSON.stringify(env.escrito)));
  chk('envío: el día mandado se borra y el de hoy se queda', env.quedan.join() === env.hoy, env.quedan);
  chk('uso (asesor): sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();
  // DC499W: sus clics no cuentan; ve el panel.
  for (const tema of ['light', 'dark']) {
    ({ ctx, p } = await abrir(nav, base, { tema }));
    await p.evaluate(() => localStorage.removeItem('primemx_uso_clics_v1'));
    await p.locator('.hv3-camp-card').first().click(); await p.waitForTimeout(300);
    chk(tema + ': los clics de DC499W no se cuentan', await p.evaluate(() => !localStorage.getItem('primemx_uso_clics_v1')));
    await p.evaluate((fx) => { usoLeerDocs = async () => fx; usoPanel.docs = null; usoPanel.periodo = 'mes'; }, USO_FIXTURE);
    await p.evaluate(() => { show('s-home'); pmdOpen(); }); await p.waitForTimeout(300);
    chk(tema + ': DC499W ve el botón Desarrollador', await p.locator('#dev-home-card').isVisible());
    await p.locator('#dev-home-card').click(); await p.waitForTimeout(700);
    const v = await p.evaluate(() => ({ activo: document.getElementById('s-uso').classList.contains('active'), txt: document.getElementById('uso-wrap').textContent,
      top: [...document.querySelectorAll('#uso-wrap .pc-card')][0].querySelectorAll('.uso-fila').length }));
    const mes = await p.evaluate(() => usoPeriodo('mes'));
    const enMes = USO_FIXTURE.filter((d) => d.fecha >= mes.desde && d.fecha <= mes.hasta);
    const totalEsperado = enMes.reduce((t, d) => t + Object.values(d.tienda).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0), 0);
    const distintas = new Set(enMes.flatMap((d) => Object.values(d.tienda).flatMap((m) => Object.keys(m)))).size;
    chk(tema + ': panel con total, más usadas y secciones con "Sin clics"', v.activo && v.txt.includes(totalEsperado.toLocaleString('es-MX') + 'clics') && v.top === Math.min(10, distintas) && /Sin clics/.test(v.txt), { total: totalEsperado, top: v.top, distintas });
    await p.locator('#uso-wrap select[aria-label="Región"]').selectOption('BAJIO'); await p.waitForTimeout(200);
    const t = await p.evaluate(() => [...document.querySelectorAll('#uso-wrap select[aria-label="Tienda"] option')].map((o) => o.textContent));
    chk(tema + ': región BAJIO lista sus tiendas', t.join('|') === 'Todas las tiendas|LEON CENTRO|PLAZA NOGAL LEON', t);
    await p.locator('#uso-wrap select[aria-label="Tienda"]').selectOption('PRM_TDA_PLAZA_NOGAL_LEON'); await p.waitForTimeout(200);
    chk(tema + ': filtro por tienda', await p.evaluate(() => usoAgregar(usoPanel.docs, Object.assign(usoPeriodo('mes'), { region: 'BAJIO', tienda: 'PRM_TDA_PLAZA_NOGAL_LEON' })).total) === 50);
    chk(tema + ': nada se sale a lo ancho', (await desbordes(p, '#uso-wrap')).length === 0, await desbordes(p, '#uso-wrap'));
    await p.locator('#uso-wrap select[aria-label="Región"]').selectOption(''); await p.waitForTimeout(200);
    await captura(p, OUT + '/uso-' + tema + '.png');
    // [v1.73.22] Sin ningún clic en el periodo: igual se listan las 63 herramientas como "Sin clics".
    await p.evaluate(() => { usoLeerDocs = async () => []; usoPanel.docs = null; usoPanel.region = ''; usoPanel.tienda = ''; usoCargar(); });
    await p.waitForTimeout(400);
    const vacio = await p.evaluate(() => ({ chips: document.querySelectorAll('#uso-wrap .uso-sin em').length, secciones: document.querySelectorAll('#uso-wrap .pc-card').length,
      top: [...document.querySelectorAll('#uso-wrap .pc-card h2')].some((x) => x.textContent === 'Más usadas'), total: USO_ZONAS.length,
      nsec: new Set(USO_ZONAS.map((z) => z[2])).size }));
    chk(tema + ': sin clics en el periodo igual lista todas las herramientas sin uso', vacio.chips === vacio.total && vacio.secciones === vacio.nsec && !vacio.top, vacio);
    await captura(p, OUT + '/uso-vacio-' + tema + '.png');
    chk(tema + ': sin errores de página', p.errores.length === 0, p.errores);
    await ctx.close();
  }
}

// [v1.73.23] Rediseño compacto: catálogo de 3 columnas y lista, ficha con Cotizar en
// la primera pantalla y cotización con el resumen arriba. Misma lógica de siempre.
async function rediseno(nav, base) {
  for (const tema of ['light', 'dark']) {
    const { ctx, p } = await abrir(nav, base, { tema });
    // Catálogo en cuadrícula
    await p.evaluate(() => { showCatalog('android'); setFilter('OPPO'); clearCmp(); });
    await p.waitForTimeout(300);
    const g = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('#dev-wrap .cv-card')];
      const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top));
      return { n: cards.length, porFila: tops.filter((t) => t === tops[0]).length, vig: CAT.android.filter((d) => d.brand === 'OPPO' && isVigent(d.id)).length,
        estatus: cards.every((c) => !!c.querySelector('.bs')), subs: cards.map((c) => c.querySelector('.cv-sub').textContent),
        vista: [document.getElementById('view-grid').getAttribute('aria-pressed'), document.getElementById('view-list').getAttribute('aria-pressed')] };
    });
    chk(tema + ': catálogo en 3 columnas con todos los Oppo vigentes', g.n === g.vig && g.porFila === 3, g);
    chk(tema + ': cada tarjeta dice su estatus en texto', g.estatus);
    chk(tema + ': "Oppo A5" no repite la marca abajo (solo capacidad)', g.subs.every((x) => /^\d+ GB$/.test(x)), g.subs);
    chk(tema + ': botón de vista marca cuadrícula', g.vista.join() === 'true,false', g.vista);
    chk(tema + ': catálogo sin desbordes', (await desbordes(p, '#s-catalog')).length === 0, await desbordes(p, '#s-catalog'));
    // Comparar: máximo 3, con 1 el botón no compara
    const cmp = await p.evaluate(() => {
      const ids = [...document.querySelectorAll('#dev-wrap .cv-card')].map((c) => /showFicha\('([^']+)'\)/.exec(c.getAttribute('onclick'))[1]);
      document.querySelector('#dev-wrap .cv-cmp').click();
      const uno = { vis: document.getElementById('cmp-bar').classList.contains('vis'), off: document.querySelector('#cmp-bar .cmp-go').disabled };
      ['1', '2', '3'].forEach((i) => tCmp(ids[+i]));
      return { uno, n: cmpSet.size, lbl: document.getElementById('cmp-lbl').textContent, off: document.querySelector('#cmp-bar .cmp-go').disabled,
        marcados: document.querySelectorAll('#dev-wrap .cv-cmp[aria-pressed="true"]').length, ficha: document.querySelector('#dev-wrap .cv-card').classList.contains('sel') };
    });
    chk(tema + ': con 1 elegido aparece la barra y Comparar se ve apagado', cmp.uno.vis && cmp.uno.off, cmp.uno);
    chk(tema + ': comparar sigue con tope de 3', cmp.n === 3 && cmp.lbl === '3 seleccionados de 3' && !cmp.off && cmp.marcados === 3, cmp);
    if (tema === 'light') await captura(p, OUT + '/rediseno-catalogo-grid.png');
    else await captura(p, OUT + '/rediseno-catalogo-grid-oscuro.png');
    await p.evaluate(() => clearCmp());
    // Lista
    await p.locator('#view-list').click(); await p.waitForTimeout(250);
    const l = await p.evaluate(() => ({ filas: document.querySelectorAll('#dev-wrap .cv-row').length, alto: Math.round(document.querySelector('#dev-wrap .cv-row').getBoundingClientRect().height),
      vista: [document.getElementById('view-grid').getAttribute('aria-pressed'), document.getElementById('view-list').getAttribute('aria-pressed')], modo: gridMode }));
    chk(tema + ': lista con una fila por equipo y de 68 px', l.filas === g.n && l.alto <= 72, l);
    chk(tema + ': botón de vista marca lista', l.vista.join() === 'false,true' && l.modo === false, l);
    chk(tema + ': lista sin desbordes', (await desbordes(p, '#s-catalog')).length === 0, await desbordes(p, '#s-catalog'));
    await captura(p, OUT + '/rediseno-catalogo-lista' + (tema === 'dark' ? '-oscuro' : '') + '.png');
    await p.locator('#view-grid').click(); await p.waitForTimeout(200);
    // Ficha: Reno 16 en Plata a 36 meses
    await p.evaluate(() => { showFicha('opreno16'); }); await p.waitForTimeout(500);
    await p.evaluate(() => { selectPlan('Plata'); setPlazo(36, [...document.querySelectorAll('.plazo-btn')][2]); }); await p.waitForTimeout(200);
    const f = await p.evaluate(() => {
      const t = (s) => (document.querySelector(s) || {}).textContent || '';
      const cot = document.querySelector('#s-ficha [onclick^="enviarCotizacion"]').getBoundingClientRect();
      return { cotizarAbajo: Math.round(cot.bottom), alto: window.innerHeight, monto: t('.fx-monto'), cols: [...document.querySelectorAll('.fx-col b')].map((b) => b.textContent),
        nota: t('.fx-nota'), sello: (document.querySelector('.fx-precio .hv3-sello') || { getAttribute: () => '' }).getAttribute('aria-label'),
        tabs: [...document.querySelectorAll('#s-ficha .fx-tabs .tb')].map((b) => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')),
        specs: document.querySelectorAll('#tp-specs .fx-spec').length, nSpecs: Object.keys(CAT.android.find((d) => d.id === 'opreno16').specs).length,
        chips: [...document.querySelectorAll('#plan-chips .plan-chip')].map((c) => c.dataset.plan + (c.getAttribute('aria-pressed') === 'true' ? '*' : '')),
        plazos: [...document.querySelectorAll('.plazo-btn')].map((b) => b.getAttribute('aria-pressed')).join() };
    });
    chk(tema + ': ficha con Cotizar visible sin scroll', f.cotizarAbajo <= f.alto, f.cotizarAbajo);
    chk(tema + ': ficha Reno 16 Plata 36: $9,438.70, sello 50%', /9,438\.70/.test(f.monto) && f.sello === '50% de descuento', f);
    chk(tema + ': enganche máx $4,719 y mensualidad $781 (igual que el inicio)', f.cols.join() === '$4,719,$781', f.cols);
    chk(tema + ': [v1.73.28] sin el cuadro gris de "sin enganche"', f.nota === '', f.nota);
    chk(tema + ': pestañas sin Planes, Especificaciones primero', f.tabs.join() === 'Especificaciones*,Argumentos,Similares,Accesorios,YouTube', f.tabs);
    chk(tema + ': todas las especificaciones en cuadritos', f.specs === f.nSpecs, f);
    chk(tema + ': chip y plazo elegidos con aria-pressed', f.chips.includes('Plata*') && f.chips.filter((x) => x.endsWith('*')).length === 1 && f.plazos === 'false,false,true', f);
    for (const t of ['specs', 'sell', 'sim', 'acc', 'tt']) {
      await p.evaluate((t) => swTab(t, document.querySelector('.tb[onclick*="\'' + t + '\'"]')), t); await p.waitForTimeout(250);
      const d = await desbordes(p, '#s-ficha');
      chk(tema + ': ficha pestaña ' + t + ' sin desbordes', d.length === 0, d);
    }
    await p.evaluate(() => swTab('specs', document.querySelector('.tb[onclick*="\'specs\'"]')));
    await captura(p, OUT + '/rediseno-ficha' + (tema === 'dark' ? '-oscuro' : '') + '.png');
    // 70% o más: rentas en garantía (Oppo A6 Plata 36 = $1,998.80 de $9,999)
    await p.evaluate(() => { showFicha('opa6'); }); await p.waitForTimeout(400);
    await p.evaluate(() => { selectPlan('Plata'); setPlazo(36, [...document.querySelectorAll('.plazo-btn')][2]); }); await p.waitForTimeout(150);
    const a6 = await p.evaluate(() => [...document.querySelectorAll('.fx-col')].map((c) => c.textContent).join(' | ') + ' | ' + document.querySelector('.fx-nota').textContent);
    chk(tema + ': A6 (80%): enganche de 1 a 3 rentas y mensualidad $706', /Enganche en rentas\$650 a \$1,950/.test(a6) && /Mensualidad\$706/.test(a6) && /garantía/.test(a6), a6);
    // Capacidades: botones dentro del encabezado
    await p.evaluate(() => { showFicha('px10pro'); }); await p.waitForTimeout(400);
    const cap = await p.evaluate(() => [...document.querySelectorAll('#storage-sel .storage-btn')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')));
    chk(tema + ': Pixel 10 Pro: capacidades en el encabezado', cap.length === 2 && cap.filter((x) => x.endsWith('*')).length === 1, cap);
    // Cotización
    await p.evaluate(() => { showFicha('opreno16'); }); await p.waitForTimeout(400);
    await p.evaluate(() => { selectPlan('Plata'); setPlazo(36, [...document.querySelectorAll('.plazo-btn')][2]); openCotModal(); }); await p.waitForTimeout(400);
    const c = await p.evaluate(() => {
      const r = document.getElementById('cot-resumen').getBoundingClientRect();
      const tot = () => [...document.querySelectorAll('#cot-resumen .ct-total b')].map((b) => b.textContent).join();
      const antes = tot();
      cotSetTipo('POSPAGO'); cotSetEng(50);
      return { resumenArriba: Math.round(r.top), alto: window.innerHeight, antes, despues: tot(), eng: document.getElementById('cot-eng-monto').textContent,
        comision: [document.getElementById('comm-section').classList.contains('expanded'), document.getElementById('comm-section').getAttribute('aria-expanded'), document.getElementById('comm-amount').textContent],
        servicios: [...document.querySelectorAll('#cot-overlay .ct-serv')].filter((x) => getComputedStyle(x).display !== 'none').length,
        port: document.getElementById('cot-port-desc').textContent, plan: document.getElementById('cot-device-info').textContent,
        tipo: document.getElementById('cot-tipo-pospago').getAttribute('aria-pressed'), acciones: document.querySelectorAll('#cot-overlay .ct-acciones button').length,
        principal: [...document.querySelectorAll('#cot-overlay .ct-acciones button')].sort((x, y) => y.getBoundingClientRect().width - x.getBoundingClientRect().width)[0].getAttribute('onclick') };
    });
    chk(tema + ': cotización con el resumen a la vista al abrir', c.resumenArriba < c.alto, c);
    chk(tema + ': sin enganche: hoy $0 y $912 al mes; con 50%: $4,719 y $781', c.antes === '$0,$912' && c.despues === '$4,719,$781' && c.eng === '$4,719', c);
    chk(tema + ': comisión cerrada como hoy, con su monto', c.comision[0] === false && c.comision[1] === 'false' && /^\$\d/.test(c.comision[2]), c.comision);
    chk(tema + ': portabilidad, control y seguro en una fila', c.servicios === 3 && c.port === '20% x 6 meses', c);
    chk(tema + ': tarjeta del equipo con plan, plazo y precio', /PLATA36 meses · \$9,438\.70/.test(c.plan), c.plan);
    chk(tema + ': tipo marcado con aria-pressed y 3 envíos en una fila', c.tipo === 'true' && c.acciones === 3, c);
    chk(tema + ': el botón grande es Enviar imagen [v1.73.24]', c.principal === 'cotSendImage()', c.principal);
    await p.evaluate(() => cotSetDeposito()); await p.waitForTimeout(100);
    const dep = await p.evaluate(() => ({ visible: getComputedStyle(document.getElementById('cot-deposito-custom-wrap')).display !== 'none', txt: document.getElementById('cot-deposito-pill').innerText.trim() }));
    chk(tema + ': depósito: Agregar abre el monto y cambia a Quitar', dep.visible && dep.txt === 'Quitar', dep);
    await p.evaluate(() => { document.getElementById('cot-deposito-input').value = '500'; cotRender(); });
    chk(tema + ': el depósito suma al pago inicial', (await p.locator('#cot-resumen .ct-total b').first().textContent()) === '$5,219');
    await p.evaluate(() => cotSetDeposito());
    await p.evaluate(() => toggleCommSection()); await p.waitForTimeout(100);
    chk(tema + ': la comisión se abre al tocarla', await p.evaluate(() => document.getElementById('comm-section').getAttribute('aria-expanded') === 'true'));
    await p.evaluate(() => toggleCommSection());
    chk(tema + ': cotización sin desbordes', (await desbordes(p, '#cot-overlay')).length === 0, await desbordes(p, '#cot-overlay'));
    await p.evaluate(() => { const b = document.querySelector('#cot-overlay .cot-body'); b.style.maxHeight = 'none'; document.querySelector('#cot-overlay .cot-modal').style.maxHeight = 'none'; });
    await p.screenshot({ path: OUT + '/rediseno-cotizacion' + (tema === 'dark' ? '-oscuro' : '') + '.png', fullPage: true });
    await p.evaluate(() => { const b = document.querySelector('#cot-overlay .cot-body'); b.style.maxHeight = ''; document.querySelector('#cot-overlay .cot-modal').style.maxHeight = ''; cotClose(); });
    // Sugerencia de plan (Azul 1 → sube) y Titanio/Platino +
    await p.evaluate(() => { selectPlan('Azul 1'); openCotModal(); }); await p.waitForTimeout(300);
    const sug = await p.evaluate(() => ({ s: calcularMejorPlan(), html: document.getElementById('cot-sugerencia').textContent }));
    chk(tema + ': la sugerencia de plan sale en su bloque cuando aplica', !sug.s || (sug.html.includes('Cambiar a ' + sug.s.plan) && sug.html.includes('Sale hoy')), sug.html.slice(0, 120));
    await p.evaluate(() => cotClose());
    await p.evaluate(() => { showFicha('ip17'); }); await p.waitForTimeout(500);
    await p.evaluate(() => { selectPlan('Platino +'); openCotModal(); }); await p.waitForTimeout(300);
    const pm = await p.evaluate(() => ({ visibles: [...document.querySelectorAll('#cot-overlay .ct-serv')].filter((x) => getComputedStyle(x).display !== 'none').length,
      ancho: Math.round(document.getElementById('cot-control-switch').getBoundingClientRect().width), plan: document.getElementById('cot-device-info').textContent }));
    chk(tema + ': Platino +: sin portabilidad, control y seguro llenan la fila', pm.visibles === 2 && pm.ancho > 150 && /PLATINO \+36 meses · Incluido/.test(pm.plan), pm);
    await p.evaluate(() => cotClose());
    chk(tema + ': sin errores de página', p.errores.length === 0, p.errores);
    await ctx.close();
  }
  // Escritorio: el catálogo llena el ancho y la ficha queda en columna legible.
  const { ctx, p } = await abrir(nav, base, { ancho: 1440, alto: 900 });
  await p.evaluate(() => { showCatalog('android'); }); await p.waitForTimeout(300);
  const esc = await p.evaluate(() => { const c = [...document.querySelectorAll('#dev-wrap .cv-card')]; const t = c.map((x) => Math.round(x.getBoundingClientRect().top)); return t.filter((y) => y === t[0]).length; });
  chk('escritorio: catálogo con 6 o más por fila', esc >= 6, esc);
  await p.evaluate(() => { showFicha('opreno16'); }); await p.waitForTimeout(400);
  const ancho = await p.evaluate(() => Math.round(document.querySelector('#s-ficha .fx').getBoundingClientRect().width));
  chk('escritorio: ficha de 720 px como máximo', ancho <= 720, ancho);
  chk('escritorio: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();
}

// [v1.73.26] Inventario por tienda: por default lo que hay en la tienda; "Todos los modelos"
// muestra el catálogo completo; piezas por equipo; una lectura por sesión; regional con selector.
const INV_FX = {
  _meta: { region: 'BAJIO', fecha: '2026-11-26', recibido: '2026-11-26T11:05:00-06:00', tiendas: 3,
    modelos: ['APPLE IPHONE 17 256GB 5G', 'HONOR X7B 256GB 4G', 'OPPO A5 256GB 4G', 'OPPO A58 128GB 4G', 'OPPO A6 256GB 4G', 'OPPO A6K 256GB 4G', 'OPPO A6T 128GB 4G', 'OPPO FIND X10 512GB 5G', 'OPPO RENO16 256GB 5G', 'OPPO RENO16 F 256GB 5G', 'SAMSUNG GALAXY A16 128GB 4G', 'XIAOMI REDMI 17 128GB 4G'],
    listaTiendas: [
      { org: 'ZX3', tienda: 'PRM TDA LAGOS', clave: 'LAGOS', fecha: '2026-11-25' },
      { org: 'ZX1', tienda: 'PRM TDA LEON ALTACIA', clave: 'LEON ALTACIA', fecha: '2026-11-26' },
      { org: 'ZX2', tienda: 'PRM TDA LEON CENTRO', clave: 'LEON CENTRO', fecha: '2026-11-26' }] },
  ZX2: { org: 'ZX2', tienda: 'PRM TDA LEON CENTRO', clave: 'LEON CENTRO', region: 'BAJIO', fecha: '2026-11-26', equipos: [
    // [v1.73.27] Colores de ejemplo; el A6T viene sin colores (se ve como antes).
    { modelo: 'OPPO A5 256GB 4G', cant: 3, colores: [{ color: 'Mist White', tono: '#F5F5F5', cant: 2 }, { color: 'Aurora Green', tono: '#3E8E7E', cant: 1 }] },
    { modelo: 'OPPO A6 256GB 4G', cant: 5, colores: [{ color: 'Tidal Blue', tono: '#2F6FDB', cant: 2 }, { color: 'Midnight Black', tono: '#1D1D1F', cant: 2 }, { color: 'Sakura Pink', tono: null, cant: 1 }] },
    { modelo: 'OPPO A6T 128GB 4G', cant: 2 },
    { modelo: 'OPPO RENO16 F 256GB 5G', cant: 1, colores: [{ color: 'Mist White', tono: '#F5F5F5', cant: 1 }] },
    { modelo: 'OPPO RENO16 256GB 5G', cant: 4, colores: [{ color: 'Dreamy Purple', tono: '#8E7CC3', cant: 3 }, { color: 'Silver', tono: '#F5F5F5', cant: 1 }] },
    { modelo: 'OPPO FIND X10 512GB 5G', cant: 1, colores: [{ color: 'Titanium Gray', tono: '#8A8D91', cant: 1 }] },
    { modelo: 'OPPO A58 128GB 4G', cant: 0 }, { modelo: 'HONOR X7B 256GB 4G', cant: 7 },
    { modelo: 'APPLE IPHONE 17 256GB 5G', cant: 2, colores: [{ color: 'Black', tono: '#1D1D1F', cant: 1 }, { color: 'Lavender', tono: '#D9C8F0', cant: 1 }] }] },
  ZX1: { org: 'ZX1', tienda: 'PRM TDA LEON ALTACIA', clave: 'LEON ALTACIA', region: 'BAJIO', fecha: '2026-11-26', equipos: [
    { modelo: 'OPPO A5 256GB 4G', cant: 2 }, { modelo: 'OPPO A6K 256GB 4G', cant: 3 }, { modelo: 'SAMSUNG GALAXY A16 128GB 4G', cant: 2 }] },
  ZX3: { org: 'ZX3', tienda: 'PRM TDA LAGOS', clave: 'LAGOS', region: 'BAJIO', fecha: '2026-11-25', equipos: [{ modelo: 'XIAOMI REDMI 17 128GB 4G', cant: 4 }] },
};
async function invPreparar(p, fx) {
  await p.evaluate((fx) => {
    window.__lecturas = [];
    invLeer = async (id) => { window.__lecturas.push(id); return fx[id] ? JSON.parse(JSON.stringify(fx[id])) : null; };
    invLeerTodos = async () => { window.__lecturas.push('*'); return Object.keys(fx).filter((k) => k !== '_meta').map((k) => JSON.parse(JSON.stringify(fx[k]))); };
    invEstado = { de: '', meta: undefined, cargando: null, tiendas: [], org: '', docs: {}, todos: false };
  }, fx);
  await p.waitForTimeout(1200);   // deja pasar la precarga de la sesión (2.5 s después de entrar)
}
// [v1.73.27] Colores que se ven en cada tarjeta o fila: id → ["Tidal Blue 2", ...]
const invCols = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#dev-wrap .d-card, #dev-wrap .d-row')]
  .map((c) => [/showFicha\('([^']+)'\)/.exec(c.getAttribute('onclick'))[1], [...c.querySelectorAll('.inv-col')].map((x) => x.querySelector('.inv-col-n').textContent + ' ' + x.querySelector('b').textContent)])
  .filter((x) => x[1].length)));
const invPunto = (p, sel, n) => p.evaluate(([sel, n]) => { const c = [...document.querySelectorAll(sel)].map((x) => getComputedStyle(x))[n]; return c ? { bg: c.backgroundColor, borde: c.boxShadow } : null; }, [sel, n]);
const invVista = (p) => p.evaluate(() => {
  const ids = [...document.querySelectorAll('#dev-wrap .d-card, #dev-wrap .d-row')].map((c) => /showFicha\('([^']+)'\)/.exec(c.getAttribute('onclick'))[1]);
  const pz = Object.fromEntries([...document.querySelectorAll('#dev-wrap .d-card, #dev-wrap .d-row')].map((c) => [/showFicha\('([^']+)'\)/.exec(c.getAttribute('onclick'))[1], (c.querySelector('.cv-pzas') || {}).textContent || '']));
  const btn = document.getElementById('inv-btn');
  return { ids, pz, boton: !btn.hidden && getComputedStyle(btn).display !== 'none', presionado: btn.getAttribute('aria-pressed'),
    fecha: document.getElementById('inv-fecha').textContent, info: !document.getElementById('inv-info').hidden,
    selector: !document.getElementById('inv-tienda').hidden, tienda: document.getElementById('inv-tienda-n').textContent,
    lecturas: window.__lecturas.slice() };
});
// [v1.73.28] Hoja de tiendas: la abre, opcionalmente busca y escoge por nombre.
async function invHoja(p, { buscar = '', escoger = '' } = {}) {
  await p.locator('#inv-tienda').click(); await p.waitForTimeout(250);
  if (buscar) { await p.locator('#inv-busca').fill(buscar); await p.waitForTimeout(120); }
  const h = await p.evaluate(() => ({ abierta: document.getElementById('inv-sheet').classList.contains('open'),
    busca: !document.getElementById('inv-busca-wrap').hidden, opciones: [...document.querySelectorAll('#inv-lista .inv-opc')].map((o) => o.textContent + (o.classList.contains('sel') ? '*' : '')),
    vacio: (document.querySelector('#inv-lista .inv-vacio') || {}).textContent || '' }));
  if (escoger) { await p.locator('#inv-lista .inv-opc', { hasText: escoger }).first().click(); await p.waitForTimeout(250); }
  return h;
}
async function inventario(nav, base) {
  for (const tema of ['light', 'dark']) {
    const asesor = Object.assign({}, SES, { name: 'ASESOR PRUEBA', attuid: 'AP123X', rol: 'asesor', tiendasAsignadas: [], tienda: 'PRM TDA LEÓN CENTRO', sucursal: 'PRM TDA LEÓN CENTRO' });
    let { ctx, p } = await abrir(nav, base, { ses: asesor, tema });
    await invPreparar(p, INV_FX);
    await p.evaluate(() => { showCatalog('android'); }); await p.waitForTimeout(300);
    await p.evaluate(() => setFilter('OPPO')); await p.waitForTimeout(200);
    let v = await invVista(p);
    const esperado = await p.evaluate(() => CAT.android.filter((d) => d.brand === 'OPPO' && isVigent(d.id) && invCant(d.id) > 0).map((d) => d.id));
    chk(tema + ': al abrir, solo lo que hay en su tienda', v.ids.join() === esperado.join() && esperado.length >= 4 && !v.ids.includes('opa58'), { v: v.ids, esperado });
    // [v1.73.27] Con colores, sin la pastilla del total; el A6T (sin colores) la conserva.
    chk(tema + ': sin pastilla de total en los que traen colores; el A6T sí', v.ids.filter((id) => v.pz[id]).join() === 'opa6t' && v.pz.opa6t === '2 pzas', v.pz);
    chk(tema + ': botón "Todos los modelos" sin presionar e "Inventario al 26 nov"', v.boton && v.presionado === 'false' && v.fecha === 'Inventario al 26 nov' && !v.selector, v);
    chk(tema + ': asesor sin selector de tienda', !v.selector);
    // [v1.73.27] Colores debajo de las piezas, de más a menos; sin colores, como antes.
    let cols = await invCols(p);
    chk(tema + ': cada tarjeta con sus colores sin prefijo y sus piezas (de más a menos)', (cols.opa6 || []).join('|') === 'Black 2|Blue 2|Pink 1'
      && (cols.opa5 || []).join('|') === 'White 2|Green 1' && (cols.opreno16 || []).join('|') === 'Purple 3|Silver 1', cols);
    chk(tema + ': el A6T vino sin colores: sin fila de colores', !cols.opa6t, cols);
    const gris = await invPunto(p, '#dev-wrap .cv-card[onclick*="opa6\'"] .inv-dot', 2);
    const blanco = await invPunto(p, '#dev-wrap .cv-card[onclick*="opa5\'"] .inv-dot', 0);
    const negro = await invPunto(p, '#dev-wrap .cv-card[onclick*="opa6\'"] .inv-dot', 0);
    chk(tema + ': tono null en gris (#C7C7CC)', gris && gris.bg === 'rgb(199, 199, 204)', gris);
    chk(tema + ': borde sutil en el blanco (claro) y en el negro (oscuro)', tema === 'light' ? blanco.borde !== 'none' && negro.borde === 'none' : blanco.borde === 'none' && negro.borde !== 'none', { blanco, negro });
    const fila = await p.evaluate(() => { const c = document.querySelector('#dev-wrap .cv-card[onclick*="opa6\'"]'); const r = [...c.querySelectorAll('.inv-col')].map((x) => x.getBoundingClientRect());
      const b = [...c.querySelectorAll('.inv-col b')].map((x) => Math.round(x.getBoundingClientRect().right)); return { renglones: r.every((x, i) => !i || x.top >= r[i - 1].bottom - 1), derecha: b.every((x) => x === b[0]) }; });
    chk(tema + ': cuadrícula: un color por renglón con sus piezas a la derecha', fila.renglones && fila.derecha, fila);
    chk(tema + ': cuadrícula con colores sin desbordes', (await desbordes(p, '#s-catalog')).length === 0, await desbordes(p, '#s-catalog'));
    await captura(p, OUT + '/inventario-colores-grid-' + tema + '.png');
    await p.evaluate(() => toggleView()); await p.waitForTimeout(150);
    cols = await invCols(p);
    chk(tema + ': en lista también van los colores', (cols.opa6 || []).join('|') === 'Black 2|Blue 2|Pink 1' && !cols.opa6t, cols);
    chk(tema + ': lista con colores sin desbordes', (await desbordes(p, '#s-catalog')).length === 0, await desbordes(p, '#s-catalog'));
    await captura(p, OUT + '/inventario-colores-lista-' + tema + '.png');
    await p.evaluate(() => toggleView()); await p.waitForTimeout(150);
    // Ficha: vista de colores de la tienda.
    await p.evaluate(() => showFicha('opa6')); await p.waitForTimeout(400);
    const fx = await p.evaluate(() => { const s = document.querySelector('#s-ficha .fx-inv'); const hero = document.querySelector('#s-ficha .fx-hero'); return s && { t: s.querySelector('.fx-inv-t').textContent,
      cols: [...s.querySelectorAll('.inv-col')].map((x) => x.textContent), enEncabezado: s.parentElement === hero,
      unRenglon: Math.round(s.getBoundingClientRect().height) <= 34, arribaDeCotizar: s.getBoundingClientRect().bottom < document.querySelector('#s-ficha .fx-cotizar').getBoundingClientRect().top }; });
    chk(tema + ': ficha: tienda y colores discretos al pie del encabezado', fx && fx.t === 'LEON CENTRO' && fx.cols.join('|') === 'Black2|Blue2|Pink1' && fx.enEncabezado && fx.unRenglon && fx.arribaDeCotizar, fx);
    chk(tema + ': ficha sin desbordes', (await desbordes(p, '#s-ficha')).length === 0, await desbordes(p, '#s-ficha'));
    await captura(p, OUT + '/inventario-colores-ficha-' + tema + '.png');
    await p.evaluate(() => showFicha('opa6t')); await p.waitForTimeout(300);
    chk(tema + ': ficha de un equipo sin colores: como antes', await p.evaluate(() => !document.querySelector('#s-ficha .fx-inv')));
    await p.evaluate(() => showFicha('opa58')); await p.waitForTimeout(300);
    chk(tema + ': ficha de un equipo sin piezas en la tienda: como antes', await p.evaluate(() => !document.querySelector('#s-ficha .fx-inv')));
    await p.evaluate(() => { show('s-catalog'); }); await p.waitForTimeout(150);
    if (tema === 'light') await captura(p, OUT + '/inventario-tienda.png');
    await p.locator('#inv-btn').click(); await p.waitForTimeout(200);
    v = await invVista(p);
    const todos = await p.evaluate(() => CAT.android.filter((d) => d.brand === 'OPPO' && isVigent(d.id)).map((d) => d.id));
    chk(tema + ': "Todos los modelos" muestra el catálogo completo', v.ids.join() === todos.join() && v.presionado === 'true', { v: v.ids.length, todos: todos.length });
    chk(tema + ': con todos, las piezas siguen solo en los que hay', v.ids.filter((id) => v.pz[id]).join() === esperado.join(), v.pz);
    chk(tema + ': con todos, sin filas de colores', Object.keys(await invCols(p)).length === 0);
    if (tema === 'light') await captura(p, OUT + '/inventario-todos.png');
    chk(tema + ': catálogo sin desbordes', (await desbordes(p, '#s-catalog')).length === 0, await desbordes(p, '#s-catalog'));
    await p.evaluate(() => toggleView()); await p.waitForTimeout(150);
    const lista = await p.evaluate(() => [...document.querySelectorAll('#dev-wrap .d-row .cv-chips .cv-pzas')].map((e) => e.textContent));
    chk(tema + ': en lista también van las piezas', lista.length === esperado.length, lista);
    chk(tema + ': lista sin desbordes', (await desbordes(p, '#s-catalog')).length === 0, await desbordes(p, '#s-catalog'));
    await p.evaluate(() => toggleView());
    // Volver a abrir: otra vez lo de la tienda, sin leer de nuevo.
    await p.evaluate(() => { show('s-home'); showCatalog('ios'); }); await p.waitForTimeout(200);
    v = await invVista(p);
    chk(tema + ': al volver a entrar, otra vez lo de la tienda (iPhone 17: Black 1, Lavender 1)', v.presionado === 'false' && v.ids.join() === 'ip17' && (await invCols(p)).ip17.join('|') === 'Black 1|Lavender 1', v);
    chk(tema + ': una lectura de _meta y una de su tienda en toda la sesión', v.lecturas.join() === '_meta,ZX2', v.lecturas);
    chk(tema + ': sin errores de página (asesor)', p.errores.length === 0, p.errores);
    await ctx.close();
  }
  // Regional: selector con sus tiendas; cada tienda se lee una vez.
  {
    const reg = Object.assign({}, SES, { name: 'REGIONAL PRUEBA', attuid: 'RG001X', rol: 'regional', tienda: '', sucursal: '', tiendasAsignadas: ['PRM TDA LEON ALTACIA', 'PRM TDA LAGOS'] });
    const { ctx, p } = await abrir(nav, base, { ses: reg });
    await invPreparar(p, INV_FX);
    await p.evaluate(() => { showCatalog('android'); }); await p.waitForTimeout(300);
    let v = await invVista(p);
    chk('regional: tienda elegida en la pastilla (la primera: LAGOS)', v.selector && v.tienda === 'LAGOS', v);
    let hoja = await invHoja(p, { escoger: 'LEON ALTACIA' });
    chk('regional: hoja con sus 2 tiendas, sin buscador (son pocas)', hoja.abierta && !hoja.busca && hoja.opciones.join() === 'LAGOS*,LEON ALTACIA', hoja);
    v = await invVista(p);
    chk('regional: Altacia muestra su inventario (A5 2 pzas, A6k 3 pzas) y se cierra la hoja', v.pz.opa5 === '2 pzas' && v.pz.opa6k === '3 pzas' && v.ids.length === 2 && v.tienda === 'LEON ALTACIA'
      && await p.evaluate(() => !document.getElementById('inv-sheet').classList.contains('open')), v);
    await invHoja(p, { escoger: 'LAGOS' });
    v = await invVista(p);
    chk('regional: Lagos con su propia fecha (25 nov)', v.fecha === 'Inventario al 25 nov' && v.ids.join() === 'xr17', v);
    await invHoja(p, { escoger: 'LEON ALTACIA' });
    v = await invVista(p);
    chk('regional: cada tienda se lee una sola vez', v.lecturas.join() === '_meta,ZX3,ZX1', v.lecturas);
    await p.evaluate(() => toggleView()); await p.waitForTimeout(150);
    await captura(p, OUT + '/inventario-regional.png');
    chk('regional: sin desbordes', (await desbordes(p, '#s-catalog')).length === 0, await desbordes(p, '#s-catalog'));
    chk('regional: sin errores de página', p.errores.length === 0, p.errores);
    await ctx.close();
  }
  // [v1.73.28] Muchas tiendas (director/Diego): buscador, nombres sin "PRM", sin acentos.
  for (const tema of ['light', 'dark']) {
    const nombres = ['PRM TDA LEON ALTACIA', 'PRM PLAZA FRAGARIA', 'PRM TDA PLAZA NOGAL LEÓN', 'PRM TDA LAGOS', 'PRM TDA SILAO', 'PRM TDA IRAPUATO CENTRO', 'PRM TDA CELAYA GALERIAS', 'PRM TDA SALAMANCA'];
    const fx = JSON.parse(JSON.stringify(INV_FX));
    fx._meta.listaTiendas = nombres.map((t, i) => ({ org: 'ZY' + i, tienda: t, clave: t.replace(/^PRM TDA /, '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''), fecha: '2026-11-26' }));
    nombres.forEach((t, i) => { fx['ZY' + i] = Object.assign({}, INV_FX.ZX2, { org: 'ZY' + i, tienda: t }); });
    const { ctx, p } = await abrir(nav, base, { tema });
    await invPreparar(p, fx);
    await p.evaluate(() => { showCatalog('android'); }); await p.waitForTimeout(300);
    let v = await invVista(p);
    chk(tema + ': muchas tiendas: la pastilla muestra la tienda sin "PRM"', v.selector && v.tienda === 'CELAYA GALERIAS', v.tienda);
    if (tema === 'light') await captura(p, OUT + '/inventario-selector.png');
    let h = await invHoja(p);
    chk(tema + ': hoja con buscador y las 8 tiendas por nombre', h.busca && h.opciones.join() === 'CELAYA GALERIAS*,IRAPUATO CENTRO,LAGOS,LEON ALTACIA,PLAZA FRAGARIA,PLAZA NOGAL LEON,SALAMANCA,SILAO', h.opciones);
    chk(tema + ': hoja sin desbordes', (await desbordes(p, '#inv-sheet')).length === 0, await desbordes(p, '#inv-sheet'));
    await p.screenshot({ path: OUT + '/inventario-hoja-' + tema + '.png' });
    await p.locator('#inv-busca').fill('nogal león'); await p.waitForTimeout(120);
    h = await p.evaluate(() => [...document.querySelectorAll('#inv-lista .inv-opc')].map((o) => o.textContent));
    chk(tema + ': buscar "nogal león" (con acento) encuentra PLAZA NOGAL LEON', h.join() === 'PLAZA NOGAL LEON', h);
    await p.locator('#inv-busca').fill('zzz'); await p.waitForTimeout(120);
    chk(tema + ': sin coincidencias: "Sin resultados"', await p.evaluate(() => document.querySelector('#inv-lista .inv-vacio').textContent === 'Sin resultados'));
    await p.locator('#inv-busca').fill('fragaria'); await p.waitForTimeout(120);
    await p.locator('#inv-lista .inv-opc', { hasText: 'PLAZA FRAGARIA' }).click(); await p.waitForTimeout(300);
    v = await invVista(p);
    chk(tema + ': escoger desde la búsqueda cambia la tienda y cierra la hoja', v.tienda === 'PLAZA FRAGARIA' && v.lecturas.includes('ZY1')
      && await p.evaluate(() => !document.getElementById('inv-sheet').classList.contains('open')), v);
    h = await invHoja(p);
    chk(tema + ': al volver a abrir, el buscador vacío y la elegida marcada', h.opciones.length === 8 && h.opciones.includes('PLAZA FRAGARIA*'), h.opciones);
    await p.mouse.click(195, 40); await p.waitForTimeout(200);
    chk(tema + ': tocar fuera cierra la hoja', await p.evaluate(() => !document.getElementById('inv-sheet').classList.contains('open')));
    await p.evaluate(() => showFicha('opa6')); await p.waitForTimeout(400);
    chk(tema + ': ficha con la tienda sin "PRM"', await p.evaluate(() => document.querySelector('#s-ficha .fx-inv-t').textContent === 'PLAZA FRAGARIA'));
    chk(tema + ': sin errores de página (muchas tiendas)', p.errores.length === 0, p.errores);
    await ctx.close();
  }
  // Tienda sin inventario y sin _meta: catálogo como siempre.
  for (const [nombre, ses, fx] of [['tienda fuera de Bajío', { attuid: 'MT001X', rol: 'asesor', tienda: 'PRM TDA MONTERREY', sucursal: 'PRM TDA MONTERREY', tiendasAsignadas: [] }, INV_FX],
    ['sin inventario recibido', { attuid: 'AP123X', rol: 'asesor', tienda: 'PRM TDA LEON CENTRO', sucursal: 'PRM TDA LEON CENTRO', tiendasAsignadas: [] }, {}]]) {
    const { ctx, p } = await abrir(nav, base, { ses: Object.assign({}, SES, ses) });
    await invPreparar(p, fx);
    await p.evaluate(() => { showCatalog('android'); setFilter('OPPO'); }); await p.waitForTimeout(300);
    const v = await invVista(p);
    const todos = await p.evaluate(() => CAT.android.filter((d) => d.brand === 'OPPO' && isVigent(d.id)).length);
    chk(nombre + ': sin botón, sin piezas y el catálogo completo', !v.boton && !v.info && v.ids.length === todos && Object.values(v.pz).every((x) => !x), v);
    chk(nombre + ': solo se leyó _meta', v.lecturas.join() === '_meta', v.lecturas);
    await ctx.close();
  }
  // Desarrollador (DC499W): modelos sin empatar.
  for (const tema of ['light', 'dark']) {
    const { ctx, p } = await abrir(nav, base, { tema });
    await invPreparar(p, INV_FX);
    await p.evaluate(() => { usoLeerDocs = async () => []; usoPanel.docs = null; usoAbrir(); }); await p.waitForTimeout(500);
    const d = await p.evaluate(() => ({ txt: (document.querySelector('#uso-wrap .inv-dev') || {}).textContent || '', filas: [...document.querySelectorAll('#uso-wrap .inv-dev-fila')].map((f) => f.textContent) }));
    chk(tema + ': Desarrollador lista los sin empatar con piezas y tiendas', d.filas.join('|') === 'HONOR X7B 256GB 4G7 pzas · 1 tienda|SAMSUNG GALAXY A16 128GB 4G2 pzas · 1 tienda', d.filas);
    chk(tema + ': Desarrollador con recibido, tiendas y modelos', /Recibido 26 nov · 11:05/.test(d.txt) && /Tiendas3/.test(d.txt) && /Modelos12/.test(d.txt) && /Sin empatar2/.test(d.txt), d.txt.slice(0, 160));
    chk(tema + ': Desarrollador sin desbordes', (await desbordes(p, '#uso-wrap')).length === 0, await desbordes(p, '#uso-wrap'));
    await captura(p, OUT + '/inventario-dev-' + tema + '.png');
    chk(tema + ': sin errores de página (Desarrollador)', p.errores.length === 0, p.errores);
    await ctx.close();
  }
}

(async () => {
  const modo = process.argv[2];
  const modos = { inicio, reco, hoja, ficha, puntos, precal, platino, uso, rediseno, inventario };
  if (!modos[modo]) { console.error('modo desconocido: ' + modo); process.exit(2); }
  const srv = await servir(RAIZ);
  const base = 'http://127.0.0.1:' + srv.address().port + '/techguide/';
  const nav = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  try { await modos[modo](nav, base); } catch (e) { fallas.push('excepción'); console.log('  FALLA excepción: ' + String(e.message).split('\n')[0]); }
  await nav.close();
  srv.close();
  console.log(`${modo}: ${bien} ok, ${fallas.length} fallas`);
  process.exit(fallas.length ? 1 : 0);
})();
