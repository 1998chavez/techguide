// [v1.73.0] Pruebas en navegador (Playwright, Chromium preinstalado).
// Uso: node tests/navegador.js <inicio|reco|hoja>
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

async function abrir(nav, base, { ancho = 390, alto = 844, tema = 'light', bloquearFotos = false } = {}) {
  const movil = ancho < 800;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, isMobile: movil, hasTouch: movil,
    userAgent: movil ? devices['iPhone 13'].userAgent : undefined, serviceWorkers: 'block',
    colorScheme: tema, timezoneId: 'America/Mexico_City', locale: 'es-MX', acceptDownloads: true,
  });
  await ctx.addInitScript((s) => { try { localStorage.setItem('primemx_sesion_v1', s); } catch (e) {} }, JSON.stringify(SES));
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
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') malos.push((el.className || el.tagName) + ': ' + (el.textContent || '').trim().slice(0, 40));
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
  chk('momento: sello rojo de 62 px con DESCUENTO', sello && sello.w === 62 && /DESCUENTO/.test(sello.t) && sello.rojo, sello);
  const fuera = await p.evaluate(() => [...document.querySelectorAll('.hv3-sello')].filter((s) => {
    const c = s.closest('.hv3-mcard,.hv3-col-camp'); if (!c) return false; const a = s.getBoundingClientRect(), b = c.getBoundingClientRect();
    return a.right > b.right + 0.5 || a.left < b.left - 0.5; }).length);
  chk('sellos dentro de su tarjeta', fuera === 0, fuera);
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
  // Nombres largos e INCLUIDO: Platino y Diamante con $4,000 trae "Moto Edge 70 Pro + Watch"; Azul 1 y 2 con $1,500 trae equipos incluidos.
  for (const [m, pa, pb, archivo] of [[4000, 'Platino', 'Diamante', 'hoja-larga.png'], [1500, 'Azul 1', 'Azul 2', 'hoja-incluido.png'], [6000, 'Plata', 'Oro', 'hoja-cara.png']]) {
    await p.evaluate(([m, pa, pb]) => { recoState.monto = m; recoState.planes = [pa, pb]; recoState.plazo = 36; recoState.todos = false; }, [m, pa, pb]);
    await p.evaluate(() => { document.getElementById('flyer-preview-container').innerHTML = ''; return recoGenerarHoja(); });
    await p.waitForSelector('#flyer-preview-container img', { timeout: 20000 });
    const d = await desbordes(p, '#cot-flyer-render .hoja-card');
    if (pa === 'Platino') { const t = await p.evaluate(() => document.querySelector('#cot-flyer-render .hoja-reco').textContent); chk('rentas con separador de miles ($1,035 y $1,300)', t.includes('50 GB | $1,035') && t.includes('55 GB | $1,300')); }
    chk(archivo + ': nada se desborda en las tarjetas', d.length === 0, d.slice(0, 5));
    const s2 = await p.evaluate(() => document.querySelector('#flyer-preview-container img').src);
    fs.writeFileSync(OUT + '/' + archivo, Buffer.from(s2.split(',')[1], 'base64'));
    await p.evaluate(() => closeFlyerPreview());
  }
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
    const f = await p.evaluate(() => {
      const t = (s) => (document.querySelector(s) || {}).textContent || '';
      const filas = [...document.querySelectorAll('.enganche-row')].map((r) => [(r.querySelector('.eng-lbl') || {}).textContent || '', (r.querySelector('.eng-val') || {}).textContent || '']);
      return { plan: t('.price-result-plan'), promo: t('.price-promo'), badge: t('.price-desc-badge'), filas };
    });
    const promoFicha = f.promo.includes('Incluido') ? 0 : Number(f.promo.replace(/[^0-9.]/g, ''));
    const fila = f.filas.find((r) => /3 rentas|50%/.test(r[0]));
    const engFicha = fila ? Number(fila[1].replace(/[^0-9.]/g, '')) : null;
    chk(x.nombre + ': la ficha abre en Plata a 36 meses', f.plan.includes('Plan Plata · 36 meses'), f.plan);
    chk(x.nombre + ': mismo precio que la tarjeta', Math.abs(promoFicha - x.promo) < 0.005, [promoFicha, x.promo]);
    chk(x.nombre + ': mismo % que la tarjeta', f.badge.trim() === (x.promo === 0 ? 'SIN COSTO' : x.pct + '% desc.'), [f.badge, x.pct]);
    chk(x.nombre + ': mismo enganche máx que la tarjeta', engFicha === x.eng, [fila, x.eng]);
  }
  chk('ficha: sin errores de página', p.errores.length === 0, p.errores);
  await ctx.close();
}

(async () => {
  const modo = process.argv[2];
  const modos = { inicio, reco, hoja, ficha };
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
