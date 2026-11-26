// [v1.73.23] Rediseño compacto de catálogo, ficha y cotización: mismos números y
// la misma lógica de siempre, con menos scroll. Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { cargar, extraerFuncion } = require('./cargar-app.js');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

test('catálogo: la marca solo va abajo si el nombre no la trae; en iOS y en la cuadrícula solo la capacidad', () => {
  const c = cargar();
  assert.equal(c.catSub({ name: 'Oppo A5', brand: 'OPPO', storage: '256 GB' }, 'android'), '256 GB');
  assert.equal(c.catSub({ name: 'Pixel 10', brand: 'GOOGLE', storage: '128 GB' }, 'android'), 'GOOGLE · 128 GB');
  assert.equal(c.catSub({ name: 'Pixel 10', brand: 'GOOGLE', storage: '128 GB' }, 'android', true), '128 GB');
  assert.equal(c.catSub({ name: 'iPhone 17', brand: 'APPLE', storage: '256 GB' }, 'ios'), '256 GB');
  const f = extraerFuncion(APP, 'renderDevs');
  assert.match(f, /catSub\(d,curOS,true\)/, 'cuadrícula: solo capacidad');
  assert.match(f, /catSub\(d,curOS,curBrand!=='Todos'\)/, 'lista: marca solo con "Todos"');
});

test('planes: clase de color para todos los que se venden (también Platino + y Titanio)', () => {
  const c = cargar();
  for (const p of c.PLANS_DATA) assert.ok(c.planCls(p.name), 'sin color: ' + p.name);
  assert.equal(c.planCls('Plata'), 'pw-plata');
  assert.equal(c.planCls('Platino +'), 'pw-platinomas');
  assert.equal(c.planCls('Titanio'), 'pw-titanio');
  assert.match(HTML, /\.pw-platinomas\{/);
  assert.match(HTML, /\.pw-titanio\{/);
});

test('ficha: abajo de 70% enganche máx 50% y mensualidad igual que el inicio', () => {
  const c = cargar();
  const o = c.fichaOferta(9438.7, 18999, 650, 36); // Reno 16 Plata 36
  assert.equal(o.alto, false);
  assert.equal(o.pct, 50);
  assert.equal(o.engMax, 4719);
  assert.equal(o.mensualidad, 781);
  assert.equal(o.mensualidad, c.mensualidadMax(9438.7, 18999, 650, 36));
  assert.equal(o.mensualSinEng, 912);
});

test('ficha: 70% o más son de 1 a 3 rentas y no bajan el equipo', () => {
  const c = cargar();
  const o = c.fichaOferta(1998.8, 9999, 650, 36); // Oppo A6 Plata 36
  assert.equal(o.alto, true);
  assert.equal(o.rentaMin, 650);
  assert.equal(o.rentaMax, 1950);
  assert.equal(o.engMax, 1950, 'mismo tope que ofertaPlan (3 rentas)');
  assert.equal(o.mensualidad, 706);
});

test('ficha: equipo incluido = solo la renta del plan', () => {
  const c = cargar();
  const o = c.fichaOferta(0, 21999, 1299, 36);
  assert.equal(o.incluido, true);
  assert.equal(o.mensualidad, 1299);
  assert.equal(o.mensualSinEng, 1299);
});

test('ficha: Planes ya no es pestaña; plan, plazo, precio y Cotizar van arriba', () => {
  const f = extraerFuncion(APP, 'showFicha');
  assert.doesNotMatch(f, /tp-plans|swTab\(\\'plans\\'/);
  assert.match(f, /id="plan-chips"/);
  assert.match(f, /id="plazo-btns"/);
  assert.match(f, /id="price-result"/);
  assert.match(f, /onclick="enviarCotizacion\(\)"/);
  assert.ok(f.indexOf('id="price-result"') < f.indexOf('fx-tabs'), 'el precio va antes de las pestañas');
  assert.doesNotMatch(APP, /swTab\('plans'/);
  assert.doesNotMatch(APP, /'ficha_t_planes'/);
});

test('catálogo: tarjeta y fila conservan .d-card/.d-row (panel de uso) y comparar con tope de 3', () => {
  const f = extraerFuncion(APP, 'renderDevs');
  assert.match(f, /class="d-card cv-card/);
  assert.match(f, /class="d-row cv-row"/);
  assert.match(f, /tCmp\(/);
  assert.match(extraerFuncion(APP, 'tCmp'), /cmpSet\.size<3/);
  assert.match(HTML, /id="view-btn" role="group"/);
});

test('cotización: los ids que usa la lógica siguen en el modal', () => {
  const a = HTML.indexOf('<div class="cot-overlay" id="cot-overlay">');
  const b = HTML.indexOf('<!-- BRAND INFO MODAL -->');
  const modal = HTML.slice(a, b);
  for (const id of ['cot-device-info', 'cot-cliente-input', 'cot-tipo-grid', 'cot-tipo-pospago', 'cot-tipo-renovacion', 'cot-tipo-aviso',
    'cot-eng-pills', 'cot-eng-custom-wrap', 'cot-eng-custom-input', 'cot-rentas-pills', 'cot-deposito-pill', 'cot-deposito-custom-wrap',
    'cot-deposito-input', 'cot-port-switch', 'cot-control-switch', 'cot-control-desc', 'cot-seguro-switch', 'cot-seguro-desc', 'cot-resumen',
    'cot-sugerencia', 'comm-section', 'comm-amount', 'comm-body-inner', 'cot-cmp-pills']) assert.ok(modal.includes('id="' + id + '"'), 'falta #' + id);
  for (const fn of ['cotSendImage()', 'generateSpecsPDF()', 'cotSend()', 'cotClose()']) assert.ok(modal.includes('onclick="' + fn + '"'), 'falta ' + fn);
  // La portabilidad es su propio .cot-section: openCotModal la oculta en Platino +.
  assert.match(modal, /class="cot-switch cot-section ct-serv" id="cot-port-switch"/);
  // La comisión arranca cerrada, como hoy.
  assert.match(modal, /<div class="comm-section" id="comm-section" role="button" tabindex="0" aria-expanded="false"/);
  assert.doesNotMatch(modal, /cotClose\(\)" style="flex:1">Cancelar/);
});

test('cotización: el aviso de envío usa SU botón y no pierde el ícono', () => {
  const f = extraerFuncion(APP, 'cotSend');
  assert.match(f, /document\.querySelector\('#cot-overlay button\[onclick="cotSend\(\)"\]'\)/);
  assert.match(f, /_btnTxtOrig = _btnSend\.innerHTML;/);
  assert.match(f, /_btnSend\.innerHTML = _btnTxtOrig;/);
});
