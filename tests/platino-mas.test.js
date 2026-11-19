// [v1.73.19] Lista del 19-nov: Diamante deja de venderse y entra Platino + ($1,299, solo 36 meses,
// solo equipo participante, sin promoción de portabilidad). Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cargar, extraerFuncion } = require('./cargar-app.js');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const PUB = fs.readFileSync(path.join(RAIZ, 'catalogo.html'), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));

test('planes: Platino + ($1,299, 50 GB) entra después de Platino y Diamante sale', () => {
  const c = cargar();
  const n = c.PLANS_DATA.map((p) => p.name);
  assert.deepEqual(plano(n), ['Azul 1', 'Azul 2', 'Azul 3', 'Plata', 'Oro', 'Black', 'Platino', 'Platino +', 'Titanio']);
  const pm = c.PLANS_DATA.find((p) => p.name === 'Platino +');
  assert.equal(pm.renta, 1299);
  assert.equal(pm.gb, 50);
  assert.deepEqual(plano(c.PLAN_ORDER), ['Azul 1', 'Azul 2', 'Azul 3', 'Plata', 'Oro', 'Black', 'Platino', 'Platino +', 'Titanio']);
});

test('Platino +: iPhone 17 256 GB incluido a 36 meses; no hay 24 ni 30', () => {
  const c = cargar();
  assert.equal(c.resolvePrice('ip17', 'Platino +', '36'), 0);
  assert.equal(c.resolvePrice('ip17', 'Platino +', '24'), null);
  assert.equal(c.resolvePrice('ip17', 'Platino +', '30'), null);
});

test('Platino +: un null no se vuelve "incluido" aunque los planes de abajo traigan precio', () => {
  const c = cargar();
  const conPrecio = Object.keys(c.PRICES).filter((id) => !id.startsWith('ip'));
  assert.ok(conPrecio.length > 50);
  for (const id of conPrecio) for (const z of ['24', '30', '36']) assert.equal(c.resolvePrice(id, 'Platino +', z), null, id + ' ' + z);
  const conPm = Object.keys(c.PRICES).filter((id) => c.PRICES[id].planes['Platino +'] && c.PRICES[id].planes['Platino +']['36'] !== null);
  assert.deepEqual(plano(conPm), ['ip17'], 'en la lista del 19-nov solo el iPhone 17 256 GB participa');
});

test('Diamante: ya no se cotiza en ningún equipo', () => {
  const c = cargar();
  for (const id of Object.keys(c.PRICES)) for (const z of ['24', '30', '36']) {
    if (id === 'hmagic7px8c') continue; // Magic 7 Pro: no se toca, y Diamante ya no está en los planes
    assert.equal(c.resolvePrice(id, 'Diamante', z), null, id + ' ' + z);
  }
});

test('portabilidad: 20% hasta Platino, 10% Titanio, Platino + no convive', () => {
  const ctx = { PORT_DISCOUNT: 0.20 };
  vm.createContext(ctx);
  vm.runInContext(extraerFuncion(APP, 'portPctPlan'), ctx);
  assert.equal(ctx.portPctPlan('Plata'), 0.20);
  assert.equal(ctx.portPctPlan('Platino'), 0.20);
  assert.equal(ctx.portPctPlan('Titanio'), 0.10);
  assert.equal(ctx.portPctPlan('Platino +'), 0);
  assert.match(extraerFuncion(APP, 'cotTogglePort'), /if\(portPctPlan\(cotState\.plan\) === 0\)\{ cotState\.port = false; return; \}/);
  assert.match(extraerFuncion(APP, 'openCotModal'), /_secPort\.style\.display = portPctPlan\(cotState\.plan\) > 0 \? '' : 'none'/);
  assert.doesNotMatch(APP, /cotState\.plan==="Titanio"\?0\.10:PORT_DISCOUNT/);
});

test('ficha: Platino + toma sus plazos de PRICES igual que Titanio', () => {
  const f = extraerFuncion(APP, 'selectPlan');
  assert.match(f, /const _propio=PLANES_PLAZO_PROPIO\.indexOf\(planName\)>=0;/);
  assert.match(f, /const _tp=_planes && _planes\[planName\];/);
  assert.match(APP, /const PLANES_PLAZO_PROPIO = \['Titanio','Platino \+'\];/);
});

test('recomendación, momento y crédito siguen siendo de Android: sin Platino + ni Diamante', () => {
  const c = cargar();
  assert.deepEqual(plano(c.recoPlanes()), ['Azul 1', 'Azul 2', 'Azul 3', 'Plata', 'Oro', 'Black', 'Platino']);
  assert.deepEqual(plano(c.MOMENTO_PLANS.map((p) => p.name)), ['Azul 1', 'Azul 2', 'Azul 3', 'Plata', 'Oro', 'Black']);
});

test('catálogo público y listas: Platino + en lugar de Diamante', () => {
  assert.match(PUB, /PL:\['Azul 1','Azul 2','Azul 3','Plata','Oro','Black','Platino','Platino \+'\]/);
  assert.match(APP, /const DESC_PLANS = \['Azul 1','Azul 2','Azul 3','Plata','Oro','Black','Platino','Platino \+'\];/);
  assert.match(APP, /\{name:'Platino',renta:1035\},\{name:'Platino \+',renta:1299\}/);
  assert.match(extraerFuncion(APP, 'renderTopCommPlanPills'), /const plans = \['Azul 3','Plata','Oro','Black','Platino'\];/);
});

test('comisión: Platino + sin monto en el esquema se muestra "—", no $0', () => {
  const c = cargar();
  assert.ok(!('Platino +' in c.PLAN_COMMISSION));
  assert.match(extraerFuncion(APP, 'renderCommission'), /\(_sinEsquema \? '—' : '\$' \+ fmx\(c\.plan\)\)/);
});
