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

// Oráculo escrito aparte, leyendo PRICES crudo. Como Equipos del momento: por
// equipo, el plazo con el enganche más bajo (empate: menor precio) entre los
// que tienen 50% de descuento o menos (exacto).
function oraculo(c, plan) {
  const base = (n) => String(n).replace(/\s*\+.*$/, '').trim();
  const cand = [];
  for (const d of c.CAT.android) {
    const v = c.VIGENCY[d.id];
    if ((c.OCULTOS || []).includes(d.id)) continue;
    if (v && v !== 'indefinido' && v < HOY) continue;
    const P = c.PRICES[d.id];
    let mejor = null;
    for (const z of ['24', '30', '36']) {
      const promo = ((P.planes[plan] || {})[z]);
      if (promo === null || promo === undefined || promo === 0) continue;
      if ((1 - promo / P.contado) * 100 > 50) continue;
      const eng = Math.round(promo * 0.5);
      if (!mejor || eng < mejor.eng || (eng === mejor.eng && promo < mejor.promo)) mejor = { id: d.id, nombre: d.name, eng, promo, plazo: Number(z) };
    }
    if (mejor) cand.push(mejor);
  }
  cand.sort((a, b) => (a.eng - b.eng) || (a.promo - b.promo) || (a.id < b.id ? -1 : 1));
  const visto = {}, out = [];
  for (const x of cand) { const k = base(x.nombre); if (visto[k]) continue; visto[k] = 1; out.push(x.id + '@' + x.plazo); }
  return out.slice(0, 8);
}

test('crédito: coincide con el oráculo en todos los planes', () => {
  const c = cargar();
  for (const plan of PLANES) {
    assert.deepEqual(plano(c.creditoEquipos(plan).map((x) => x.id + '@' + x.plazo)), oraculo(c, plan), plan);
  }
});

test('crédito: nunca pasa de 50% de descuento, enganche = 50% del precio, máximo 8', () => {
  const c = cargar();
  for (const plan of PLANES) {
    const l = c.creditoEquipos(plan);
    assert.ok(l.length <= 8);
    for (const x of l) {
      assert.ok(x.pct <= 50, x.id + ' ' + x.pct);
      assert.equal(x.eng, Math.round(x.promo * 0.5));
      assert.equal(x.plan, plan);
      assert.ok([24, 30, 36].includes(x.plazo));
      assert.ok((1 - x.promo / x.contado) * 100 <= 50, x.id + ' exacto');
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
  assert.ok(!c.creditoEquipos('Plata').some((x) => x.id === 'zprueba'));
});

test('crédito: el 50% es exacto (50.0% entra, 50.3% no aunque se vea como -50%)', () => {
  const c = cargar({ extra: (ctx) => {
    ctx.CAT.android.push({ id: 'zp500', name: 'Prueba 50.0', brand: 'X', storage: '128 GB', status: 'NPI' });
    ctx.CAT.android.push({ id: 'zp503', name: 'Prueba 50.3', brand: 'X', storage: '128 GB', status: 'NPI' });
    ctx.PRICES.zp500 = { contado: 1000, planes: { Plata: { 36: 500 } } };
    ctx.PRICES.zp503 = { contado: 1000, planes: { Plata: { 36: 497 } } };
    ctx.VIGENCY.zp500 = 'indefinido'; ctx.VIGENCY.zp503 = 'indefinido';
  } });
  const ids = c.creditoEquipos('Plata', 99).map((x) => x.id);
  assert.ok(ids.includes('zp500'), 'el 50.0% entra');
  assert.ok(!ids.includes('zp503'), 'el 50.3% no entra');
});

test('crédito: cada equipo toma el plazo con su enganche más bajo que siga en 50% o menos', () => {
  const c = cargar({ extra: (ctx) => {
    ctx.CAT.android.push({ id: 'zplazo', name: 'Prueba plazo', brand: 'X', storage: '128 GB', status: 'NPI' });
    // 24: 40% (eng 300) · 30: 45% (eng 275) · 36: 55% (eng 225, pero pasa de 50%: no cuenta)
    ctx.PRICES.zplazo = { contado: 1000, planes: { Plata: { 24: 600, 30: 550, 36: 450 } } };
    ctx.VIGENCY.zplazo = 'indefinido';
  } });
  const x = c.creditoEquipos('Plata', 99).find((y) => y.id === 'zplazo');
  assert.ok(x, 'entra');
  assert.equal(x.plazo, 30);
  assert.equal(x.eng, 275);
});
