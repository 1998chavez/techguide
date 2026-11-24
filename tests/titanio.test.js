// [v1.73.20] Diego ocultó el iPhone 17 256 GB en Titanio (24-nov). Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./cargar-app.js');

test('iPhone 17 256 GB: sin Titanio en ningún plazo', () => {
  const c = cargar();
  for (const z of ['24', '30', '36']) assert.equal(c.resolvePrice('ip17', 'Titanio', z), null, z);
});

test('iPhone 17 256 GB: lo demás sigue igual (Platino + incluido a 36, Plata con precio)', () => {
  const c = cargar();
  assert.equal(c.resolvePrice('ip17', 'Platino +', '36'), 0);
  assert.equal(c.PRICES.ip17.contado, 21999);
  assert.equal(c.PRICES.ip17.planes.Plata['36'], 18738.75);
});

test('Titanio sigue en el iPhone 18 Pro y 18 Pro Max a 30 meses', () => {
  const c = cargar();
  assert.equal(c.resolvePrice('ip18pro', 'Titanio', '30'), 8249.73);
  assert.equal(c.resolvePrice('ip18promax', 'Titanio', '30'), 11247.65);
  const conTitanio = Object.keys(c.PRICES).filter((id) => ['24', '30', '36'].some((z) => c.resolvePrice(id, 'Titanio', z) !== null));
  assert.deepEqual(JSON.parse(JSON.stringify(conTitanio)).sort(), ['ip18pro', 'ip18promax']);
});
