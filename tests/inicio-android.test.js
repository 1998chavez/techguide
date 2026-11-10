// [v1.73.0] Pruebas del núcleo sin DOM del inicio con impulso Android.
// Correr: node --test tests/
'use strict';
process.env.TZ = 'America/Mexico_City'; // la hora de los asesores
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar } = require('./cargar-app.js');

const PLANES = ['Azul 1', 'Azul 2', 'Azul 3', 'Plata', 'Oro', 'Black', 'Platino', 'Diamante'];
const RENTA = { 'Azul 1': 330, 'Azul 2': 435, 'Azul 3': 550, Plata: 650, Oro: 725, Black: 825, Platino: 1035, Diamante: 1300 };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const HOY = ymd(new Date());
const AYER = ymd(new Date(Date.now() - 86400000));
const plano = (x) => JSON.parse(JSON.stringify(x)); // objetos del contexto vm → objetos de aquí

// Oráculo independiente: mismas reglas del spec, escrito aparte, leyendo PRICES crudo.
function oraculo(ctx, monto, A, B, plazo) {
  const [p1, p2] = [A, B].sort((x, y) => PLANES.indexOf(x) - PLANES.indexOf(y));
  const of = (id, p) => {
    const promo = ((ctx.PRICES[id].planes[p] || {})[String(plazo)]);
    if (promo === null || promo === undefined) return null;
    const c = ctx.PRICES[id].contado, desc = (1 - promo / c) * 100;
    return desc >= 70 ? RENTA[p] * 3 : Math.round(promo * 0.5);
  };
  let minimo = null; const cand = [];
  for (const d of ctx.CAT.android) {
    const v = ctx.VIGENCY[d.id];
    if (v && v !== 'indefinido' && v < HOY) continue;
    if ((ctx.OCULTOS || []).includes(d.id)) continue; // ocultos por Diego
    if (!ctx.PRICES[d.id] || !ctx.PRICES[d.id].contado) continue;
    const ea = of(d.id, p1), eb = of(d.id, p2);
    if (ea === null || eb === null) continue;
    minimo = minimo === null ? Math.max(ea, eb) : Math.min(minimo, Math.max(ea, eb));
    if (ea > monto || eb > monto) continue;
    cand.push({ id: d.id, k: d.name.replace(/\s*\+.*$/, '').trim(), c: ctx.PRICES[d.id].contado, s: ea + eb }); // más cerca del monto = mayor suma
  }
  cand.sort((x, y) => (y.s - x.s) || (y.c - x.c) || (x.id < y.id ? -1 : 1));
  const visto = new Set(), ids = [];
  for (const x of cand) { if (visto.has(x.k)) continue; visto.add(x.k); ids.push(x.id); }
  return { ids, minimo };
}

// Equipo de prueba con la estructura completa de CAT y PRICES.
function equipo(ctx, { id, name, contado, precios, storage = '128 GB', status = 'RESURTIBLE', vig = 'indefinido', os = 'android' }) {
  ctx.CAT[os].push({ id, name, brand: 'PRUEBA', storage, status, bundle: null, specs: {}, sell: [], obj: [] });
  const planes = {};
  for (const p of PLANES) planes[p] = { '24': precios(p, '24'), '30': precios(p, '30'), '36': precios(p, '36') };
  ctx.PRICES[id] = { contado, planes };
  ctx.VIGENCY[id] = vig;
}
const gratis = () => 0;
const soloEstos = (ctx) => { ctx.CAT.android = []; ctx.CAT.ios = []; };

test('recoCalcular coincide con un cálculo independiente (420 combinaciones)', () => {
  const ctx = cargar();
  let n = 0;
  for (const monto of [1500, 2000, 2500, 3000, 4000]) {
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) for (const plazo of [24, 30, 36]) {
      const r = ctx.recoCalcular(monto, PLANES[j], PLANES[i], plazo);
      const o = oraculo(ctx, monto, PLANES[i], PLANES[j], plazo);
      assert.deepEqual(plano(r.lista.map((x) => x.id)), o.ids, `${monto} ${PLANES[i]}+${PLANES[j]} ${plazo}`);
      assert.equal(r.minimo, o.minimo, `mínimo ${monto} ${PLANES[i]}+${PLANES[j]} ${plazo}`);
      assert.deepEqual(plano(r.planes), [PLANES[i], PLANES[j]]);
      n++;
    }
  }
  assert.equal(n, 420);
});

test('planes en cualquier orden dan lo mismo', () => {
  const ctx = cargar();
  assert.deepEqual(plano(ctx.recoCalcular(2500, 'Oro', 'Plata', 36)), plano(ctx.recoCalcular(2500, 'Plata', 'Oro', 36)));
});

test('INCLUIDO entra con 3 rentas', () => {
  const ctx = cargar({ extra: (c) => { soloEstos(c); equipo(c, { id: 'fxgratis', name: 'Fixture Gratis', contado: 5000, precios: gratis }); } });
  const r = ctx.recoCalcular(2175, 'Plata', 'Oro', 36);
  assert.equal(r.lista.length, 1);
  const x = r.lista[0];
  assert.equal(x.a.incluido, true);
  assert.equal(x.a.promo, 0);
  assert.equal(x.a.pct, 100);
  assert.equal(x.a.eng, 1950);
  assert.equal(x.b.eng, 2175);
  assert.equal(ctx.recoCalcular(2174, 'Plata', 'Oro', 36).lista.length, 0);
});

test('menos de 70 % pide 50 % del precio; 70 % o más pide 3 rentas', () => {
  // contado 10000: Plata 3500 (65 % → 1750) y Oro 2990 (70.1 % → 3 × 725 = 2175)
  const ctx = cargar({ extra: (c) => { soloEstos(c); equipo(c, { id: 'fxmix', name: 'Fixture Mix', contado: 10000, precios: (p) => (p === 'Oro' ? 2990 : 3500) }); } });
  const x = ctx.recoCalcular(5000, 'Plata', 'Oro', 36).lista[0];
  assert.equal(x.a.eng, 1750);
  assert.equal(x.a.pct, 65);
  assert.equal(x.b.eng, 2175);
  assert.equal(x.b.pct, 70);
});

test('vencido ayer no entra; el último día sí y lo dice', () => {
  const ctx = cargar({ extra: (c) => {
    soloEstos(c);
    equipo(c, { id: 'fxayer', name: 'Fixture Ayer', contado: 5000, precios: gratis, vig: AYER });
    equipo(c, { id: 'fxhoy', name: 'Fixture Hoy', contado: 5000, precios: gratis, vig: HOY });
  } });
  const ids = ctx.recoCalcular(5000, 'Plata', 'Oro', 36).lista.map((x) => x.id);
  assert.deepEqual(plano(ids), ['fxhoy']);
  const [, m, d] = HOY.split('-').map(Number);
  assert.deepEqual(plano(ctx.vigLargo('fxhoy')), { txt: `Vigente al ${d} de ${MESES[m - 1]} · último día`, ultimo: true });
});

test('un modelo por tarjeta: capacidades y "+ regalo" cuentan como uno', () => {
  const ctx = cargar({ extra: (c) => {
    soloEstos(c);
    equipo(c, { id: 'fxx128', name: 'Fixture X', contado: 9000, precios: gratis });
    equipo(c, { id: 'fxx256', name: 'Fixture X', storage: '256 GB', contado: 9999, precios: gratis });
    equipo(c, { id: 'fxxregalo', name: 'Fixture X + Regalo', contado: 9999, precios: gratis });
    equipo(c, { id: 'fxy', name: 'Fixture Y', contado: 4000, precios: gratis });
  } });
  const r = ctx.recoCalcular(5000, 'Plata', 'Oro', 36);
  assert.deepEqual(plano(r.lista.map((x) => [x.id, x.nombre, x.capacidad, x.contado])), [
    ['fxx256', 'Fixture X', '256 GB', 9999],
    ['fxy', 'Fixture Y', '128 GB', 4000],
  ]);
});

test('empate exacto de cercanía: gana el mayor precio de lista (sin ruido de decimales)', () => {
  // Con $2,500: X pide 1950 + 2100 y Y pide 1650 + 2400. Misma suma (4050) = igual de cerca;
  // en punto flotante X daba 0.81 y Y 0.8099999999999999. Debe ganar Y por precio de lista.
  const ctx = cargar({ extra: (c) => {
    soloEstos(c);
    equipo(c, { id: 'fxx', name: 'Fixture X', contado: 10500, precios: (p) => (p === 'Plata' ? 3000 : p === 'Oro' ? 4200 : 9000) });
    equipo(c, { id: 'fxy', name: 'Fixture Y', contado: 10900, precios: (p) => (p === 'Plata' ? 3300 : p === 'Oro' ? 4800 : 9000) });
  } });
  const r = ctx.recoCalcular(2500, 'Plata', 'Oro', 36);
  assert.deepEqual(plano(r.lista.map((x) => [x.id, x.a.eng, x.b.eng])), [['fxy', 1650, 2400], ['fxx', 1950, 2100]]);
});

test('iPhone nunca entra', () => {
  const ctx = cargar({ extra: (c) => { soloEstos(c); equipo(c, { id: 'ipfixture', name: 'iPhone Fixture', contado: 5000, precios: gratis, os: 'ios', status: 'NPI' }); } });
  assert.equal(ctx.recoCalcular(5000, 'Plata', 'Oro', 36).lista.length, 0);
  assert.equal(ctx.campanaEquipos().length, 0);
});

test('sin resultados: lista vacía y el mínimo que haría entrar al menos uno', () => {
  const ctx = cargar();
  const r = ctx.recoCalcular(1000, 'Plata', 'Oro', 36);
  assert.equal(r.lista.length, 0);
  assert.equal(r.minimo, oraculo(ctx, 1000, 'Plata', 'Oro', 36).minimo);
  const f = cargar({ extra: (c) => { soloEstos(c); equipo(c, { id: 'fxg', name: 'Fixture G', contado: 5000, precios: gratis }); } });
  assert.equal(f.recoCalcular(1000, 'Plata', 'Oro', 36).minimo, 2175);
  assert.equal(f.recoCalcular(0, 'Plata', 'Oro', 36).lista.length, 0);
});

test('precio null: fuera si no hay precio en un plan menor; INCLUIDO si lo hay', () => {
  const ctx = cargar({ extra: (c) => {
    soloEstos(c);
    // Sin nada de Azul 1 a Plata: resolvePrice(Plata) da null → no entra con Plata.
    equipo(c, { id: 'fxnull', name: 'Fixture Null', contado: 5000, precios: (p) => (PLANES.indexOf(p) <= 3 ? null : 0) });
    // Plata 36 null pero Plata 24 con precio: resolvePrice lo vuelve $0 (regla de auto-rellenado).
    equipo(c, { id: 'fxauto', name: 'Fixture Auto', contado: 5000, precios: (p, z) => (p === 'Plata' && z === '36' ? null : 1000) });
  } });
  const r = ctx.recoCalcular(5000, 'Plata', 'Oro', 36);
  assert.deepEqual(plano(r.lista.map((x) => x.id)), ['fxauto']);
  assert.equal(r.lista[0].a.incluido, true);
});

test('campanaEquipos: Android NPI vigentes, un modelo, del más caro al más barato, Plata y Oro a 36', () => {
  const ctx = cargar({ extra: (c) => {
    soloEstos(c);
    equipo(c, { id: 'npia', name: 'Npi A', contado: 15000, precios: () => 4000, status: 'NPI' });
    equipo(c, { id: 'npib128', name: 'Npi B', contado: 11000, precios: () => 3000, status: 'NPI' });
    equipo(c, { id: 'npib256', name: 'Npi B', storage: '256 GB', contado: 12000, precios: () => 3000, status: 'NPI' });
    equipo(c, { id: 'npic', name: 'Npi C', contado: 20000, precios: () => 3000, status: 'NPI', vig: AYER });
    equipo(c, { id: 'resd', name: 'Resurtible D', contado: 30000, precios: () => 3000, status: 'RESURTIBLE' });
    equipo(c, { id: 'ipnpi', name: 'iPhone NPI', contado: 25000, precios: () => 3000, status: 'NPI', os: 'ios' });
  } });
  const r = plano(ctx.campanaEquipos());
  assert.deepEqual(r.map((x) => x.id), ['npia', 'npib256']);
  for (const x of r) {
    assert.equal(x.a.plan, 'Plata');
    assert.equal(x.b.plan, 'Oro');
    assert.equal(x.a.plazo, 36);
    assert.equal(x.b.plazo, 36);
  }
  assert.equal(r[0].a.promo, 4000);
});

test('filtro por marca: solo esa marca y el mínimo se calcula dentro de la marca', () => {
  const ctx = cargar({ extra: (c) => {
    soloEstos(c);
    equipo(c, { id: 'fxs', name: 'Fixture S', contado: 9000, precios: gratis });
    c.CAT.android[c.CAT.android.length - 1].brand = 'SAMSUNG';
    equipo(c, { id: 'fxh', name: 'Fixture H', contado: 9500, precios: gratis });
    c.CAT.android[c.CAT.android.length - 1].brand = 'HONOR';
  } });
  assert.deepEqual(plano(ctx.recoCalcular(5000, 'Plata', 'Oro', 36, 'SAMSUNG').lista.map((x) => x.id)), ['fxs']);
  assert.deepEqual(plano(ctx.recoCalcular(5000, 'Plata', 'Oro', 36, '').lista.map((x) => x.id)), ['fxh', 'fxs']);
  assert.equal(ctx.recoCalcular(1000, 'Plata', 'Oro', 36, 'XIAOMI').minimo, null);
  assert.deepEqual(plano(ctx.recoMarcas()), ['HONOR', 'SAMSUNG']);
});

test('equipos ocultos no aparecen en recomendación, campaña ni marcas', () => {
  const ctx = cargar({ extra: (c) => {
    soloEstos(c);
    equipo(c, { id: 'fxvis', name: 'Fixture Visible', contado: 9000, precios: gratis, status: 'NPI' });
    equipo(c, { id: 'fxoc', name: 'Fixture Oculto', contado: 9500, precios: gratis, status: 'NPI' });
    c.CAT.android[c.CAT.android.length - 1].brand = 'OCULTA';
    c.OCULTOS = ['fxoc'];
  } });
  assert.equal(ctx.isVigent('fxoc'), false);
  assert.equal(ctx.isVigent('fxvis'), true);
  assert.deepEqual(plano(ctx.recoCalcular(5000, 'Plata', 'Oro', 36).lista.map((x) => x.id)), ['fxvis']);
  assert.deepEqual(plano(ctx.campanaEquipos().map((x) => x.id)), ['fxvis']);
  assert.deepEqual(plano(ctx.recoMarcas()), ['PRUEBA']);
});

test('los 12 modelos que Diego mandó ocultar no salen con el catálogo real', () => {
  const ctx = cargar();
  const ocultos = ['hmagic8pro', 'hx5c', 'medge60f', 'medge60pro', 'medge60pro_w', 'mrazr60u', 'opfindx9pro', 'opreno13', 'opreno14', 'opreno14f', 'x15t', 'x15tpro'];
  for (const id of ocultos) assert.equal(ctx.isVigent(id), false, id);
  const vistos = new Set();
  for (const [a, b] of [['Azul 1', 'Azul 2'], ['Plata', 'Oro'], ['Black', 'Platino'], ['Platino', 'Diamante']]) {
    ctx.recoCalcular(9000, a, b, 36).lista.forEach((x) => vistos.add(x.id));
  }
  ctx.campanaEquipos().forEach((x) => vistos.add(x.id));
  assert.deepEqual(ocultos.filter((id) => vistos.has(id)), []);
});

test('vigLargo', () => {
  const ctx = cargar({ extra: (c) => { c.VIGENCY.fxv1 = '2027-01-10'; c.VIGENCY.fxv2 = 'indefinido'; } });
  assert.deepEqual(plano(ctx.vigLargo('fxv1')), { txt: 'Vigente al 10 de enero', ultimo: false });
  assert.deepEqual(plano(ctx.vigLargo('fxv2')), { txt: 'Vigente hasta nuevo aviso', ultimo: false });
  assert.deepEqual(plano(ctx.vigLargo('noexiste')), { txt: 'Vigente hasta nuevo aviso', ultimo: false });
});

test('fmtMoneda', () => {
  const ctx = cargar();
  assert.deepEqual(plano(ctx.fmtMoneda(2798.72)), { ent: '$2,798', dec: '.72' });
  assert.deepEqual(plano(ctx.fmtMoneda(0)), { ent: '$0', dec: '.00' });
  assert.deepEqual(plano(ctx.fmtMoneda(10809.37)), { ent: '$10,809', dec: '.37' });
});

test('recoParseMonto lee solo el número', () => {
  const ctx = cargar();
  assert.equal(ctx.recoParseMonto('$2,500'), 2500);
  assert.equal(ctx.recoParseMonto('2 500'), 2500);
  assert.equal(ctx.recoParseMonto('2,500.50'), 2500);
  assert.equal(ctx.recoParseMonto(''), 0);
  assert.equal(ctx.recoParseMonto('abc'), 0);
  assert.equal(ctx.recoParseMonto(null), 0);
});

test('planVis toma GB y renta de PLANS_DATA', () => {
  const ctx = cargar();
  const v = plano(ctx.planVis('Oro'));
  assert.equal(v.gb, 32);
  assert.equal(v.renta, 725);
  assert.equal(v.cls, 'pw-oro');
  assert.equal(ctx.planVis('Titanio'), null);
});
