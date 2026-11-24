// [v1.73.21] Uso de la app: clics por herramienta, sin datos de personas; panel solo DC499W.
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extraerFuncion } = require('./cargar-app.js');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));
function cargar() {
  const a = APP.indexOf('// <uso-puro>'), b = APP.indexOf('// </uso-puro>');
  assert.ok(a >= 0 && b > a, 'app.js trae el bloque <uso-puro>');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(APP.slice(a, b), ctx);
  return ctx;
}
const c = cargar();

test('zonas: claves únicas y cada selector apunta a algo que existe en la app', () => {
  const claves = c.USO_ZONAS.map((z) => z[1]);
  assert.equal(new Set(claves).size, claves.length, 'claves repetidas');
  const fuente = APP + HTML;
  for (const [sel, clave] of c.USO_ZONAS) {
    for (const parte of sel.split(',')) {
      const tokens = [];
      parte.replace(/#([\w-]+)/g, (m, x) => tokens.push('id="' + x + '"'));
      parte.replace(/onclick\^="([^"]+)"/g, (m, x) => tokens.push('onclick="' + x));
      parte.replace(/onclick="([^"]+)"/g, (m, x) => tokens.push('onclick="' + x + '"'));
      parte.replace(/(^|\s)\.([\w-]+)/g, (m, p, x) => tokens.push(x));
      assert.ok(tokens.length, 'selector sin partes reconocibles: ' + parte);
      for (const t of tokens) {
        const alt = t.replace(/'/g, "\\'");
        assert.ok(fuente.includes(t) || fuente.includes(alt), clave + ': no existe ' + t);
      }
    }
  }
});

test('conteo local: suma por día y guarda máximo 14 días', () => {
  let r = c.usoSumar(null, '2026-11-24', 'ini_campana');
  r = c.usoSumar(r, '2026-11-24', 'ini_campana');
  r = c.usoSumar(r, '2026-11-24', 'menu_calc');
  assert.deepEqual(plano(r.dias['2026-11-24']), { ini_campana: 2, menu_calc: 1 });
  for (let d = 1; d <= 20; d++) r = c.usoSumar(r, '2026-10-' + String(d).padStart(2, '0'), 'x');
  assert.equal(Object.keys(r.dias).length, 14);
  assert.ok(r.dias['2026-11-24'], 'se queda lo más reciente');
});

test('documento del día: por región y tienda, sin ATTUID ni nombres', () => {
  const d = c.usoDocumento('2026-11-23', { ini_campana: 3, menu_calc: 1, cero: 0 }, 'BAJIO', 'PRM TDA LEON CENTRO');
  assert.equal(d.id, 'uso_2026-11-23_BAJIO');
  assert.deepEqual(plano(d.data), { tipo: 'uso', fecha: '2026-11-23', region: 'BAJIO',
    total: { ini_campana: 3, menu_calc: 1 }, tienda: { PRM_TDA_LEON_CENTRO: { ini_campana: 3, menu_calc: 1 } } });
  const s = c.usoDocumento('2026-11-23', { a: 1 }, '', '');
  assert.equal(s.id, 'uso_2026-11-23_SIN_REGION');
  assert.deepEqual(Object.keys(s.data.tienda), ['SIN_TIENDA']);
  assert.equal(c.usoDocumento('2026-11-23', { a: 1 }, 'CDMX.SUR/2', 'T#1').id, 'uso_2026-11-23_CDMX_SUR_2', 'sin . ni / en el id');
});

test('envío: lo que se escribe es tipo, fecha, región y conteos; nada de la persona', () => {
  const f = extraerFuncion(APP.replace('async function usoEnviar(', 'function usoEnviar('), 'usoEnviar');
  assert.match(f, /\{ tipo: 'uso', fecha: doc\.data\.fecha, region: doc\.data\.region, total: inc\(doc\.data\.total\), tienda: t \}, \{ merge: true \}/);
  assert.doesNotMatch(f.replace(/asesorData\.attuid\) return/, ''), /attuid|\.name|phone/);
  assert.match(f, /d < hoy/, 'solo días anteriores a hoy');
  assert.match(extraerFuncion(APP, 'usoContar'), /_meEsSuper\(\)\) return;/, 'DC499W no se cuenta');
});

test('agregado: periodo, región y tienda', () => {
  const docs = [
    { tipo: 'uso', fecha: '2026-11-20', region: 'BAJIO', tienda: { T1: { a: 2, b: 1 }, T2: { a: 1 } } },
    { tipo: 'uso', fecha: '2026-11-22', region: 'NORTE', tienda: { T9: { b: 5 } } },
    { tipo: 'uso', fecha: '2026-10-31', region: 'BAJIO', tienda: { T1: { a: 100 } } },
    { tipo: 'otra', fecha: '2026-11-20', region: 'BAJIO', tienda: { T1: { a: 50 } } },
  ];
  const todo = c.usoAgregar(docs, { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(plano(todo.clics), { a: 3, b: 6 });
  assert.equal(todo.total, 9);
  assert.equal(todo.dias, 2);
  assert.deepEqual(plano(todo.regiones), ['BAJIO', 'NORTE']);
  const baj = c.usoAgregar(docs, { desde: '2026-11-01', hasta: '2026-11-30', region: 'BAJIO' });
  assert.deepEqual(plano(baj.clics), { a: 3, b: 1 });
  assert.deepEqual(plano(baj.tiendas), ['T1', 'T2']);
  assert.deepEqual(plano(c.usoAgregar(docs, { desde: '2026-11-01', hasta: '2026-11-30', region: 'BAJIO', tienda: 'T2' }).clics), { a: 1 });
});

test('periodos: 7 días, este mes y mes pasado (con cambio de año)', () => {
  const hoy = new Date(2026, 10, 24);
  assert.deepEqual(plano(c.usoPeriodo('7d', hoy)), { desde: '2026-11-18', hasta: '2026-11-24' });
  assert.deepEqual(plano(c.usoPeriodo('mes', hoy)), { desde: '2026-11-01', hasta: '2026-11-24' });
  assert.deepEqual(plano(c.usoPeriodo('mespasado', hoy)), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(plano(c.usoPeriodo('mespasado', new Date(2027, 0, 5))), { desde: '2026-12-01', hasta: '2026-12-31' });
});

test('acceso: el botón Desarrollador y el panel son solo para DC499W', () => {
  assert.match(extraerFuncion(APP, '_usoPuedeVer'), /_meEsSuper\(\)/);
  assert.match(extraerFuncion(APP, 'usoAbrir'), /if\(!_usoPuedeVer\(\)\) return;/);
  assert.match(extraerFuncion(APP, 'updateAdminHomeCard'), /updateUsoClicsCard\(\)/);
  assert.match(extraerFuncion(APP, 'updateAdminHomeCard'), /usoEnviar\(\)/);
  assert.match(HTML, /<button class="pmd-item" id="dev-home-card" style="display:none" onclick="pmdGo\('dev'\)">/);
  assert.match(HTML, /case 'dev': run\(function\(\)\{ if\(typeof usoAbrir==='function'\)usoAbrir\(\); \}\); break;/);
});
