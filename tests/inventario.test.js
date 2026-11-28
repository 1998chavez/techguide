// [v1.73.26] Inventario por tienda (Bajío): claves, emparejar con el catálogo, quién ve
// qué tiendas y el resumen de Desarrollador. Correr: node --test tests/*.test.js
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
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'catalog.js'), 'utf8'), ctx);
  const a = APP.indexOf('// <inv-puro>'), b = APP.indexOf('// </inv-puro>');
  assert.ok(a >= 0 && b > a, 'app.js trae el bloque <inv-puro>');
  vm.runInContext(APP.slice(a, b), ctx);
  ctx.TODOS = vm.runInContext('CAT.ios.concat(CAT.android)', ctx);
  return ctx;
}
const c = cargar();
const idx = c.invIndice(c.TODOS);

test('tienda: sin "PRM TDA", mayúsculas y sin acentos', () => {
  assert.equal(c.invClaveTienda('PRM TDA LEÓN CENTRO'), 'LEON CENTRO');
  assert.equal(c.invClaveTienda('prm tda  Plaza Nogal León'), 'PLAZA NOGAL LEON');
  assert.equal(c.invClaveTienda('PRM TDA LEON ALTACIA'), c.invClaveTienda('León Altacia'));
  assert.equal(c.invClaveTienda('LAGOS'), 'LAGOS');
});

test('modelo: marca + modelo + GB, sin red ni espacios', () => {
  assert.equal(c.invClaveModelo('APPLE IPHONE 17 256GB 5G'), 'APPLEIPHONE17256');
  assert.equal(c.invClaveModelo('HONOR MAGIC7 LITE 512GB 5G'), 'HONORMAGIC7LITE512');
  assert.equal(c.invClaveModelo('HONOR X7B 256GB 4G'), 'HONORX7B256');
  assert.equal(c.invClaveModelo('Samsung Galaxy A27 128 GB'), 'SAMSUNGA27128');
});

test('empareja con el catálogo sin tocarlo', () => {
  const casos = {
    'APPLE IPHONE 17 256GB 5G': 'ip17', 'HONOR MAGIC8 LITE 512GB 5G': 'hmagic8lite', 'OPPO RENO16 256GB 5G': 'opreno16',
    'OPPO A6T 128GB 4G': 'opa6t', 'XIAOMI REDMI 17 128GB 4G': 'xr17', 'GOOGLE PIXEL 10 128GB 5G': 'px10',
    'SAMSUNG GALAXY A17 128GB 5G': 'sa17', 'SAMSUNG GALAXY A27 128GB 4G': 'sa27', 'SAMSUNG GALAXY S26 ULTRA 512GB 5G': 'ss26ultra',
  };
  for (const [m, id] of Object.entries(casos)) {
    const r = c.invEmparejar([{ modelo: m, cant: 2 }], idx, {});
    assert.deepEqual(plano(r.porId), { [id]: 2 }, m);
  }
  const antes = fs.readFileSync(path.join(RAIZ, 'catalog.js'), 'utf8');
  c.invIndice(c.TODOS);
  assert.equal(fs.readFileSync(path.join(RAIZ, 'catalog.js'), 'utf8'), antes);
});

test('mismo modelo en 4G y 5G suma; el A5 Pro 4G y 5G del catálogo se separan por la red', () => {
  const r = c.invEmparejar([{ modelo: 'OPPO A6T 128GB 4G', cant: 2 }, { modelo: 'OPPO A6T 128GB 5G', cant: 1 },
    { modelo: 'OPPO A5 PRO 256GB 4G', cant: 3 }, { modelo: 'OPPO A5 PRO 256GB 5G', cant: 4 }], idx, {});
  assert.deepEqual(plano(r.porId), { opa6t: 3, opa5pro4g: 3, opa5pro5g: 4 });
});

test('lo que no empata sale aparte; INV_ALIAS lo arregla o lo calla (null)', () => {
  const eq = [{ modelo: 'HONOR X7B 256GB 4G', cant: 3 }, { modelo: 'SAMSUNG GALAXY A16 128GB 4G', cant: 2 }];
  assert.deepEqual(plano(c.invEmparejar(eq, idx, {}).sin), [{ modelo: 'HONOR X7B 256GB 4G', cant: 3 }, { modelo: 'SAMSUNG GALAXY A16 128GB 4G', cant: 2 }]);
  const r = c.invEmparejar(eq, idx, { 'HONOR X7B 256GB 5G': 'hx7d', 'SAMSUNG GALAXY A16 128GB': null });
  assert.deepEqual(plano(r.porId), { hx7d: 3 }, 'el alias no depende de 4G/5G');
  assert.deepEqual(plano(r.sin), []);
  assert.deepEqual(plano(c.INV_ALIAS), {}, 'INV_ALIAS arranca vacío');
});

test('quién ve qué tiendas', () => {
  const lista = [
    { org: 'ZX1', tienda: 'PRM TDA LEON ALTACIA', clave: 'LEON ALTACIA' },
    { org: 'ZX2', tienda: 'PRM TDA LEON CENTRO', clave: 'LEON CENTRO' },
    { org: 'ZX3', tienda: 'PRM TDA LAGOS', clave: 'LAGOS' },
  ];
  const v = (u) => c.invTiendasVisibles(lista, u).map((t) => t.org).join();
  assert.equal(v({ rol: 'asesor', tienda: 'PRM TDA LEÓN CENTRO' }), 'ZX2');
  assert.equal(v({ rol: 'gerente', tienda: 'PRM TDA LAGOS', tiendasAsignadas: ['PRM TDA LEON ALTACIA'] }), 'ZX3', 'gerente: solo la suya');
  assert.equal(v({ rol: 'asesor', tienda: 'PRM TDA SILAO' }), '', 'tienda sin inventario: nada');
  assert.equal(v({ rol: 'regional', tienda: '', tiendasAsignadas: ['PRM TDA LEON ALTACIA', 'PRM TDA LAGOS'] }), 'ZX1,ZX3');
  assert.equal(v({ rol: 'director', regiones: ['BAJIO'], regionInv: 'BAJIO' }), 'ZX1,ZX2,ZX3');
  assert.equal(v({ rol: 'director', regiones: ['NORTE'], regionInv: 'BAJIO' }), '');
  assert.equal(v({ rol: 'director_nacional', global: true }), 'ZX1,ZX2,ZX3');
});

test('fecha corta y piezas', () => {
  assert.equal(c.invFechaCorta('2026-11-26'), '26 nov');
  assert.equal(c.invFechaCorta('2026-01-05T11:05:00-06:00'), '5 ene');
  assert.equal(c.invFechaCorta(''), '');
  assert.equal(c.invPzas(1), '1 pza');
  assert.equal(c.invPzas(3), '3 pzas');
});

test('Desarrollador: sin empatar con piezas y tiendas, de más a menos', () => {
  const docs = [
    { equipos: [{ modelo: 'HONOR X7B 256GB 4G', cant: 3 }, { modelo: 'OPPO A6T 128GB 4G', cant: 9 }] },
    { equipos: [{ modelo: 'HONOR X7B 256GB 4G', cant: 2 }, { modelo: 'APPLE IPHONE 13 128GB 5G', cant: 6 }] },
  ];
  assert.deepEqual(plano(c.invSinEmpatar(docs, idx, {})), [
    { modelo: 'APPLE IPHONE 13 128GB 5G', pzas: 6, tiendas: 1 },
    { modelo: 'HONOR X7B 256GB 4G', pzas: 5, tiendas: 2 },
  ]);
});

test('catálogo: por default lo de la tienda; el botón muestra todos y cada equipo lleva sus piezas', () => {
  const r = extraerFuncion(APP, 'renderDevs');
  assert.match(r, /if\(_inv\) devs=devs\.filter\(d=>invCant\(d\.id\)>0\);/);
  assert.match(r, /h\+=_pz\(d\.id\);/);
  assert.match(r, /_pz\(d\.id\)\+bs\(d\.status\)/);
  assert.match(extraerFuncion(APP, 'invAlAbrirCatalogo'), /invEstado\.todos = false;/);
  assert.match(extraerFuncion(APP, 'showCatalog'), /invAlAbrirCatalogo\(\);/);
  assert.match(extraerFuncion(APP, 'invAlternar'), /invEstado\.todos = !invEstado\.todos;/);
  assert.match(HTML, /<button type="button" class="inv-btn" id="inv-btn" hidden aria-pressed="false" onclick="invAlternar\(\)">/);
  assert.match(HTML, />Todos los modelos<\/button>/);
});

test('una lectura por sesión: _meta y una por tienda', () => {
  assert.match(extraerFuncion(APP.replace('async function invDoc(', 'function invDoc('), 'invDoc'), /if\(Object\.prototype\.hasOwnProperty\.call\(invEstado\.docs, org\)\) return invEstado\.docs\[org\];/);
  assert.match(extraerFuncion(APP, 'invCargar'), /if\(invEstado\.cargando\) return invEstado\.cargando;/);
  assert.match(extraerFuncion(APP, 'invCargar'), /if\(invEstado\.de !== yo\)/, 'otro usuario en el mismo teléfono: se vuelve a leer');
  assert.match(extraerFuncion(APP, 'updateAdminHomeCard'), /invCargar\(\)/);
  assert.match(extraerFuncion(APP, 'usoAbrir'), /invDevCargar\(\)/);
});

// [v1.73.27] Colores por equipo
test('colores: se juntan por nombre en el mismo equipo y van de más a menos', () => {
  const r = c.invEmparejar([
    { modelo: 'OPPO A6T 128GB 4G', cant: 3, colores: [{ color: 'Negro', tono: '#1d1d1f', cant: 2 }, { color: 'Azul', tono: null, cant: 1 }] },
    { modelo: 'OPPO A6T 128GB 5G', cant: 2, colores: [{ color: 'AZUL', tono: '#2F6FDB', cant: 2 }] },
  ], idx, {});
  assert.deepEqual(plano(r.porId), { opa6t: 5 });
  assert.deepEqual(plano(r.colores), { opa6t: [{ color: 'Azul', tono: '#2F6FDB', cant: 3 }, { color: 'Negro', tono: '#1D1D1F', cant: 2 }] });
});

test('colores: si uno de los modelos del equipo vino sin colores, el equipo va sin colores', () => {
  const r = c.invEmparejar([
    { modelo: 'OPPO A6T 128GB 4G', cant: 3, colores: [{ color: 'Negro', tono: '#000000', cant: 3 }] },
    { modelo: 'OPPO A6T 128GB 5G', cant: 2 },
  ], idx, {});
  assert.deepEqual(plano(r.porId), { opa6t: 5 });
  assert.deepEqual(plano(r.colores), {});
});

test('fila de colores: punto con tono (gris si no hay), nombre escapado y piezas', () => {
  assert.equal(c.invColoresHTML([], 'x'), '');
  const h = c.invColoresHTML([{ color: 'Sky <b>White</b>', tono: '#F5F5F5', cant: 2 }, { color: 'Tidal Blue', tono: 'azul', cant: 1 }, { color: 'Midnight Black', tono: '#1D1D1F', cant: 1 }], 'cv-cols');
  assert.match(h, /^<div class="inv-cols cv-cols">/);
  assert.match(h, /<i class="inv-dot claro" style="background:#F5F5F5"/, 'el blanco lleva borde');
  assert.match(h, /<i class="inv-dot claro" style="background:#C7C7CC"/, 'tono inválido: gris, con borde como los claros');
  assert.match(h, /<i class="inv-dot oscuro" style="background:#1D1D1F"/, 'el negro lleva borde en oscuro');
  assert.match(h, /<span class="inv-col-n">Sky &lt;b&gt;White&lt;\/b&gt;<\/span><b>2<\/b>/);
  assert.equal(c.invTono('#2f6fdb'), '#2F6FDB');
  assert.equal(c.invTono('red'), null);
});

test('colores: debajo de las piezas solo con el filtro de la tienda, y en la ficha', () => {
  const r = extraerFuncion(APP, 'renderDevs');
  assert.match(r, /const _cols=function\(id\)\{ return _inv\?invColoresHTML\(invColores\(id\),'cv-cols',true\):''; \};/);
  assert.match(r, /return n&&!\(_inv&&invColores\(id\)\.length\)\?'<span class="cv-pzas">'/, 'con colores, sin la pastilla del total');
  assert.match(r, /h\+=bs\(d\.status\);\n\s+h\+=_cols\(d\.id\);/);
  assert.match(r, /h\+='<\/div>'\+_cols\(d\.id\)\+'<\/div>';/);
  assert.match(extraerFuncion(APP, 'showFicha'), /h\+='<\/div>';\n.*\n\s+if\(typeof invFichaHTML==='function'\) h\+=invFichaHTML\(id\);\n\s+h\+='<\/section>';/, 'al pie del encabezado');
  assert.match(extraerFuncion(APP, 'invFichaHTML'), /if\(!d \|\| !n \|\| !cols\.length\) return '';/);
  assert.match(extraerFuncion(APP.replace('async function invDoc(', 'function invDoc('), 'invDoc'), /colores: emp\.colores/);
});

test('color sin prefijo: la palabra del color; el material solo si no hay otra', () => {
  const casos = { 'Midnight Black': 'Black', 'Tidal Blue': 'Blue', 'Dreamy Purple': 'Purple', 'Silver': 'Silver', 'Black Titanium': 'Black',
    'Natural Titanium': 'Titanium', 'Negro Medianoche': 'Negro', 'Café Moca': 'Café', 'Sage': 'Sage', 'Cosmic Orange': 'Orange', 'MIST WHITE': 'WHITE' };
  for (const [n, e] of Object.entries(casos)) assert.equal(c.invColorCorto(n), e, n);
});

test('nombre corto; si dos quedan igual, esos van completos', () => {
  const cols = [{ color: 'Sky Blue', tono: '#9CC3E6', cant: 2 }, { color: 'Deep Blue', tono: '#1F3A93', cant: 1 }, { color: 'Midnight Black', tono: '#1D1D1F', cant: 1 }];
  const nombres = (h) => [...h.matchAll(/<span class="inv-col-n">([^<]*)<\/span>/g)].map((m) => m[1]).join('|');
  assert.equal(nombres(c.invColoresHTML(cols, 'cv-cols', true)), 'Sky Blue|Deep Blue|Black');
  assert.equal(nombres(c.invColoresHTML(cols, 'fx-inv-cols')), 'Sky Blue|Deep Blue|Midnight Black');
});
