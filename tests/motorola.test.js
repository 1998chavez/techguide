// [v1.73.10] Alta de los Motorola del Buen Fin y fichas corregidas.
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./cargar-app.js');

const ficha = (c, id) => c.CAT.android.find((d) => d.id === id);

test('Edge 70 Fusión 12 GB: NPI, sin bundle, precio de la fila 119 hasta el 30-nov', () => {
  const c = cargar();
  const d = ficha(c, 'medge70f_12');
  assert.ok(d, 'existe en el catálogo');
  assert.equal(d.status, 'NPI');
  assert.equal(d.bundle, null);
  assert.equal(d.specs.RAM, '12 GB');
  assert.equal(d.specs['Batería'], '5,200 mAh · 68W TurboPower');
  assert.equal(c.PRICES.medge70f_12.contado, 12999);
  assert.equal(c.PRICES.medge70f_12.planes.Plata['36'], 7009.06);
  assert.equal(c.PRICES.medge70f_12.planes.Diamante['36'], 1059.42);
  assert.equal(c.VIGENCY.medge70f_12, '2026-11-30');
});

test('G77 + Moto Buds 2: NPI, con bundle, precio de la fila 142 hasta el 10-ene', () => {
  const c = cargar();
  const d = ficha(c, 'mg77_buds2');
  assert.ok(d, 'existe en el catálogo');
  assert.equal(d.status, 'NPI');
  assert.match(d.bundle, /Moto Buds 2/);
  assert.equal(c.PRICES.mg77_buds2.contado, 9999);
  assert.equal(c.PRICES.mg77_buds2.planes.Plata['36'], 3998.6);
  assert.equal(c.PRICES.mg77_buds2.planes.Platino['36'], 0);
  assert.equal(c.VIGENCY.mg77_buds2, '2027-01-10');
});

test('fichas corregidas: Edge 70 Fusión con Buds y Moto G77', () => {
  const c = cargar();
  const f = ficha(c, 'medge70f_npi').specs, g = ficha(c, 'mg77').specs;
  assert.equal(f['Batería'], '5,200 mAh · 68W TurboPower');
  assert.equal(f['S.O.'], 'Android 16');
  assert.equal(f.Resistencia, 'IP68/IP69 · MIL-STD-810H');
  assert.equal(g.Resistencia, 'IP64 · MIL-STD-810H');
  assert.equal(g['S.O.'], 'Android 16');
  assert.equal(g.RAM, '8 GB');
  // Se queda igual lo que sí cuadraba (precios no se tocan).
  assert.equal(c.PRICES.mg77.contado, 7999);
  assert.equal(c.PRICES.medge70f_npi.contado, 10999);
});

test('los dos nuevos son NPI vigentes: entran a la campaña del inicio', () => {
  const c = cargar();
  const ids = c.campanaEquipos().map((x) => x.id);
  assert.ok(ids.includes('medge70f_12') && ids.includes('mg77_buds2'), ids);
});
