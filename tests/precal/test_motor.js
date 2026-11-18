// Pruebas y auditoría del motor v2. Ejecutar: node test_motor.js
'use strict';
var assert = require('assert');
var M = require('../../precal/precalificacion.js');
var CFG = require('../../precal/config.json');

var HOY = new Date(2026, 10, 14);
var motor = M.crear(CFG);
var cfg = motor.config;
var EPS = 1e-9;
var pruebas = 0;

function ok(nombre, fn) { fn(); pruebas++; console.log('  ✓ ' + nombre); }
function clonar(o) { return JSON.parse(JSON.stringify(o)); }
function cerca(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= (tol || 1e-9), (msg || '') + ' esperado ' + b + ' obtenido ' + a); }
function L(p) { return M.logit(p); }
function S(z) { return M.sigmoid(z); }

// Perfil de referencia: línea nueva, prepago, tarjeta bancaria con uso < 30%, historial de 1 a 3 años,
// sin hipoteca, auto ni otros créditos, sin atrasos, quitas ni adeudos, sin solicitudes, sin ingreso.
function referencia() {
  return {
    tramite: 'nueva', adeudoATT: 'no', planActual: 'prepago',
    tarjeta: 'banco', usoTarjetas: 'u30', hipoteca: false, auto: false, otrosCreditos: [], pagosOtrosCreditos: 0,
    antiguedadCredito: 'a1_3', atraso: 'no', peorAtraso24: 'ninguno', quitas: 'no', adeudoOtra: 'no',
    solicitudes6m: 'ninguna', ingreso: null, comprobante: true,
    identidad: { consentimiento: true, curp: 'HEGG560427MVZRRL04', ineVigencia: 2031, fechaNacimientoINE: '1956-04-27' },
    pedido: { plan: 'Plata', precioEquipo: 0, plazo: 36, enganche: 0, preciosPorPlan: null }
  };
}
function cfgCon(f) { var c = clonar(CFG); f(c); return c; }
// Config donde la mensualidad de referencia = Plata sin equipo, para reproducir cada % exacto
var motorRef = M.crear(cfgCon(function (c) { c.monto.referencia = c.planes.Plata; }));
function evalRef(d, m) { return (m || motorRef).evaluar(d, { hoy: HOY }); }
function renov(d, meses) { d.tramite = 'renovacion'; d.antiguedadMeses = meses; d.alCorrienteATT = true; d.tardiosATT = 'ninguno'; delete d.adeudoATT; delete d.planActual; return d; }
function adic(d, pago) { d.tramite = 'adicional'; d.pagoActualATT = pago; d.alCorrienteATT = true; d.tardiosATT = 'ninguno'; delete d.adeudoATT; delete d.planActual; return d; }
function curpDe(fechaISO) {
  var p = fechaISO.split('-'); var y = +p[0];
  var c17 = 'LOHM' + p[0].slice(2) + p[1] + p[2] + 'MGTPRR' + (y >= 2000 ? 'A' : '0');
  return c17 + M.digitoCURP(c17);
}

console.log('Configuración');
ok('config válida', function () { assert.deepStrictEqual(M.validarConfig(CFG), []); });
ok('config inválida se rechaza con mensaje', function () {
  assert.throws(function () { M.crear(cfgCon(function (c) { c.factores.quita_pendiente = 1.2; })); }, /quita_pendiente/);
  assert.throws(function () { M.crear(cfgCon(function (c) { c.cuentaATT.tardio_uno = 0; })); }, /tardio_uno/);
  assert.throws(function () { M.crear(cfgCon(function (c) { c.bandas[2].planes.push('Inexistente'); })); }, /Inexistente/);
  assert.throws(function () { M.crear(cfgCon(function (c) { c.historial.bandas[1].min = 590; })); }, /contiguas/);
  assert.throws(function () { M.crear(cfgCon(function (c) { c.monto.sinIngreso_aprobacionAlDoble = 0.9; })); }, /sinIngreso/);
});
ok('logit/sigmoid inversas', function () { [0.01, 0.2, 0.5, 0.75, 0.99].forEach(function (p) { cerca(S(L(p)), p, 1e-12); }); });

console.log('Cada % de la config se reproduce exacto');
ok('perfil de referencia = referencia.nueva', function () { cerca(evalRef(referencia()).p, CFG.referencia.nueva, EPS); });
ok('portabilidad = línea nueva', function () { var d = referencia(); d.tramite = 'portabilidad'; cerca(evalRef(d).p, CFG.referencia.nueva, EPS); });
ok('renovación ≥ 12 meses = referencia.renovacion', function () { cerca(evalRef(renov(referencia(), 12)).p, CFG.referencia.renovacion, EPS); });
ok('adicional con pago actual 0 = referencia.adicional', function () { cerca(evalRef(adic(referencia(), 0)).p, CFG.referencia.adicional, EPS); });
ok('cada factor por sí solo = su %', function () {
  var casos = {
    tarjeta_ambas: function (d) { d.tarjeta = 'ambas'; },
    tarjeta_departamental: function (d) { d.tarjeta = 'departamental'; },
    sin_historial: function (d) { d.tarjeta = 'ninguna'; delete d.usoTarjetas; delete d.antiguedadCredito; },
    otro_personal: function (d) { d.otrosCreditos = ['personal']; },
    otro_tiendas: function (d) { d.otrosCreditos = ['tiendas']; },
    otro_equipo: function (d) { d.otrosCreditos = ['equipo']; },
    hipoteca_si: function (d) { d.hipoteca = true; },
    auto_si: function (d) { d.auto = true; },
    antig_menos1: function (d) { d.antiguedadCredito = 'a_menos1'; },
    antig_3_5: function (d) { d.antiguedadCredito = 'a3_5'; },
    antig_mas5: function (d) { d.antiguedadCredito = 'a_mas5'; },
    uso_30_70: function (d) { d.usoTarjetas = 'u30_70'; },
    uso_mas70: function (d) { d.usoTarjetas = 'umas70'; },
    peor24_1_29: function (d) { d.peorAtraso24 = 'd1_29'; },
    peor24_30_89: function (d) { d.peorAtraso24 = 'd30_89'; },
    peor24_90: function (d) { d.peorAtraso24 = 'd90'; },
    quita_liquidada: function (d) { d.quitas = 'liquidada'; },
    quita_pendiente: function (d) { d.quitas = 'pendiente'; },
    adeudo_att_nosabe: function (d) { d.adeudoATT = 'nosabe'; },
    otra_si: function (d) { d.adeudoOtra = 'si'; },
    otra_nosabe: function (d) { d.adeudoOtra = 'nosabe'; },
    solicitudes_1_2: function (d) { d.solicitudes6m = 's1_2'; d.solicitudRechazada = false; },
    solicitudes_3mas: function (d) { d.solicitudes6m = 's3mas'; d.solicitudRechazada = false; },
    plan_pospago_menos12: function (d) { d.planActual = 'pospago_menos12'; },
    plan_pospago_12: function (d) { d.planActual = 'pospago_12'; }
  };
  Object.keys(casos).forEach(function (k) { var d = referencia(); casos[k](d); cerca(evalRef(d).p, CFG.factores[k], EPS, k); });
});
ok('factores que no existen solos se suman en log-odds', function () {
  var d = referencia(); d.solicitudes6m = 's1_2'; d.solicitudRechazada = true;
  cerca(evalRef(d).p, S(L(CFG.factores.solicitudes_1_2) + L(CFG.factores.solicitud_rechazada) - L(CFG.referencia.nueva)), EPS);
  var e = referencia(); e.tarjeta = 'ninguna'; delete e.usoTarjetas; e.planActual = 'pospago_menos12';
  cerca(evalRef(e).p, S(L(CFG.factores.tarjeta_ninguna) + L(CFG.factores.plan_pospago_menos12) - L(CFG.referencia.nueva)), EPS);
  var a = referencia(); a.atraso = 'menos1'; a.peorAtraso24 = 'd1_29';
  cerca(evalRef(a).p, S(L(CFG.factores.atraso_menos1) + L(CFG.factores.peor24_1_29) - L(CFG.referencia.nueva)), EPS);
});
ok('pagos tardíos AT&T = su % sobre la referencia de renovación', function () {
  var d = renov(referencia(), 24); d.tardiosATT = 'uno'; cerca(evalRef(d).p, CFG.cuentaATT.tardio_uno, EPS);
  d.tardiosATT = 'dos'; cerca(evalRef(d).p, CFG.cuentaATT.tardio_dos, EPS);
});
ok('mensualidad al doble = monto.sinIngreso_aprobacionAlDoble', function () {
  var m = M.crear(cfgCon(function (c) { c.monto.referencia = 400; }));
  var d = referencia(); d.pedido = { plan: 'Azul 2', precioEquipo: 365 * 24, plazo: 24, enganche: 0 };
  cerca(m.mensualidad('Azul 2', 365 * 24, 24, 0), 800, 1e-9);
  cerca(m.evaluar(d, { hoy: HOY }).p, CFG.monto.sinIngreso_aprobacionAlDoble, EPS);
});
ok('carga de referencia (AT&T + otros créditos) = capacidad.aprobacionConCarga', function () {
  var d = referencia(); d.pagosOtrosCreditos = 1000; d.ingreso = (650 + 1000) / CFG.capacidad.cargaReferencia;
  cerca(evalRef(d).p, CFG.capacidad.aprobacionConCarga, EPS);
  var e = referencia(); e.pagosOtrosCreditos = 1000; e.ingreso = (650 + 1000) / CFG.capacidad.cargaLibre;
  cerca(evalRef(e).p, CFG.referencia.nueva, 1e-9);
});

console.log('Reglas de trámite');
ok('renovación con < 12 meses se evalúa como línea nueva', function () {
  var n = referencia(); n.planActual = 'prepago';
  var r = renov(referencia(), 11);
  var er = evalRef(r);
  assert.strictEqual(er.grupo, 'nueva');
  cerca(er.p, evalRef(n).p, EPS);
  assert.ok(er.avisos.some(function (a) { return a.codigo === 'RENOV_COMO_NUEVA'; }));
});
ok('renovación ≥ 12 meses amortigua el historial externo en log-odds', function () {
  ['atraso', 'quitas', 'usoTarjetas'].forEach(function (campo) {
    var val = { atraso: 'menos1', quitas: 'liquidada', usoTarjetas: 'umas70' }[campo];
    var n = referencia(); n[campo] = val;
    var r = renov(clonar(n), 30);
    var zn = L(evalRef(n).p) - L(CFG.referencia.nueva);
    var zr = L(evalRef(r).p) - L(CFG.referencia.renovacion);
    cerca(zr, CFG.renovacion.amortiguador * zn, 1e-9, campo);
  });
});
ok('pagos tardíos AT&T no se amortiguan y aplican también en adicional', function () {
  var r0 = evalRef(adic(referencia(), 0));
  var d = adic(referencia(), 0); d.tardiosATT = 'dos';
  cerca(L(evalRef(d).p) - L(r0.p), L(CFG.cuentaATT.tardio_dos) - L(CFG.referencia.renovacion), 1e-9);
});
ok('adicional: más pago actual → menor probabilidad (estricto)', function () {
  var prev = 2;
  [0, 300, 600, 1200, 2400, 5000].forEach(function (c) { var p = evalRef(adic(referencia(), c)).p; assert.ok(p < prev); prev = p; });
});
ok('adicional: mensualidad evaluada = nueva + pago actual; la carga suma otros créditos', function () {
  var d = adic(referencia(), 777); d.ingreso = 4000; d.pagosOtrosCreditos = 500;
  var r = evalRef(d);
  cerca(r.solicitado.mensualidadEvaluada, 650 + 777, 1e-9);
  cerca(r.solicitado.x.exceso_carga, (650 + 777 + 500) / 4000 - CFG.capacidad.cargaLibre, 1e-12);
});

console.log('Normalización y congruencia');
ok('peor atraso de 24 meses se ajusta al atraso actual, sin modificar la entrada', function () {
  var d = referencia(); d.atraso = 'mas1'; d.peorAtraso24 = 'ninguno';
  var copia = clonar(d);
  var r = evalRef(d);
  assert.deepStrictEqual(d, copia);
  assert.ok(r.solicitado.x.peor24_30_89 === 1);
  assert.ok(r.avisos.some(function (a) { return a.codigo === 'PEOR_ATRASO_AJUSTADO'; }));
  var e = clonar(d); e.peorAtraso24 = 'd30_89';
  cerca(evalRef(e).p, r.p, EPS);
});
ok('antigüedad imposible para la edad, hipoteca antes de 21 y atrasos sin créditos se marcan', function () {
  var d = referencia(); d.identidad.curp = curpDe('2006-01-10'); d.identidad.fechaNacimientoINE = '2006-01-10';
  d.antiguedadCredito = 'a_mas5'; d.hipoteca = true;
  var r = evalRef(d);
  var cod = r.avisos.map(function (a) { return a.codigo; });
  assert.ok(cod.indexOf('ANTIGUEDAD_EDAD') >= 0 && cod.indexOf('HIPOTECA_EDAD') >= 0);
  assert.strictEqual(r.confianzaRespuestas.nivel, 'Media');
  var s = referencia(); s.tarjeta = 'ninguna'; delete s.usoTarjetas; delete s.antiguedadCredito; s.quitas = 'liquidada';
  assert.ok(evalRef(s).avisos.some(function (a) { return a.codigo === 'ATRASOS_SIN_CREDITOS'; }));
  var c = referencia(); c.quitas = 'pendiente';
  assert.ok(evalRef(c).avisos.some(function (a) { return a.codigo === 'COBRANZA_SIN_ATRASO'; }));
});
ok('antigüedad crediticia sin dato: no suma, no resta y no genera observación', function () {
  var con = referencia(); con.identidad.curp = curpDe('2008-03-01'); con.identidad.fechaNacimientoINE = '2008-03-01';
  var sin = clonar(con); delete sin.antiguedadCredito;
  var rc = evalRef(con), rs = evalRef(sin);
  cerca(rs.p, rc.p, EPS);
  assert.strictEqual(rs.historial.score, rc.historial.score);
  assert.ok(rc.avisos.some(function (a) { return a.codigo === 'ANTIGUEDAD_EDAD'; }), 'con dato 1–3 años a los 18 se marca');
  assert.ok(!rs.avisos.some(function (a) { return a.codigo === 'ANTIGUEDAD_EDAD'; }), 'sin dato no se marca');
});
ok('confianza baja con dudas e incongruencias; el margen del historial se amplía', function () {
  var d = referencia(); d.adeudoATT = 'nosabe'; d.adeudoOtra = 'nosabe'; d.quitas = 'pendiente';
  var r = evalRef(d);
  assert.strictEqual(r.confianzaRespuestas.nivel, 'Baja');
  assert.strictEqual(r.historial.max - r.historial.min, Math.min(CFG.historial.maximo, r.historial.score + CFG.historial.margenBase + 3 * CFG.historial.margenPorDuda) - Math.max(CFG.historial.minimo, r.historial.score - CFG.historial.margenBase - 3 * CFG.historial.margenPorDuda));
  assert.strictEqual(evalRef(referencia()).confianzaRespuestas.nivel, 'Alta');
});

console.log('Historial estimado (escala Buró)');
ok('referencia = scoreReferencia y banda correcta', function () {
  var h = evalRef(referencia()).historial;
  assert.strictEqual(h.score, CFG.historial.scoreReferencia);
  assert.strictEqual(h.banda, 'bueno');
  assert.strictEqual(h.max - h.min, 2 * CFG.historial.margenBase);
});
ok('duplicar momios suma puntosPorDuplicar', function () {
  var c = cfgCon(function (x) { x.factores.hipoteca_si = S(L(x.referencia.nueva) + Math.LN2); });
  var h = M.crear(c).evaluar(Object.assign(referencia(), { hipoteca: true }), { hoy: HOY }).historial;
  assert.strictEqual(h.score, CFG.historial.scoreReferencia + CFG.historial.puntosPorDuplicar);
});
ok('no depende del trámite, la mensualidad ni el ingreso', function () {
  var a = evalRef(referencia()).historial.score;
  var b = referencia(); b.pedido = { plan: 'Platino', precioEquipo: 25000, plazo: 24, enganche: 0 }; b.ingreso = 9000;
  assert.strictEqual(evalRef(b).historial.score, a);
  assert.strictEqual(evalRef(renov(referencia(), 30)).historial.score, a);
  var c = referencia(); c.planActual = 'pospago_12';
  assert.strictEqual(evalRef(c).historial.score, a, 'el plan actual no es dato de buró');
  var t = renov(referencia(), 30); t.tardiosATT = 'dos';
  assert.strictEqual(evalRef(t).historial.score, a, 'los pagos tardíos internos de AT&T no son dato de buró');
});
ok('sin historial no inventa score; límites y bandas acotados', function () {
  var s = referencia(); s.tarjeta = 'ninguna'; delete s.usoTarjetas; delete s.antiguedadCredito;
  var h = evalRef(s).historial;
  assert.ok(h.sinHistorial && h.score === null);
  var peor = referencia(); peor.atraso = 'mas1'; peor.peorAtraso24 = 'd90'; peor.quitas = 'pendiente'; peor.usoTarjetas = 'umas70'; peor.adeudoOtra = 'si';
  var hp = evalRef(peor).historial;
  assert.strictEqual(hp.score, CFG.historial.minimo); assert.strictEqual(hp.banda, 'bajo');
  var mejor = referencia(); mejor.tarjeta = 'ambas'; mejor.hipoteca = true; mejor.auto = true; mejor.antiguedadCredito = 'a_mas5'; mejor.otrosCreditos = ['personal'];
  var hm = evalRef(mejor).historial;
  assert.ok(hm.score <= CFG.historial.maximo && hm.banda === 'excelente');
});

console.log('Bloqueos');
ok('cada bloqueo da perfil D sin probabilidad', function () {
  var casos = [
    ['SIN_CONSENTIMIENTO', function (d) { d.identidad.consentimiento = false; }],
    ['INE_VENCIDA', function (d) { d.identidad.ineVigencia = 2025; }],
    ['CURP_INVALIDA', function (d) { d.identidad.curp = 'HEGG560427MVZRRL05'; }],
    ['CURP_NO_COINCIDE', function (d) { d.identidad.fechaNacimientoINE = '1956-04-28'; }],
    ['ADEUDO_ATT', function (d) { d.adeudoATT = 'si'; }],
    ['NO_AL_CORRIENTE', function (d) { renov(d, 30); d.alCorrienteATT = false; }],
    ['NO_AL_CORRIENTE', function (d) { adic(d, 500); d.alCorrienteATT = false; }]
  ];
  casos.forEach(function (c) {
    var d = referencia(); c[1](d);
    var r = evalRef(d);
    assert.strictEqual(r.perfil, 'D', c[0]); assert.strictEqual(r.p, null, c[0]); assert.strictEqual(r.decision, 'No procede');
    assert.ok(r.bloqueos.some(function (b) { return b.codigo === c[0]; }), c[0]);
  });
});
ok('menor de edad bloquea; 18 años exactos no', function () {
  var d = referencia(); d.identidad.curp = curpDe('2008-11-15'); d.identidad.fechaNacimientoINE = '2008-11-15';
  d.antiguedadCredito = 'a_menos1';
  assert.ok(evalRef(d).bloqueos.some(function (b) { return b.codigo === 'MENOR_DE_EDAD'; }));
  d.identidad.curp = curpDe('2008-11-14'); d.identidad.fechaNacimientoINE = '2008-11-14';
  assert.ok(!evalRef(d).bloqueos.some(function (b) { return b.codigo === 'MENOR_DE_EDAD'; }));
});

console.log('CURP');
ok('ejemplo publicado por RENAPO valida', function () { assert.ok(M.validarCURP('HEGG560427MVZRRL04', HOY).valida); });
ok('dígito, fecha y formato inválidos se rechazan', function () {
  assert.strictEqual(M.validarCURP('HEGG560427MVZRRL05', HOY).motivo, 'Dígito verificador incorrecto');
  var f = 'HEGG560231MVZRRL0'; assert.strictEqual(M.validarCURP(f + M.digitoCURP(f), HOY).motivo, 'Fecha de nacimiento inválida');
  assert.strictEqual(M.validarCURP('HEGG560427MXXRRL04', HOY).motivo, 'Formato inválido');
});
ok('siglo por homoclave y normalización de texto', function () {
  assert.strictEqual(M.validarCURP(curpDe('1905-01-01'), HOY).fechaNacimiento, '1905-01-01');
  assert.strictEqual(M.validarCURP(curpDe('2005-01-01'), HOY).fechaNacimiento, '2005-01-01');
  assert.ok(M.validarCURP('  hegg560427mvzrrl04 ', HOY).valida);
});

console.log('Mensualidad, bandas y validación');
ok('renta + (precio − enganche) / plazo', function () {
  cerca(motor.mensualidad('Oro', 12500, 36, 0), 725 + 12500 / 36, 1e-9);
  cerca(motor.mensualidad('Oro', 12500, 24, 2500), 725 + 10000 / 24, 1e-9);
  cerca(motor.mensualidad('Oro', 1000, 24, 5000), 725, 1e-9);
});
ok('límites de bandas exactos', function () {
  var ids = function (p) { return cfg.bandas[motor.bandaDePrecio(p)].id; };
  assert.deepStrictEqual([0, 1, 5000, 5000.5, 10000, 10001, 15000, 15001].map(ids), ['sin', 'b5', 'b5', 'b10', 'b10', 'b15', 'b15', 'b15mas']);
});
ok('datos incompletos o inválidos se rechazan con mensaje', function () {
  var casos = [
    [/plan Azul 1 no está disponible/, function (d) { d.pedido = { plan: 'Azul 1', precioEquipo: 12500, plazo: 36, enganche: 0 }; }],
    [/usoTarjetas/, function (d) { delete d.usoTarjetas; }],
    [/antiguedadCredito/, function (d) { d.antiguedadCredito = 'a10'; }],
    [/solicitudRechazada/, function (d) { d.solicitudes6m = 's1_2'; }],
    [/otrosCreditos inválido/, function (d) { d.otrosCreditos = ['casino']; }],
    [/otrosCreditos repetidos/, function (d) { d.otrosCreditos = ['personal', 'personal']; }],
    [/pagosOtrosCreditos/, function (d) { d.pagosOtrosCreditos = -1; }],
    [/planActual/, function (d) { delete d.planActual; }],
    [/tardiosATT/, function (d) { renov(d, 30); delete d.tardiosATT; }],
    [/pagoActualATT/, function (d) { adic(d, 0); delete d.pagoActualATT; }],
    [/plazo/, function (d) { d.pedido.precioEquipo = 4000; d.pedido.plazo = 18; }]
  ];
  casos.forEach(function (c) { var d = referencia(); c[1](d); assert.throws(function () { evalRef(d); }, c[0], String(c[0])); });
});

console.log('Auditoría por muestreo de todo el espacio de respuestas');
var rnd = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(2026);
function de(lista) { return lista[Math.floor(rnd() * lista.length)]; }
var ORDEN = {
  usoTarjetas: ['u30', 'u30_70', 'umas70'],
  antiguedadCredito: ['a_mas5', 'a3_5', 'a1_3', 'a_menos1'],
  hipoteca: [true, false],
  auto: [true, false],
  atraso: ['no', 'menos1', 'mas1'],
  peorAtraso24: ['ninguno', 'd1_29', 'd30_89', 'd90'],
  quitas: ['no', 'liquidada', 'pendiente'],
  adeudoOtra: ['no', 'nosabe', 'si'],
  adeudoATT: ['no', 'nosabe'],
  solicitudes6m: ['ninguna', 's1_2', 's3mas'],
  solicitudRechazada: [false, true],
  planActual: ['pospago_12', 'pospago_menos12', 'prepago'],
  tardiosATT: ['ninguno', 'uno', 'dos'],
  tarjeta: ['ambas', 'banco', 'departamental']
};
var HIST = ['usoTarjetas', 'antiguedadCredito', 'hipoteca', 'auto', 'atraso', 'peorAtraso24', 'quitas', 'adeudoOtra', 'adeudoATT', 'solicitudes6m', 'solicitudRechazada', 'tarjeta'];
var INGRESOS = [null, 6500, 10000, 16000, 27500, 45000];
function pedidoAzar() {
  var bi = Math.floor(rnd() * cfg.bandas.length); var b = cfg.bandas[bi];
  var precio = bi === 0 ? 0 : Math.round(b.min + rnd() * (Math.min(b.max, 30000) - b.min));
  return { plan: de(b.planes), precioEquipo: precio, plazo: de(cfg.plazos), enganche: rnd() < 0.2 ? Math.round(rnd() * 3000) : 0 };
}
function perfilAzar() {
  var d = referencia();
  var t = de(['nueva', 'portabilidad', 'renovacion', 'adicional']);
  if (t === 'renovacion') renov(d, de([3, 9, 18, 30]));
  else if (t === 'adicional') adic(d, de([0, 400, 900, 1800, 3000]));
  else { d.tramite = t; d.adeudoATT = de(['no', 'nosabe']); d.planActual = de(ORDEN.planActual); }
  if (d.tardiosATT) d.tardiosATT = de(ORDEN.tardiosATT);
  d.tarjeta = de(['ambas', 'banco', 'departamental', 'ninguna']);
  if (d.tarjeta === 'ninguna') delete d.usoTarjetas; else d.usoTarjetas = de(ORDEN.usoTarjetas);
  d.hipoteca = rnd() < 0.2; d.auto = rnd() < 0.2;
  d.otrosCreditos = ['personal', 'tiendas', 'equipo'].filter(function () { return rnd() < 0.25; });
  d.pagosOtrosCreditos = d.otrosCreditos.length ? Math.round(rnd() * 4000) : 0;
  d.antiguedadCredito = de(ORDEN.antiguedadCredito);
  d.atraso = de(ORDEN.atraso); d.peorAtraso24 = de(ORDEN.peorAtraso24); d.quitas = de(ORDEN.quitas);
  d.adeudoOtra = de(ORDEN.adeudoOtra);
  d.solicitudes6m = de(ORDEN.solicitudes6m); d.solicitudRechazada = d.solicitudes6m === 'ninguna' ? undefined : rnd() < 0.4;
  if (d.solicitudRechazada === undefined) delete d.solicitudRechazada;
  d.ingreso = de(INGRESOS);
  d.pedido = pedidoAzar();
  return d;
}
function ev(d) { return motor.evaluar(d, { hoy: HOY }); }
function historialStatus(d) { var r = ev(d); return r.historial.sinHistorial; }
var muestras = 0, comparaciones = 0;
ok('peor respuesta nunca sube la probabilidad ni el historial; resultados coherentes', function () {
  for (var i = 0; i < 12000; i++) {
    var d = perfilAzar();
    var r = ev(d);
    muestras++;
    assert.ok(r.p > 0 && r.p < 1 && isFinite(r.p));
    assert.strictEqual(r.score, Math.round(r.p * 100));
    var esp = r.p >= cfg.decision.perfilA ? 'A' : r.p >= cfg.decision.perfilB ? 'B' : r.alterna ? 'C' : 'D';
    assert.strictEqual(r.perfil, esp);
    if (r.alterna) {
      assert.ok(r.p < cfg.decision.umbralAlterna && r.alterna.p >= cfg.decision.umbralAlterna);
      assert.ok(r.alterna.mensualidadEvaluada < r.solicitado.mensualidadEvaluada && r.alterna.banda <= r.solicitado.banda);
      if (r.alterna.tipo === 'plan') assert.ok(cfg.planes[r.alterna.plan] < cfg.planes[r.solicitado.plan]);
    }
    if (!r.historial.sinHistorial) {
      var hb = cfg.historial.bandas.filter(function (b) { return b.id === r.historial.banda; })[0];
      assert.ok(r.historial.score >= hb.min && r.historial.score <= hb.max && r.historial.min <= r.historial.score && r.historial.score <= r.historial.max);
    }
    Object.keys(ORDEN).forEach(function (k) {
      if (!(k in d)) return;
      if (k === 'usoTarjetas' && d.tarjeta === 'ninguna') return;
      if (k === 'solicitudRechazada' && d.solicitudes6m === 'ninguna') return;
      var idx = ORDEN[k].indexOf(d[k]);
      if (idx < 0 || idx === ORDEN[k].length - 1) return;
      var peor = clonar(d); peor[k] = ORDEN[k][idx + 1];
      if (k === 'solicitudes6m' && peor.solicitudRechazada === undefined) peor.solicitudRechazada = false;
      if (historialStatus(peor) !== r.historial.sinHistorial) return; // cambia de "con" a "sin" historial: no es comparable
      var rp = ev(peor);
      comparaciones++;
      assert.ok(rp.p <= r.p + EPS, 'probabilidad ' + k + ': ' + d[k] + ' → ' + peor[k]);
      if (HIST.indexOf(k) >= 0 && !r.historial.sinHistorial) assert.ok(rp.historial.score <= r.historial.score, 'historial ' + k);
    });
    if (d.ingreso !== null) {
      var ii = INGRESOS.indexOf(d.ingreso);
      if (ii < INGRESOS.length - 1) { var mas = clonar(d); mas.ingreso = INGRESOS[ii + 1]; comparaciones++; assert.ok(ev(mas).p >= r.p - EPS, 'ingreso'); }
      var deuda = clonar(d); deuda.pagosOtrosCreditos += 500; comparaciones++; assert.ok(ev(deuda).p <= r.p + EPS, 'pagos de otros créditos');
    }
    if (d.tramite === 'adicional') { var pa = clonar(d); pa.pagoActualATT += 300; comparaciones++; assert.ok(ev(pa).p < r.p, 'pago actual AT&T'); }
  }
});
ok('mayor mensualidad siempre baja la probabilidad (estricto)', function () {
  for (var i = 0; i < 300; i++) {
    var d = perfilAzar(); d.pedido = { plan: 'Plata', precioEquipo: 0, plazo: 36, enganche: 0 };
    var prev = 2;
    [0, 2000, 4500, 9000, 13000, 14999].forEach(function (precio) {
      d.pedido.precioEquipo = precio; var p = ev(d).p; comparaciones++; assert.ok(p < prev); prev = p;
    });
  }
});
ok('plazo más largo y enganche nunca bajan la probabilidad', function () {
  var d = referencia(); var prev = -1;
  [24, 30, 36].forEach(function (pl) { d.pedido = { plan: 'Oro', precioEquipo: 9000, plazo: pl, enganche: 0 }; var p = ev(d).p; assert.ok(p > prev); prev = p; });
  prev = -1;
  [0, 1000, 3000, 6000].forEach(function (e) { d.pedido = { plan: 'Oro', precioEquipo: 9000, plazo: 36, enganche: e }; var p = ev(d).p; assert.ok(p >= prev); prev = p; });
});
ok('alterna nunca sube de plan, aunque en un plan mayor el equipo salga más barato', function () {
  var precios = { 'Azul 3': 14000, 'Plata': 14000, 'Oro': 10500, 'Black': 10100 };
  var d = referencia(); d.pedido = { plan: 'Plata', precioEquipo: 14000, plazo: 36, enganche: 0, preciosPorPlan: precios };
  var pPlata = ev(d).p;
  var dOro = referencia(); dOro.pedido = { plan: 'Oro', precioEquipo: 10500, plazo: 36, enganche: 0 };
  var pOro = ev(dOro).p;
  assert.ok(pOro > pPlata);
  var r = M.crear(cfgCon(function (c) { c.decision.umbralAlterna = (pPlata + pOro) / 2; })).evaluar(d, { hoy: HOY });
  assert.ok(r.alterna && CFG.planes[r.alterna.plan] < CFG.planes.Plata, 'recomendó ' + (r.alterna && r.alterna.plan));
});
ok('efectos: signo correcto y orden por magnitud', function () {
  var d = referencia(); d.tarjeta = 'departamental'; d.hipoteca = true; d.solicitudes6m = 's3mas'; d.solicitudRechazada = true;
  d.pedido = { plan: 'Oro', precioEquipo: 7500, plazo: 36, enganche: 0 };
  var r = ev(d); var e = {}; r.efectos.forEach(function (x) { e[x.variable] = x.efecto; });
  assert.ok(e.tarjeta_departamental < 0 && e.solicitud_rechazada < 0 && e.hipoteca_si > 0);
  for (var i = 1; i < r.efectos.length; i++) assert.ok(Math.abs(r.efectos[i - 1].efecto) >= Math.abs(r.efectos[i].efecto));
});
ok('determinista', function () { var d = perfilAzar(); assert.deepStrictEqual(ev(d), ev(clonar(d))); });
ok('bitácora y filas de calibración', function () {
  var d = referencia(); d.ingreso = 16000; d.pedido = { plan: 'Black', precioEquipo: 12500, plazo: 30, enganche: 0 };
  var r = ev(d); var b = motor.paraBitacora(r, '2026-11-14');
  assert.strictEqual(b.versionConfig, CFG.version); assert.deepStrictEqual(b.x, r.solicitado.x);
  cerca(S(Object.keys(b.x).reduce(function (s, k) { return s + motor.betas[k] * b.x[k]; }, 0)), r.p, 1e-12);
  var a = motor.filasCalibracion(d, d.pedido, 'aprobado', { hoy: HOY }); assert.deepStrictEqual(a, [{ x: r.solicitado.x, y: 1 }]);
  var c = motor.filasCalibracion(d, d.pedido, { contraoferta: { plan: 'Azul 3', precioEquipo: 12500, plazo: 36, enganche: 0 } }, { hoy: HOY });
  assert.strictEqual(c.length, 2); assert.strictEqual(c[0].y, 0); assert.strictEqual(c[1].y, 1);
  var bloq = clonar(d); bloq.adeudoATT = 'si'; assert.deepStrictEqual(motor.filasCalibracion(bloq, d.pedido, 'rechazado', { hoy: HOY }), []);
  assert.throws(function () { motor.filasCalibracion(d, d.pedido, 'quizas', { hoy: HOY }); }, /Respuesta/);
});
ok('decisión: D = baja; bloqueo = no procede', function () {
  var d = referencia(); d.atraso = 'mas1'; d.peorAtraso24 = 'd90'; d.pedido = { plan: 'Azul 3', precioEquipo: 4000, plazo: 24, enganche: 0 };
  var r = ev(d); assert.strictEqual(r.perfil, 'D'); assert.strictEqual(r.decision, 'Baja');
});

console.log('\n' + pruebas + ' pruebas OK · ' + muestras + ' perfiles auditados · ' + comparaciones + ' comparaciones de monotonía');
