// [v1.73.13] Alta del Oppo Find X10 (versión de AT&T: 12/512 GB con audífonos).
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./cargar-app.js');

test('Find X10: NPI 512 GB con Enco Clip2, precio de la fila 175 hasta el 30-nov', () => {
  const c = cargar();
  const d = c.CAT.android.find((x) => x.id === 'opfindx10');
  assert.ok(d, 'existe en el catálogo');
  assert.equal(d.name, 'Oppo Find X10');
  assert.equal(d.status, 'NPI');
  assert.equal(d.storage, '512 GB');
  assert.match(d.bundle, /Enco Clip2/);
  assert.equal(d.specs.RAM, '12 GB');
  assert.equal(d.specs['Batería'], '8,000 mAh · 80W SUPERVOOC · inalámbrica 50W AIRVOOC');
  assert.equal(c.PRICES.opfindx10.contado, 29999);
  assert.equal(c.PRICES.opfindx10.planes.Plata['36'], 21299.29);
  assert.equal(c.PRICES.opfindx10.planes.Diamante['36'], 15299.49);
  assert.equal(c.VIGENCY.opfindx10, '2026-11-30');
  assert.ok(!c.OCULTOS.includes('opfindx10'));
});
