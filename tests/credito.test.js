// [v1.73.14] "Ajustados a crédito": Android vigentes con 50% de descuento o menos
// en el plan y plazo elegidos, del enganche más bajo al más alto, 8 por pestaña.
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./cargar-app.js');

const plano = (x) => JSON.parse(JSON.stringify(x));
const PLANES = ['Azul 1', 'Azul 2', 'Azul 3', 'Plata', 'Oro', 'Black'];
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const HOY = ymd(new Date());

// Oráculo escrito aparte, leyendo PRICES crudo.
function oraculo(c, plan, plazo) {
  const base = (n) => String(n).replace(/\s*\+.*$/, '').trim();
  const cand = [];
  for (const d of c.CAT.android) {
    const v = c.VIGENCY[d.id];
    if ((c.OCULTOS || []).includes(d.id)) continue;
    if (v && v !== 'indefinido' && v < HOY) continue;
    const P = c.PRICES[d.id];
    const promo = ((P.planes[plan] || {})[String(plazo)]);
    if (promo === null || promo === undefined || promo === 0) continue;
    const desc = (1 - promo / P.contado) * 100;
    if (desc > 50) continue; // exacto (Diego, 14-nov)
    cand.push({ id: d.id, nombre: d.name, eng: Math.round(promo * 0.5), promo });
  }
  cand.sort((a, b) => (a.eng - b.eng) || (a.promo - b.promo) || (a.id < b.id ? -1 : 1));
  const visto = {}, out = [];
  for (const x of cand) { const k = base(x.nombre); if (visto[k]) continue; visto[k] = 1; out.push(x.id); }
  return out.slice(0, 8);
}

test('crédito: coincide con el oráculo en todos los planes y plazos', () => {
  const c = cargar();
  for (const plan of PLANES) for (const z of [24, 30, 36]) {
    assert.deepEqual(plano(c.creditoEquipos(plan, z).map((x) => x.id)), oraculo(c, plan, z), plan + ' ' + z);
  }
});

test('crédito: nunca pasa de 50% de descuento, enganche = 50% del precio, máximo 8', () => {
  const c = cargar();
  for (const plan of PLANES) for (const z of [24, 30, 36]) {
    const l = c.creditoEquipos(plan, z);
    assert.ok(l.length <= 8);
    for (const x of l) {
      assert.ok(x.pct <= 50, x.id + ' ' + x.pct);
      assert.equal(x.eng, Math.round(x.promo * 0.5));
      assert.equal(x.plan, plan);
      assert.equal(x.plazo, z);
    }
    for (let i = 1; i < l.length; i++) assert.ok(l[i - 1].eng <= l[i].eng, 'ordenado por enganche');
  }
});

test('crédito: un equipo con 51% o más no entra aunque tenga enganche bajo', () => {
  const c = cargar({ extra: (ctx) => {
    ctx.CAT.android.push({ id: 'zprueba', name: 'Prueba 51', brand: 'X', storage: '128 GB', status: 'NPI' });
    ctx.PRICES.zprueba = { contado: 1000, planes: { Plata: { 24: 490, 30: 490, 36: 490 } } };
    ctx.VIGENCY.zprueba = 'indefinido';
  } });
  assert.ok(!c.creditoEquipos('Plata', 36).some((x) => x.id === 'zprueba'));
});

test('crédito: el 50% es exacto (50.0% entra, 50.3% no aunque se vea como -50%)', () => {
  const c = cargar({ extra: (ctx) => {
    ctx.CAT.android.push({ id: 'zp500', name: 'Prueba 50.0', brand: 'X', storage: '128 GB', status: 'NPI' });
    ctx.CAT.android.push({ id: 'zp503', name: 'Prueba 50.3', brand: 'X', storage: '128 GB', status: 'NPI' });
    ctx.PRICES.zp500 = { contado: 1000, planes: { Plata: { 36: 500 } } };
    ctx.PRICES.zp503 = { contado: 1000, planes: { Plata: { 36: 497 } } };
    ctx.VIGENCY.zp500 = 'indefinido'; ctx.VIGENCY.zp503 = 'indefinido';
  } });
  const ids = c.creditoEquipos('Plata', 36, 99).map((x) => x.id);
  assert.ok(ids.includes('zp500'), 'el 50.0% entra');
  assert.ok(!ids.includes('zp503'), 'el 50.3% no entra');
});
