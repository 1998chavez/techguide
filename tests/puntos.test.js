// [v1.73.7] Puntos de marca (flyers OPPO, Motorola y Honor de nov-2026).
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

function cargar() {
  const app = leer('app.js');
  const a = app.indexOf('// <puntos>'), b = app.indexOf('// </puntos>');
  assert.ok(a >= 0 && b > a, 'app.js trae el bloque // <puntos>');
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('catalog.js'), ctx, { filename: 'catalog.js' });
  vm.runInContext(leer('incentivos.js'), ctx, { filename: 'incentivos.js' });
  vm.runInContext(app.slice(a, b), ctx, { filename: 'app.js <puntos>' });
  return ctx;
}
const HOY = '2026-11-10';

test('puntos de ejecutivo tal cual los flyers', () => {
  const c = cargar();
  const esperado = {
    opfindx9pro: 220, opreno16: 330, opreno16f: 225, opa6k: 45, opa6: 45,
    mg77: 230, medge70f_npi: 245, medge70pro_w: 450, medge70pro_wc: 450,
    hx6e: 80, hx6e_256: 130, hx7e: 180, honor600: 280,
  };
  for (const [id, pts] of Object.entries(esperado)) assert.equal(c.puntosEquipo(id, null, HOY), pts, id);
  assert.equal(c.puntosEquipo('sa17', null, HOY), 0);
  assert.equal(c.puntosEquipo('noexiste', null, HOY), 0);
});

test('cada equipo con puntos existe en el catálogo', () => {
  const c = cargar();
  const ids = new Set([...c.CAT.ios, ...c.CAT.android].map((d) => d.id));
  for (const f of c.PUNTOS_FLYERS) for (const id of Object.keys(f.puntos)) assert.ok(ids.has(id), id);
});

test('los puntos se apagan solos fuera de las fechas del flyer', () => {
  const c = cargar();
  assert.equal(c.puntosEquipo('opreno16', null, '2026-11-01'), 0);
  assert.equal(c.puntosEquipo('opreno16', null, '2026-11-02'), 330);
  assert.equal(c.puntosEquipo('opreno16', null, '2026-12-06'), 330);
  assert.equal(c.puntosEquipo('opreno16', null, '2026-12-07'), 0);
  assert.equal(c.puntosEquipo('mg77', null, '2027-01-03'), 230);
  assert.equal(c.puntosEquipo('mg77', null, '2027-01-04'), 0);
  assert.equal(c.puntosEquipo('honor600', null, '2026-12-27'), 280);
  assert.equal(c.puntosEquipo('honor600', null, '2026-12-28'), 0);
});

test('con plan, solo pagan desde Azul 3', () => {
  const c = cargar();
  assert.equal(c.puntosEquipo('opreno16', 'Azul 1', HOY), 0);
  assert.equal(c.puntosEquipo('opreno16', 'Azul 2', HOY), 0);
  for (const p of ['Azul 3', 'Plata', 'Oro', 'Black', 'Platino', 'Diamante']) assert.equal(c.puntosEquipo('opreno16', p, HOY), 330, p);
});

test('los bonos en pesos vencidos ya no están', () => {
  const c = cargar();
  assert.deepEqual(Object.keys(c.EQUIP_INC), []);
  assert.deepEqual(Object.keys(c.EQUIP_INC_BY_PLAN), []);
  assert.deepEqual(Object.keys(c.EQUIP_INC_VIGENCY), []);
  assert.deepEqual(Object.keys(c.EQUIP_INC_MIN_UNITS), []);
});

test('pastilla: moneda, número y "pts"; vacía sin puntos', () => {
  const c = cargar();
  const h = c.ptsPastilla('opreno16', HOY);
  assert.match(h, /class="pts-pill"/);
  assert.match(h, /aria-label="330 puntos por venta"/);
  assert.match(h, /<b>330<\/b> pts/);
  assert.equal(c.ptsPastilla('sa17', HOY), '');
  assert.equal(c.ptsPastilla('opreno16', '2026-12-07'), '');
});

test('la hoja de WhatsApp (para el cliente) no lleva puntos', () => {
  const app = leer('app.js');
  const { extraerFuncion } = require('./cargar-app.js');
  for (const f of ['recoHojaHTML', '_hojaColumna']) assert.doesNotMatch(extraerFuncion(app, f), /ptsPastilla|puntosEquipo/, f);
  assert.doesNotMatch(leer('catalogo.html'), /ptsPastilla|puntosEquipo|PUNTOS_FLYERS/);
});
