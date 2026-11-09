// [v1.73.0] Carga para node, sin navegador: catalog.js + las funciones de
// app.js que usa el bloque <reco-puro> + el bloque mismo. app.js completo no
// se puede evaluar en node (toca el DOM al cargar), por eso se extrae solo lo
// necesario, tal cual está en el archivo que se entrega.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// Avanza desde `i` (que apunta a una comilla o a "/" de comentario) hasta
// después del literal o comentario. Así las llaves dentro de cadenas no cuentan.
function saltar(src, i) {
  const c = src[i];
  if (c === '/' && src[i + 1] === '/') { const f = src.indexOf('\n', i); return f < 0 ? src.length : f; }
  if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); return f < 0 ? src.length : f + 2; }
  if (c === "'" || c === '"' || c === '`') {
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  return i + 1;
}

// Texto completo de `function nombre(...) { ... }` declarada a nivel superior.
function extraerFuncion(src, nombre) {
  const m = new RegExp('(^|\\n)function ' + nombre + '\\s*\\(').exec(src);
  if (!m) throw new Error('app.js no tiene function ' + nombre);
  const ini = m.index + m[1].length;
  let i = src.indexOf('{', ini);
  let prof = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`' || (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*'))) { i = saltar(src, i); continue; }
    if (c === '{') prof++;
    if (c === '}') { prof--; if (prof === 0) return src.slice(ini, i + 1); }
    i++;
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}

function extraerConstante(src, nombre) {
  const m = new RegExp('\\n(const|let|var) ' + nombre + '\\s*=\\s*\\[[^\\]]*\\];').exec(src);
  if (!m) throw new Error('app.js no tiene ' + nombre);
  return m[0].trim().replace(/^(const|let)/, 'var');
}

// Bloque nuevo entre las marcas; null si todavía no existe.
function extraerBloque(src) {
  const a = src.indexOf('// <reco-puro>');
  const b = src.indexOf('// </reco-puro>');
  return a >= 0 && b > a ? src.slice(a, b) : null;
}

function cargar({ extra } = {}) {
  const app = leer('app.js');
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('catalog.js'), ctx, { filename: 'catalog.js' });
  const piezas = [
    extraerConstante(app, 'PLAN_ORDER'),
    extraerConstante(app, 'PLAZO_ORDER'),
    ...['isVigent', 'daysLeft', 'pctMostrar', 'resolvePrice'].map((n) => extraerFuncion(app, n)),
  ];
  vm.runInContext(piezas.join('\n'), ctx, { filename: 'app.js (funciones existentes)' });
  const bloque = extraerBloque(app);
  if (bloque) vm.runInContext(bloque, ctx, { filename: 'app.js <reco-puro>' });
  if (extra) extra(ctx);
  return ctx;
}

module.exports = { cargar, extraerFuncion };
