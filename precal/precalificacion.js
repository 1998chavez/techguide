/*
 * Motor de precalificación crediticia · Prime MX · v2
 * Sin dependencias. Navegador: window.PrecalMotor · Node: require('./precalificacion.js')
 *
 *   var motor = PrecalMotor.crear(config);
 *   var r = motor.evaluar(datos, { hoy: new Date() });
 *
 * Modelo: logit(p) = Σ β·x. Los β se derivan de config (porcentajes de aprobación
 * del perfil de referencia), así que la config se edita en %, no en log-odds.
 * El historial estimado proyecta solo los factores de tipo buró a la escala de Mi Score.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.PrecalMotor = api; }
})(typeof self !== 'undefined' ? self : this,
/* @factory-start */
function () {
  'use strict';

  var VERSION_MOTOR = '2.1.0';

  var TRAMITES = ['nueva', 'portabilidad', 'renovacion', 'adicional'];
  var MAPAS = {
    tarjeta: { banco: null, ambas: 'tarjeta_ambas', departamental: 'tarjeta_departamental', ninguna: 'tarjeta_ninguna' },
    usoTarjetas: { u30: null, u30_70: 'uso_30_70', umas70: 'uso_mas70' },
    antiguedadCredito: { a_menos1: 'antig_menos1', a1_3: null, a3_5: 'antig_3_5', a_mas5: 'antig_mas5' },
    atraso: { no: null, menos1: 'atraso_menos1', mas1: 'atraso_mas1' },
    peorAtraso24: { ninguno: null, d1_29: 'peor24_1_29', d30_89: 'peor24_30_89', d90: 'peor24_90' },
    quitas: { no: null, liquidada: 'quita_liquidada', pendiente: 'quita_pendiente' },
    adeudoOtra: { no: null, si: 'otra_si', nosabe: 'otra_nosabe' },
    adeudoATT: { no: null, si: null, nosabe: 'adeudo_att_nosabe' },
    solicitudes6m: { ninguna: null, s1_2: 'solicitudes_1_2', s3mas: 'solicitudes_3mas' },
    planActual: { prepago: null, pospago_menos12: 'plan_pospago_menos12', pospago_12: 'plan_pospago_12' },
    tardiosATT: { ninguno: null, uno: 'att_tardio_uno', dos: 'att_tardio_dos' }
  };
  var OTROS = { personal: 'otro_personal', tiendas: 'otro_tiendas', equipo: 'otro_equipo' };
  var RANGO_ATRASO = { no: 0, menos1: 1, mas1: 2 };
  var RANGO_PEOR = { ninguno: 0, d1_29: 1, d30_89: 2, d90: 3 };
  var PEOR_MINIMO = ['ninguno', 'd1_29', 'd30_89'];
  var ANTIG_MIN_ANIOS = { a_menos1: 0, a1_3: 1, a3_5: 3, a_mas5: 5 };

  var FACTORES = [
    'tarjeta_ambas', 'tarjeta_departamental', 'tarjeta_ninguna', 'sin_historial', 'hipoteca_si', 'auto_si',
    'otro_personal', 'otro_tiendas', 'otro_equipo', 'antig_menos1', 'antig_3_5', 'antig_mas5',
    'uso_30_70', 'uso_mas70', 'atraso_menos1', 'atraso_mas1', 'peor24_1_29', 'peor24_30_89', 'peor24_90',
    'quita_liquidada', 'quita_pendiente', 'adeudo_att_nosabe', 'otra_si', 'otra_nosabe',
    'solicitudes_1_2', 'solicitudes_3mas', 'solicitud_rechazada', 'plan_pospago_menos12', 'plan_pospago_12'
  ];
  // Factores de tipo buró: forman el historial estimado y se amortiguan en renovación.
  var HISTORIAL = FACTORES.filter(function (k) { return k.indexOf('plan_') !== 0; });

  var ETIQUETAS = {
    tarjeta_ambas: 'Tarjeta bancaria y departamental',
    tarjeta_departamental: 'Solo tarjeta departamental o de tienda',
    tarjeta_ninguna: 'Sin tarjeta de crédito',
    sin_historial: 'Sin historial crediticio',
    hipoteca_si: 'Crédito hipotecario',
    auto_si: 'Crédito automotriz reciente',
    otro_personal: 'Crédito personal o de nómina',
    otro_tiendas: 'Crédito en tiendas',
    otro_equipo: 'Financiamiento de equipo',
    antig_menos1: 'Historial menor a 1 año',
    antig_3_5: 'Historial de 3 a 5 años',
    antig_mas5: 'Historial mayor a 5 años',
    uso_30_70: 'Uso de tarjetas entre 30% y 70%',
    uso_mas70: 'Tarjeta cerca del límite',
    atraso_menos1: 'Pago atrasado menos de 1 mes',
    atraso_mas1: 'Pago atrasado 1 mes o más',
    peor24_1_29: 'Atraso menor a 1 mes en 2 años',
    peor24_30_89: 'Atraso de 1 a 3 meses en 2 años',
    peor24_90: 'Atraso mayor a 3 meses en 2 años',
    quita_liquidada: 'Crédito liquidado con quita o en cobranza',
    quita_pendiente: 'Crédito en cobranza sin liquidar',
    adeudo_att_nosabe: 'Adeudo con AT&T sin confirmar',
    otra_si: 'Adeudo con otra compañía de telefonía o TV',
    otra_nosabe: 'Adeudo con otra compañía sin confirmar',
    solicitudes_1_2: 'Solicitud de crédito en 6 meses',
    solicitudes_3mas: '3 o más solicitudes de crédito en 6 meses',
    solicitud_rechazada: 'Crédito negado en 6 meses',
    plan_pospago_menos12: 'Plan pospago actual menor a 12 meses',
    plan_pospago_12: 'Plan pospago actual de 12 meses o más',
    att_tardio_uno: '1 pago tardío en AT&T en el año',
    att_tardio_dos: '2 o más pagos tardíos en AT&T en el año'
  };

  function logit(p) { return Math.log(p / (1 - p)); }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function esNumero(v) { return typeof v === 'number' && isFinite(v); }
  function esProb(v) { return esNumero(v) && v > 0 && v < 1; }
  function dinero(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

  /* ---------- Configuración ---------- */

  function validarConfig(cfg) {
    var e = [];
    ['nueva', 'renovacion', 'adicional'].forEach(function (k) {
      if (!esProb(cfg.referencia && cfg.referencia[k])) e.push('referencia.' + k + ' debe estar entre 0 y 1');
    });
    FACTORES.forEach(function (k) {
      if (!esProb(cfg.factores && cfg.factores[k])) e.push('factores.' + k + ' debe estar entre 0 y 1');
    });
    ['tardio_uno', 'tardio_dos'].forEach(function (k) {
      if (!esProb(cfg.cuentaATT && cfg.cuentaATT[k])) e.push('cuentaATT.' + k + ' debe estar entre 0 y 1');
    });
    if (!(cfg.monto && cfg.monto.referencia > 0)) e.push('monto.referencia debe ser > 0');
    if (!esProb(cfg.monto && cfg.monto.sinIngreso_aprobacionAlDoble)) e.push('monto.sinIngreso_aprobacionAlDoble inválido');
    if (!esProb(cfg.monto && cfg.monto.conIngreso_aprobacionAlDoble)) e.push('monto.conIngreso_aprobacionAlDoble inválido');
    if (cfg.monto && cfg.referencia && cfg.monto.sinIngreso_aprobacionAlDoble >= cfg.referencia.nueva) e.push('monto.sinIngreso_aprobacionAlDoble debe ser menor que referencia.nueva');
    if (cfg.monto && cfg.referencia && cfg.monto.conIngreso_aprobacionAlDoble >= cfg.referencia.nueva) e.push('monto.conIngreso_aprobacionAlDoble debe ser menor que referencia.nueva');
    var c = cfg.capacidad || {};
    if (!(c.cargaLibre >= 0 && c.cargaReferencia > c.cargaLibre)) e.push('capacidad: cargaReferencia debe ser mayor que cargaLibre');
    if (!esProb(c.aprobacionConCarga) || (cfg.referencia && c.aprobacionConCarga >= cfg.referencia.nueva)) e.push('capacidad.aprobacionConCarga debe ser menor que referencia.nueva');
    var r = cfg.renovacion || {};
    if (!(r.antiguedadMinimaMeses > 0)) e.push('renovacion.antiguedadMinimaMeses debe ser > 0');
    if (!(r.amortiguador >= 0 && r.amortiguador <= 1)) e.push('renovacion.amortiguador debe estar entre 0 y 1');
    var d = cfg.decision || {};
    if (!(esProb(d.perfilA) && esProb(d.perfilB) && esProb(d.umbralAlterna) && d.perfilA > d.perfilB)) e.push('decision: perfilA > perfilB, todos entre 0 y 1');
    var h = cfg.historial || {};
    if (!(h.minimo < h.scoreReferencia && h.scoreReferencia < h.maximo && h.puntosPorDuplicar > 0)) e.push('historial: minimo < scoreReferencia < maximo y puntosPorDuplicar > 0');
    if (!(h.bandas && h.bandas.length && h.bandas[0].min === h.minimo && h.bandas[h.bandas.length - 1].max === h.maximo)) e.push('historial.bandas deben cubrir de minimo a maximo');
    for (var i = 1; h.bandas && i < h.bandas.length; i++) {
      if (h.bandas[i].min !== h.bandas[i - 1].max + 1) e.push('historial.bandas deben ser contiguas');
    }
    if (!(cfg.plazos && cfg.plazos.length)) e.push('plazos vacío');
    if (!cfg.planes) e.push('planes vacío');
    (cfg.bandas || []).forEach(function (b) {
      (b.planes || []).forEach(function (p) {
        if (!(cfg.planes && esNumero(cfg.planes[p]))) e.push('banda ' + b.id + ': plan sin renta: ' + p);
      });
    });
    if (!(cfg.bandas && cfg.bandas.length && cfg.bandas[0].precioRef === 0)) e.push('bandas[0] debe ser "Sin equipo" (precioRef 0)');
    for (var j = 1; cfg.bandas && j < cfg.bandas.length; j++) {
      if (!(cfg.bandas[j].precioRef > cfg.bandas[j - 1].precioRef)) e.push('bandas deben ir de menor a mayor precio');
    }
    return e;
  }

  function derivarBetas(cfg) {
    var L = logit(cfg.referencia.nueva);
    var LR = logit(cfg.referencia.renovacion);
    var ln2 = Math.log(2);
    var b = {
      base_nueva: L,
      base_renovacion: LR,
      base_adicional: logit(cfg.referencia.adicional),
      ln_monto_sin_ingreso: (logit(cfg.monto.sinIngreso_aprobacionAlDoble) - L) / ln2,
      ln_monto_con_ingreso: (logit(cfg.monto.conIngreso_aprobacionAlDoble) - L) / ln2,
      exceso_carga: (logit(cfg.capacidad.aprobacionConCarga) - L) / (cfg.capacidad.cargaReferencia - cfg.capacidad.cargaLibre),
      att_tardio_uno: logit(cfg.cuentaATT.tardio_uno) - LR,
      att_tardio_dos: logit(cfg.cuentaATT.tardio_dos) - LR
    };
    FACTORES.forEach(function (k) { b[k] = logit(cfg.factores[k]) - L; });
    return b;
  }

  /* ---------- CURP e INE ---------- */

  var CURP_DICC = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  var CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}(\d{2})(\d{2})(\d{2})([HMX])(AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}([0-9A-Z])(\d)$/;

  function digitoCURP(c17) {
    var suma = 0;
    for (var i = 0; i < 17; i++) {
      var v = CURP_DICC.indexOf(c17.charAt(i));
      if (v < 0) return -1;
      suma += v * (18 - i);
    }
    return (10 - (suma % 10)) % 10;
  }

  function fechaISO(y, m, d) {
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function edadEn(isoNac, hoy) {
    var p = isoNac.split('-');
    var y = +p[0], m = +p[1], d = +p[2];
    var e = hoy.getFullYear() - y;
    var mh = hoy.getMonth() + 1, dh = hoy.getDate();
    if (mh < m || (mh === m && dh < d)) e -= 1;
    return e;
  }

  function validarCURP(curp, hoy) {
    var c = String(curp || '').trim().toUpperCase();
    var m = CURP_RE.exec(c);
    if (!m) return { valida: false, motivo: 'Formato inválido' };
    var yy = +m[1], mm = +m[2], dd = +m[3];
    var siglo = /\d/.test(m[6]) ? 1900 : 2000;
    var y = siglo + yy;
    var f = new Date(Date.UTC(y, mm - 1, dd));
    if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mm - 1 || f.getUTCDate() !== dd) {
      return { valida: false, motivo: 'Fecha de nacimiento inválida' };
    }
    if (digitoCURP(c.slice(0, 17)) !== +m[7]) return { valida: false, motivo: 'Dígito verificador incorrecto' };
    var iso = fechaISO(y, mm, dd);
    return { valida: true, fechaNacimiento: iso, edad: edadEn(iso, hoy), sexo: m[4] };
  }

  /* ---------- Mensualidad y bandas ---------- */

  function bandaDePrecio(cfg, precio) {
    for (var i = 0; i < cfg.bandas.length; i++) {
      var b = cfg.bandas[i];
      if (precio === 0 && b.precioRef === 0) return i;
      if (precio > 0 && b.precioRef > 0 && precio >= b.min && precio <= b.max) return i;
    }
    return -1;
  }

  function mensualidad(cfg, plan, precio, plazo, enganche) {
    var renta = cfg.planes[plan];
    var financiado = Math.max(0, (precio || 0) - (enganche || 0));
    return renta + (financiado > 0 ? financiado / plazo : 0);
  }

  /* ---------- Datos ---------- */

  function conCuentaATT(d) { return d.tramite === 'renovacion' || d.tramite === 'adicional'; }
  function esNuevaPorta(d) { return d.tramite === 'nueva' || d.tramite === 'portabilidad'; }

  function tieneHistorial(d) {
    return d.tarjeta !== 'ninguna' || d.hipoteca || d.auto || (d.otrosCreditos || []).length > 0 ||
      conCuentaATT(d) || (esNuevaPorta(d) && d.planActual !== 'prepago');
  }

  function validarDatos(cfg, d) {
    var e = [];
    function enum_(campo) { if (!(d[campo] in MAPAS[campo])) e.push(campo + ' inválido'); }
    if (TRAMITES.indexOf(d.tramite) < 0) e.push('tramite inválido');
    if (d.tramite === 'renovacion' && !(esNumero(d.antiguedadMeses) && d.antiguedadMeses >= 0)) e.push('antiguedadMeses requerido en renovación');
    if (conCuentaATT(d)) {
      if (typeof d.alCorrienteATT !== 'boolean') e.push('alCorrienteATT requerido en renovación y adicional');
      enum_('tardiosATT');
    }
    if (d.tramite === 'adicional' && !(esNumero(d.pagoActualATT) && d.pagoActualATT >= 0)) e.push('pagoActualATT requerido en línea adicional');
    if (esNuevaPorta(d)) { enum_('adeudoATT'); enum_('planActual'); }
    enum_('tarjeta');
    if (d.tarjeta !== 'ninguna') enum_('usoTarjetas');
    if (typeof d.hipoteca !== 'boolean') e.push('hipoteca debe ser sí/no');
    if (typeof d.auto !== 'boolean') e.push('auto debe ser sí/no');
    if (!Array.isArray(d.otrosCreditos)) e.push('otrosCreditos debe ser una lista');
    else {
      d.otrosCreditos.forEach(function (o) { if (!(o in OTROS)) e.push('otrosCreditos inválido: ' + o); });
      if (d.otrosCreditos.length !== d.otrosCreditos.filter(function (o, i, a) { return a.indexOf(o) === i; }).length) e.push('otrosCreditos repetidos');
    }
    if (!(esNumero(d.pagosOtrosCreditos) && d.pagosOtrosCreditos >= 0)) e.push('pagosOtrosCreditos debe ser ≥ 0');
    if (d.antiguedadCredito !== undefined) enum_('antiguedadCredito'); // opcional: sin dato no suma ni resta
    enum_('atraso');
    enum_('peorAtraso24');
    enum_('quitas');
    enum_('adeudoOtra');
    enum_('solicitudes6m');
    if (d.solicitudes6m in MAPAS.solicitudes6m && d.solicitudes6m !== 'ninguna' && typeof d.solicitudRechazada !== 'boolean') e.push('solicitudRechazada requerido si hubo solicitudes');
    if (!(d.ingreso === null || (esNumero(d.ingreso) && d.ingreso > 0))) e.push('ingreso debe ser > 0 o null');
    if (typeof d.comprobante !== 'boolean') e.push('comprobante debe ser sí/no');
    if (!d.identidad || typeof d.identidad.consentimiento !== 'boolean') e.push('identidad.consentimiento requerido');
    var p = d.pedido || {};
    if (!(p.plan in cfg.planes)) e.push('plan inválido');
    if (!(esNumero(p.precioEquipo) && p.precioEquipo >= 0)) e.push('precioEquipo inválido');
    if (!(esNumero(p.enganche) && p.enganche >= 0)) e.push('enganche inválido');
    if (p.precioEquipo > 0 && cfg.plazos.indexOf(p.plazo) < 0) e.push('plazo inválido');
    if (esNumero(p.precioEquipo)) {
      var bi = bandaDePrecio(cfg, p.precioEquipo);
      if (bi < 0) e.push('precio fuera de las bandas');
      else if (cfg.bandas[bi].planes.indexOf(p.plan) < 0) e.push('El plan ' + p.plan + ' no está disponible para ' + cfg.bandas[bi].etiqueta);
    }
    return e;
  }

  // Normaliza sin alterar los datos originales: el peor atraso de 24 meses nunca es menor que el atraso actual.
  function normalizar(d) {
    var n = JSON.parse(JSON.stringify(d));
    var ajustes = [];
    var minimo = PEOR_MINIMO[RANGO_ATRASO[n.atraso]];
    if (RANGO_PEOR[n.peorAtraso24] < RANGO_PEOR[minimo]) {
      n.peorAtraso24 = minimo;
      ajustes.push({ codigo: 'PEOR_ATRASO_AJUSTADO', tipo: 'revisar', texto: 'Atraso de los últimos 2 años ajustado al atraso actual' });
    }
    if (n.tarjeta === 'ninguna') delete n.usoTarjetas;
    if (n.solicitudes6m === 'ninguna') n.solicitudRechazada = false;
    return { datos: n, ajustes: ajustes };
  }

  /* ---------- Modelo ---------- */

  function grupoDe(cfg, d) {
    if (d.tramite === 'renovacion') {
      return d.antiguedadMeses >= cfg.renovacion.antiguedadMinimaMeses ? 'renovacion' : 'nueva';
    }
    if (d.tramite === 'adicional') return 'adicional';
    return 'nueva';
  }

  function bloqueos(cfg, d, hoy) {
    var out = [];
    var id = d.identidad || {};
    if (!id.consentimiento) out.push({ codigo: 'SIN_CONSENTIMIENTO', texto: 'Sin autorización del cliente' });
    if (esNumero(id.ineVigencia) && id.ineVigencia < hoy.getFullYear()) out.push({ codigo: 'INE_VENCIDA', texto: 'INE vencida (' + id.ineVigencia + ')' });
    if (id.curp) {
      var v = validarCURP(id.curp, hoy);
      if (!v.valida) out.push({ codigo: 'CURP_INVALIDA', texto: 'CURP inválida: ' + v.motivo.toLowerCase() });
      else {
        if (v.edad < 18) out.push({ codigo: 'MENOR_DE_EDAD', texto: 'Cliente menor de edad' });
        if (id.fechaNacimientoINE && id.fechaNacimientoINE !== v.fechaNacimiento) out.push({ codigo: 'CURP_NO_COINCIDE', texto: 'La fecha de nacimiento de la CURP no coincide con la INE' });
      }
    }
    if (esNuevaPorta(d) && d.adeudoATT === 'si') out.push({ codigo: 'ADEUDO_ATT', texto: 'Adeudo vigente con AT&T' });
    if (conCuentaATT(d) && d.alCorrienteATT === false) out.push({ codigo: 'NO_AL_CORRIENTE', texto: 'Cuenta AT&T con saldo vencido' });
    return out;
  }

  function revisarCongruencia(cfg, d, hoy) {
    var out = [];
    var id = d.identidad || {};
    var v = id.curp ? validarCURP(id.curp, hoy) : null;
    var edad = v && v.valida ? v.edad : null;
    if (edad !== null && tieneHistorial(d) && d.antiguedadCredito in ANTIG_MIN_ANIOS && edad - 18 < ANTIG_MIN_ANIOS[d.antiguedadCredito]) {
      out.push({ codigo: 'ANTIGUEDAD_EDAD', tipo: 'revisar', texto: 'Antigüedad crediticia mayor a la posible por la edad' });
    }
    if (edad !== null && d.hipoteca && edad < 21) out.push({ codigo: 'HIPOTECA_EDAD', tipo: 'revisar', texto: 'Crédito hipotecario con edad menor a 21 años' });
    if (!tieneHistorial(d) && (d.atraso !== 'no' || d.peorAtraso24 !== 'ninguno' || d.quitas !== 'no')) {
      out.push({ codigo: 'ATRASOS_SIN_CREDITOS', tipo: 'revisar', texto: 'Atrasos o quitas sin créditos declarados' });
    }
    if (d.quitas === 'pendiente' && d.atraso === 'no' && d.peorAtraso24 === 'ninguno') {
      out.push({ codigo: 'COBRANZA_SIN_ATRASO', tipo: 'revisar', texto: 'Crédito en cobranza sin atrasos declarados' });
    }
    return out;
  }

  // Factores de historial con peso completo (sin amortiguar).
  function variablesHistorial(d) {
    var x = {};
    function marca(k) { if (k) x[k] = 1; }
    if (!tieneHistorial(d)) {
      marca('sin_historial');
    } else {
      marca(MAPAS.tarjeta[d.tarjeta]);
      if (d.tarjeta !== 'ninguna') marca(MAPAS.usoTarjetas[d.usoTarjetas]);
      marca(MAPAS.antiguedadCredito[d.antiguedadCredito]);
    }
    if (d.hipoteca) marca('hipoteca_si');
    if (d.auto) marca('auto_si');
    (d.otrosCreditos || []).forEach(function (o) { marca(OTROS[o]); });
    marca(MAPAS.atraso[d.atraso]);
    marca(MAPAS.peorAtraso24[d.peorAtraso24]);
    marca(MAPAS.quitas[d.quitas]);
    marca(MAPAS.adeudoOtra[d.adeudoOtra]);
    if (esNuevaPorta(d)) marca(MAPAS.adeudoATT[d.adeudoATT]);
    marca(MAPAS.solicitudes6m[d.solicitudes6m]);
    if (d.solicitudes6m !== 'ninguna' && d.solicitudRechazada) marca('solicitud_rechazada');
    return x;
  }

  // Vector completo del cliente (sin monto). Es el que se guarda en la bitácora.
  function variablesCliente(cfg, d, grupo) {
    var x = {};
    x['base_' + grupo] = 1;
    var lam = grupo === 'renovacion' ? cfg.renovacion.amortiguador : 1;
    var h = variablesHistorial(d);
    Object.keys(h).forEach(function (k) { x[k] = h[k] * lam; });
    if (esNuevaPorta(d)) { var kp = MAPAS.planActual[d.planActual]; if (kp) x[kp] = 1; }
    if (conCuentaATT(d)) { var kt = MAPAS.tardiosATT[d.tardiosATT]; if (kt) x[kt] = 1; }
    return x;
  }

  function variablesMonto(cfg, d, mEval) {
    var x = {};
    var lm = Math.log(mEval / cfg.monto.referencia);
    if (d.ingreso) {
      x.ln_monto_con_ingreso = lm;
      var exc = Math.max(0, (mEval + d.pagosOtrosCreditos) / d.ingreso - cfg.capacidad.cargaLibre);
      if (exc > 0) x.exceso_carga = exc;
    } else {
      x.ln_monto_sin_ingreso = lm;
    }
    return x;
  }

  function eta(betas, x) {
    var z = 0;
    Object.keys(x).forEach(function (k) {
      if (!(k in betas)) throw new Error('Variable sin coeficiente: ' + k);
      z += betas[k] * x[k];
    });
    return z;
  }

  function unir(a, b) {
    var o = {};
    Object.keys(a).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b).forEach(function (k) { o[k] = b[k]; });
    return o;
  }

  function crear(cfg) {
    var errs = validarConfig(cfg);
    if (errs.length) throw new Error('Config inválida: ' + errs.join('; '));
    var betas = derivarBetas(cfg);
    var plazoMax = Math.max.apply(null, cfg.plazos);

    function combo(d, grupo, xc, plan, precio, plazo, enganche) {
      var m = mensualidad(cfg, plan, precio, plazo, enganche);
      var mEval = m + (grupo === 'adicional' ? d.pagoActualATT : 0);
      var x = unir(xc, variablesMonto(cfg, d, mEval));
      var z = eta(betas, x);
      return { plan: plan, precio: precio, plazo: precio > 0 ? plazo : null, enganche: enganche, mensualidad: m, mensualidadEvaluada: mEval, x: x, z: z, p: sigmoid(z) };
    }

    function efectos(c, d) {
      var lista = [];
      Object.keys(c.x).forEach(function (k) {
        if (k.indexOf('base_') === 0) return;
        var sin = sigmoid(c.z - betas[k] * c.x[k]);
        var ef = c.p - sin;
        var etiqueta = ETIQUETAS[k];
        if (k === 'ln_monto_con_ingreso' || k === 'ln_monto_sin_ingreso') etiqueta = 'Mensualidad de ' + dinero(c.mensualidadEvaluada);
        if (k === 'exceso_carga') etiqueta = 'Pagos mensuales: ' + Math.round((c.x[k] + cfg.capacidad.cargaLibre) * 100) + '% del ingreso';
        if (Math.abs(ef) >= 0.005) lista.push({ variable: k, etiqueta: etiqueta, efecto: ef, puntos: Math.round(ef * 100) });
      });
      lista.sort(function (a, b) { return Math.abs(b.efecto) - Math.abs(a.efecto); });
      return lista;
    }

    function precioEnBanda(d, bi, bReq, plan) {
      if (bi === bReq) {
        var pp = d.pedido.preciosPorPlan;
        return pp && esNumero(pp[plan]) ? pp[plan] : d.pedido.precioEquipo;
      }
      return cfg.bandas[bi].precioRef;
    }

    function buscarAlterna(d, grupo, xc, req, bReq) {
      var umbral = cfg.decision.umbralAlterna;
      if (req.p >= umbral) return null;
      var eng = d.pedido.enganche;
      if (req.precio > 0 && req.plazo < plazoMax) {
        var c0 = combo(d, grupo, xc, req.plan, req.precio, plazoMax, eng);
        if (c0.p >= umbral) { c0.tipo = 'plazo'; c0.banda = bReq; return c0; }
      }
      for (var bi = bReq; bi >= 0; bi--) {
        var planes = cfg.bandas[bi].planes.slice().sort(function (a, b) { return cfg.planes[b] - cfg.planes[a]; });
        for (var j = 0; j < planes.length; j++) {
          var plan = planes[j];
          if (bi === bReq && cfg.planes[plan] >= cfg.planes[req.plan]) continue;
          var precio = precioEnBanda(d, bi, bReq, plan);
          var c = combo(d, grupo, xc, plan, precio, plazoMax, bi === bReq ? eng : 0);
          if (c.p >= umbral) { c.tipo = bi === bReq ? 'plan' : 'equipo'; c.banda = bi; return c; }
        }
      }
      return null;
    }

    function tabla(d, grupo, xc, bReq) {
      var out = [];
      for (var bi = 0; bi < cfg.bandas.length; bi++) {
        var b = cfg.bandas[bi];
        for (var j = 0; j < b.planes.length; j++) {
          var plan = b.planes[j];
          var precio = precioEnBanda(d, bi, bReq, plan);
          var plazo = bi === bReq ? d.pedido.plazo : plazoMax;
          var c = combo(d, grupo, xc, plan, precio, plazo, bi === bReq ? d.pedido.enganche : 0);
          out.push({ banda: bi, bandaEtiqueta: b.etiqueta, plan: plan, mensualidad: c.mensualidad, p: c.p });
        }
      }
      return out;
    }

    function estimarHistorial(d, dudas) {
      var h = cfg.historial;
      if (!tieneHistorial(d)) return { sinHistorial: true, etiqueta: 'Sin historial crediticio', score: null, min: null, max: null, banda: null };
      var z = eta(betas, variablesHistorial(d));
      var s = h.scoreReferencia + (h.puntosPorDuplicar / Math.LN2) * z;
      s = Math.min(h.maximo, Math.max(h.minimo, s));
      var margen = h.margenBase + h.margenPorDuda * dudas;
      var sr = Math.round(s);
      var banda = h.bandas.filter(function (b) { return sr >= b.min && sr <= b.max; })[0];
      return {
        sinHistorial: false, score: sr,
        min: Math.max(h.minimo, Math.round(s - margen)), max: Math.min(h.maximo, Math.round(s + margen)),
        banda: banda.id, etiqueta: banda.etiqueta
      };
    }

    function calibracion() {
      var n = (cfg.calibracion && cfg.calibracion.resultados) || 0;
      return { resultados: n, nivel: n >= 300 ? 'alta' : n >= 100 ? 'media' : 'inicial' };
    }

    function evaluar(dOriginal, opciones) {
      var hoy = (opciones && opciones.hoy) || new Date();
      var errs = validarDatos(cfg, dOriginal);
      if (errs.length) throw new Error('Datos inválidos: ' + errs.join('; '));
      var norm = normalizar(dOriginal);
      var d = norm.datos;

      var grupo = grupoDe(cfg, d);
      var avisos = norm.ajustes.slice();
      if (d.tramite === 'renovacion' && grupo === 'nueva') avisos.push({ codigo: 'RENOV_COMO_NUEVA', tipo: 'regla', texto: 'Antigüedad menor a ' + cfg.renovacion.antiguedadMinimaMeses + ' meses: se evalúa como línea nueva' });
      if (esNuevaPorta(d) && d.adeudoATT === 'nosabe') avisos.push({ codigo: 'CONFIRMAR_ADEUDO_ATT', tipo: 'dato', texto: 'Confirmar adeudos con AT&T' });
      var idt = d.identidad;
      if (esNumero(idt.ineVigencia) && idt.ineVigencia === hoy.getFullYear()) avisos.push({ codigo: 'INE_POR_VENCER', tipo: 'dato', texto: 'La INE vence este año' });
      if (!esNumero(idt.ineVigencia)) avisos.push({ codigo: 'SIN_VIGENCIA_INE', tipo: 'dato', texto: 'Falta la vigencia de la INE' });
      if (!idt.curp) avisos.push({ codigo: 'SIN_CURP', tipo: 'dato', texto: 'Falta la CURP' });
      if (!d.comprobante) avisos.push({ codigo: 'SIN_COMPROBANTE', tipo: 'dato', texto: 'Sin comprobante de domicilio a su nombre' });
      if (!d.ingreso) avisos.push({ codigo: 'SIN_INGRESO', tipo: 'dato', texto: 'Ingreso no proporcionado' });
      var revisiones = revisarCongruencia(cfg, d, hoy);
      avisos = avisos.concat(revisiones);

      var dudas = (d.adeudoOtra === 'nosabe' ? 1 : 0) + (esNuevaPorta(d) && d.adeudoATT === 'nosabe' ? 1 : 0);
      var nRevisar = avisos.filter(function (a) { return a.tipo === 'revisar'; }).length;
      var puntosDuda = dudas + nRevisar;

      var bl = bloqueos(cfg, d, hoy);
      var xc = variablesCliente(cfg, d, grupo);
      var bReq = bandaDePrecio(cfg, d.pedido.precioEquipo);
      var req = combo(d, grupo, xc, d.pedido.plan, d.pedido.precioEquipo, d.pedido.plazo, d.pedido.enganche);
      req.banda = bReq;

      var base = {
        versionMotor: VERSION_MOTOR,
        versionConfig: cfg.version,
        grupo: grupo,
        avisos: avisos,
        bloqueos: bl,
        calibracion: calibracion(),
        confianzaRespuestas: { nivel: puntosDuda === 0 ? 'Alta' : puntosDuda <= 2 ? 'Media' : 'Baja', dudas: dudas, revisar: nRevisar },
        historial: estimarHistorial(d, puntosDuda),
        solicitado: req
      };

      if (bl.length) {
        base.perfil = 'D';
        base.decision = 'No procede';
        base.p = null;
        base.score = null;
        base.alterna = null;
        base.efectos = [];
        base.tabla = [];
        return base;
      }

      var alt = buscarAlterna(d, grupo, xc, req, bReq);
      var p = req.p;
      var perfil, decision;
      if (p >= cfg.decision.perfilA) { perfil = 'A'; decision = 'Alta'; }
      else if (p >= cfg.decision.perfilB) { perfil = 'B'; decision = 'Media'; }
      else if (alt) { perfil = 'C'; decision = 'Solo con alterna'; }
      else { perfil = 'D'; decision = 'Baja'; }

      base.p = p;
      base.score = Math.round(p * 100);
      base.perfil = perfil;
      base.decision = decision;
      base.alterna = alt;
      base.efectos = efectos(req, d);
      base.tabla = tabla(d, grupo, xc, bReq);
      return base;
    }

    function paraBitacora(r, fechaISOTexto) {
      return {
        fecha: fechaISOTexto,
        versionMotor: r.versionMotor,
        versionConfig: r.versionConfig,
        grupo: r.grupo,
        bloqueado: r.bloqueos.length > 0,
        x: r.solicitado.x,
        p: r.p,
        perfil: r.perfil,
        historial: r.historial.score,
        resultado: null
      };
    }

    // Filas para calibrar a partir del resultado real de AT&T.
    // envio: combinación ingresada a AT&T {plan, precioEquipo, plazo, enganche}
    // respuesta: 'aprobado' | 'rechazado' | { contraoferta: {plan, precioEquipo, plazo, enganche} }
    function filasCalibracion(dOriginal, envio, respuesta, opciones) {
      var hoy = (opciones && opciones.hoy) || new Date();
      var dd = JSON.parse(JSON.stringify(dOriginal));
      dd.pedido = { plan: envio.plan, precioEquipo: envio.precioEquipo, plazo: envio.plazo, enganche: envio.enganche || 0 };
      var errs = validarDatos(cfg, dd);
      if (errs.length) throw new Error('Datos inválidos: ' + errs.join('; '));
      dd = normalizar(dd).datos;
      if (bloqueos(cfg, dd, hoy).length) return [];
      var grupo = grupoDe(cfg, dd);
      var xc = variablesCliente(cfg, dd, grupo);
      var e = combo(dd, grupo, xc, envio.plan, envio.precioEquipo, envio.plazo, envio.enganche || 0);
      if (respuesta === 'aprobado') return [{ x: e.x, y: 1 }];
      if (respuesta === 'rechazado') return [{ x: e.x, y: 0 }];
      if (respuesta && respuesta.contraoferta) {
        var o = respuesta.contraoferta;
        var bo = bandaDePrecio(cfg, o.precioEquipo);
        if (bo < 0 || cfg.bandas[bo].planes.indexOf(o.plan) < 0) throw new Error('Contraoferta inválida');
        var c = combo(dd, grupo, xc, o.plan, o.precioEquipo, o.plazo, o.enganche || 0);
        return [{ x: e.x, y: 0 }, { x: c.x, y: 1 }];
      }
      throw new Error('Respuesta inválida');
    }

    return {
      version: VERSION_MOTOR,
      config: cfg,
      betas: betas,
      evaluar: evaluar,
      paraBitacora: paraBitacora,
      filasCalibracion: filasCalibracion,
      mensualidad: function (plan, precio, plazo, enganche) { return mensualidad(cfg, plan, precio, plazo, enganche); },
      bandaDePrecio: function (precio) { return bandaDePrecio(cfg, precio); },
      validarCURP: validarCURP
    };
  }

  return {
    version: VERSION_MOTOR,
    crear: crear,
    validarConfig: validarConfig,
    derivarBetas: derivarBetas,
    validarCURP: validarCURP,
    digitoCURP: digitoCURP,
    logit: logit,
    sigmoid: sigmoid,
    FACTORES: FACTORES,
    HISTORIAL: HISTORIAL
  };
}
/* @factory-end */
);
