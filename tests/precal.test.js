// [v1.73.18] Precalificación crediticia (piloto): motor tal cual, acceso, preguntas y conversión.
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { extraerFuncion } = require('./cargar-app.js');

const RAIZ = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const APP = leer('app.js');
const HTML = leer('index.html');
const M = require('../precal/precalificacion.js');
const CFG = JSON.parse(leer('precal/config.json'));
const plano = (x) => JSON.parse(JSON.stringify(x));

function cargar() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('catalog.js'), ctx);
  const a = APP.indexOf('// <precal-puro>'), b = APP.indexOf('// </precal-puro>');
  assert.ok(a >= 0 && b > a, 'app.js trae el bloque <precal-puro>');
  vm.runInContext(APP.slice(a, b), ctx);
  return ctx;
}
const c = cargar();
const motor = M.crear(c.precalConfig(CFG, c.PLANS_DATA));
const C = motor.config;
const HOY = new Date(2026, 10, 17);
// Respuestas del ejemplo del mockup (DEF de build.js) e identidad de su ejemplo.
const EJ = { tramite: 'portabilidad', planActual: 'pospago_12', adeudoATT: 'no', antig: 'a23', cuenta: 'corriente', pago: 650,
  banda: 'b15', plan: 'Oro', plazo: 36, tarjeta: 'departamental', limite: 'no', vivienda: 'ninguno', negado: 'no',
  atraso: 'no', peor: 'd1_29', otra: 'no', ingreso: 'i20', pagos: 'p3', comprobante: 'si' };
const ID = { ok: true, curp: 'LOHM900215MGTPRR08', ine: '2031', nac: '1990-02-15' };

test('motor: pasan sus 41 pruebas originales contra los archivos del repo', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'precal/test_motor.js')], { encoding: 'utf8' });
  assert.match(out, /41 pruebas OK/);
});

test('acceso: DC499W y las plantillas de León Centro y Plaza Nogal León, nadie más', () => {
  assert.ok(c.precalTiendaOK({ tienda: 'PRM TDA LEON CENTRO' }));
  assert.ok(c.precalTiendaOK({ tienda: 'PRM TDA PLAZA NOGAL LEON' }));
  assert.ok(c.precalTiendaOK({ sucursal: 'prm tda plaza nogal león' }), 'sin importar acentos ni mayúsculas');
  assert.ok(c.precalTiendaOK({ tienda: '  PRM TDA  LEON CENTRO ' }), 'ni espacios de más');
  assert.ok(!c.precalTiendaOK({ tienda: 'PRM TDA LEON FLAGSHIP' }));
  assert.ok(!c.precalTiendaOK({ tienda: 'PRM TDA PLAZA ROSSINI', tiendasAsignadas: ['PRM TDA LEON CENTRO'] }), 'un regional de esa tienda no es plantilla');
  assert.ok(!c.precalTiendaOK(null));
  const f = extraerFuncion(APP, '_precalPuedeVer');
  assert.match(f, /_meEsSuper\(\)/);
  assert.match(f, /precalTiendaOK\(asesorData\)/);
  assert.match(extraerFuncion(APP, 'precalAbrir'), /if\(!_precalPuedeVer\(\)\) return;/);
  assert.match(extraerFuncion(APP, 'updateAdminHomeCard'), /updatePrecalCard\(\)/);
  assert.match(HTML, /<button class="pmd-item" id="precal-home-card" style="display:none" onclick="pmdGo\('precal'\)">/);
  assert.match(HTML, /case 'precal': run\(function\(\)\{ if\(typeof precalAbrir==='function'\)precalAbrir\(\); \}\); break;/);
});

test('rentas: las de PLANS_DATA, hoy iguales a config.json', () => {
  assert.deepEqual(plano(C.planes), plano(CFG.planes));
  const otro = c.precalConfig(CFG, [{ name: 'Plata', renta: 699 }]);
  assert.equal(otro.planes.Plata, 699);
  assert.equal(CFG.planes.Plata, 650, 'no toca la config original');
});

test('ejemplo del mockup: mismos datos del motor y mismo resultado (perfil B, 58%, alterna Azul 2)', () => {
  const ejemplo = { tramite: 'portabilidad', tarjeta: 'departamental', hipoteca: false, auto: false, otrosCreditos: [], pagosOtrosCreditos: 2000,
    atraso: 'no', peorAtraso24: 'd1_29', quitas: 'no', adeudoOtra: 'no', solicitudes6m: 'ninguna', ingreso: 16000, comprobante: true,
    identidad: { consentimiento: true, curp: 'LOHM900215MGTPRR08', ineVigencia: 2031, fechaNacimientoINE: '1990-02-15' },
    pedido: { plan: 'Oro', precioEquipo: 12500, plazo: 36, enganche: 0 }, usoTarjetas: 'u30', adeudoATT: 'no', planActual: 'pospago_12' };
  const d = plano(c.precalDatos(EJ, C, ID));
  assert.deepEqual(d, ejemplo);
  const v = c.precalVista(motor.evaluar(d, { hoy: HOY }), d, C);
  assert.equal(v.perfil, 'B');
  assert.equal(v.pct, '58%');
  assert.equal(v.pedidoTxt, 'Oro · Equipo $10,000 a $15,000 · 36 meses');
  assert.equal(v.alt.txt, 'Azul 2 · Equipo $5,000 a $10,000 · 36 meses');
  assert.equal(v.hist.etiqueta, 'Regular');
  assert.equal(v.hist.rango, '612 – 652');
  assert.deepEqual(plano(v.docs), ['INE vigente', 'Tarjeta de crédito (últimos 4 dígitos)', 'Comprobante de domicilio']);
});

test('preguntas: arranca sin respuestas y pide todas las visibles', () => {
  assert.deepEqual(plano(c.precalFaltan({}, C)), ['tramite', 'banda', 'tarjeta', 'vivienda', 'negado', 'atraso', 'peor', 'otra', 'ingreso', 'pagos', 'comprobante']);
  assert.deepEqual(plano(c.precalFaltan(EJ, C)), []);
  const adic = Object.assign({}, EJ, { tramite: 'adicional', pago: '' });
  assert.deepEqual(plano(c.precalFaltan(adic, C)), ['pago'], 'línea adicional sin pago actual');
  assert.deepEqual(plano(c.precalFaltan(Object.assign({}, adic, { pago: '0' }), C)), []);
  const sin = Object.assign({}, EJ, { banda: 'sin', plan: 'Azul 1' });
  delete sin.plazo;
  assert.deepEqual(plano(c.precalFaltan(sin, C)), [], 'sin equipo no pregunta plazo');
  assert.deepEqual(plano(c.precalFaltan(Object.assign({}, EJ, { tarjeta: 'ninguna', limite: undefined }), C)), [], 'sin tarjeta no pregunta el límite');
});

test('cambiar el precio: si el plan no existe en esa banda se toma el de renta más cercana', () => {
  assert.equal(c.precalFijarEn(EJ, C, 'banda', 'b5').plan, 'Plata');
  assert.equal(c.precalFijarEn(Object.assign({}, EJ, { plan: 'Black' }), C, 'banda', 'b10').plan, 'Oro');
  assert.equal(c.precalFijarEn({}, C, 'banda', 'b5').plan, undefined, 'sin plan elegido no inventa uno');
});

test('identidad: solo lo capturado; vigencia de 4 dígitos', () => {
  assert.deepEqual(plano(c.precalIdentidad({})), { consentimiento: false });
  assert.deepEqual(plano(c.precalIdentidad({ ok: true, curp: ' lohm900215mgtprr08 ', ine: '31', nac: '' })), { consentimiento: true, curp: 'LOHM900215MGTPRR08' });
  const r = motor.evaluar(c.precalDatos(EJ, C, {}), { hoy: HOY });
  assert.equal(r.decision, 'No procede', 'sin autorización del cliente no procede');
});

test('registro: filas de calibración para solicitado, alterna y aprobado con otro plan', () => {
  const d = plano(c.precalDatos(EJ, C, ID));
  const r = motor.evaluar(d, { hoy: HOY }), s = r.solicitado, a = r.alterna;
  const rec = { resumen: { plan: s.plan, banda: s.banda, plazo: s.plazo, precio: s.precio, enganche: s.enganche,
    alt: { plan: a.plan, banda: a.banda, plazo: a.plazo, precio: a.precio, enganche: a.enganche } } };
  delete d.identidad.curp; delete d.identidad.fechaNacimientoINE; // se guarda sin CURP ni fecha
  const e = c.precalEnvio(rec, 'pedido');
  assert.deepEqual(plano(e), { plan: 'Oro', precioEquipo: 12500, plazo: 36, enganche: 0 });
  assert.equal(motor.filasCalibracion(d, e, 'aprobado', { hoy: HOY })[0].y, 1);
  assert.equal(c.precalEnvio(rec, 'alterna').plan, 'Azul 2');
  assert.equal(c.precalEnvio(rec, 'otro'), null);
  const f = motor.filasCalibracion(d, e, { contraoferta: { plan: 'Azul 3', precioEquipo: 12500, plazo: 36, enganche: 0 } }, { hoy: HOY });
  assert.deepEqual(f.map((x) => x.y), [0, 1]);
});

test('carga bajo demanda: el motor no viaja en el index ni en el precache', () => {
  assert.doesNotMatch(HTML, /<script[^>]+precalificacion\.js/);
  assert.doesNotMatch(leer('sw.js').split('OFFLINE_ASSETS')[1].split('];')[0], /precal/);
  assert.match(extraerFuncion(APP, '_precalCargar'), /'precal\/precalificacion\.js\?v=' \+ v/);
});
