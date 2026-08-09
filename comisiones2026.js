/* ══════════════════════════════════════════════════════════════════════════
   TechGuide · MOTOR DE COMISIONES 2026
   Fuente: "Esquema_Comisiones_Ejecutivos.pdf" y "Gerentes_PrimeMX.pdf"

   Motor puro: sin DOM, sin red, sin estado global. Recibe ventas y alcances,
   devuelve el desglose. Los cinco tableros lo consumen igual.

   Verificado contra los DOS ejemplos del PDF del ejecutivo y la tabla del
   gerente. Si algún día no cuadra, es que cambió el esquema, no el motor.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── TABLAS DE COMISIÓN ─────────────────────────────────────────────────── */

// Tabla 1 · Pospago CON EQUIPO y renovaciones con equipo
var COM_EQUIPO_2026 = {
  'Azul 1': 100, 'Azul 2': 180, 'Azul 3': 440, 'Plata': 530, 'Oro': 590,
  'Black': 670, 'Platino': 800, 'Diamante': 800, 'Titanio': 670,
  'Titanio Trade In': 335
};

// Tabla 2 · Pospago SOLO SERVICIO (equipo propio) — planes Premium
var COM_SERVICIO_2026 = {
  'Azul 1': 90, 'Azul 2': 110, 'Azul 3': 230, 'Plata': 265, 'Oro': 295,
  'Black': 335, 'Platino': 400, 'Diamante': 400, 'Titanio': 335
};

// Tabla 3 · Planes AT&T LITE (solo servicio)
var COM_LITE_2026 = {
  'Lite': 40, 'Lite 1': 95, 'Lite 2': 115, 'Lite 3': 220,
  'Lite 4': 265, 'Lite 5': 315, 'Ilimitado': 400
};

// Venta empresarial · A NEGOCIOS
var COM_NEGOCIOS_2026 = {
  equipo:   { 239:50, 299:87, 399:200, 499:419, 599:503, 699:587,
              799:671, 899:755, 999:839, 1299:1091, 1499:1259 },
  servicio: { 239:25, 299:44, 399:100, 499:210, 599:252, 699:294,
              799:336, 899:378, 999:420, 1299:546, 1499:630 }
};

// Seguros por precio del equipo
var SEGURO_2026 = [
  { min:500,   max:4000,  precio:99,  com:70  },
  { min:4001,  max:6000,  precio:159, com:112 },
  { min:6001,  max:13000, precio:219, com:153 },
  { min:13001, max:38000, precio:254, com:178 },
  { min:38001, max:60000, precio:279, com:195 }
];

// Bono de valor por unidad — SOLO pospago con equipo y renovaciones con equipo.
// El equipo propio (solo servicio) NO genera bono: verificado en el ejemplo 1,
// donde 5 Oro (4 nuevos + 1 propio) pagan $600 = 4 × $150, no 5 × $150.
var BONO_VALOR_2026 = {
  'Plata': 100, 'Oro': 150,
  'Black': 200, 'Platino': 200, 'Diamante': 200, 'Titanio': 200
};

// Tasas por categoría
var TASA_2026 = {
  accesorioAlphacomm: 0.10,   // ALPHACOMM 10% de su valor
  accesorioOtras:     0.02,   // otras marcas 2%
  prepago:            0.40,   // 40% de la recarga (mínimo $150)
  addon:              0.80,   // 80% de su valor
  recargaMinima:      150
};

// Escalones de acelerador
var ACEL_EJECUTIVO_2026 = [   // sobre la comisión base, pago mensual
  { min:105, max:109.999, pct:0.10 },
  { min:110, max:119.999, pct:0.15 },
  { min:120, max:Infinity, pct:0.20 }
];
var ACEL_GERENTE_2026 = [
  { min:100, max:109.999, pct:0.03 },
  { min:110, max:Infinity, pct:0.05 }
];

// [ago-2026] ARPU mínimo POR MÉTRICA. Renovación va en null por decisión de
// Diego: no lleva mínimo. Es condición de TIENDA, no del asesor — puede
// perder acelerador por lo que vendieron sus compañeros.
var ARPU_MIN_2026 = {
  equipo:     700,
  servicio:   400,
  renovacion: null,
  seguros:    null,
  accesorios: null,
  prepago:    null
};

var UMBRAL_2026 = {
  base:        80,    // por debajo, la métrica no paga nada
  bonoValor:  100,    // el bono de valor enciende al 100%
  acelEjec:   105,    // el acelerador del ejecutivo enciende al 105%
  acelGer:    100,    // el del gerente al 100%
  arpuServicio: 400,  // ARPU mínimo de tienda para incentivos/aceleradores
  arpuEquipo:   700,
  pisoVentas:     2,  // mínimo de ventas semanales para activar comisiones
  gerentePct:  0.35   // el gerente se lleva 35% de la base de su tienda
};

var GERENTE_PCT_2026 = UMBRAL_2026.gerentePct;

/* ── HELPERS ────────────────────────────────────────────────────────────── */

// El piso NO es "2 ventas cualesquiera": es 1 equipo + 1 renovación, o bien
// 2 equipos. Sin eso, NADA comisiona — ni seguros, ni accesorios, ni prepago.
// El gerente está exento (vende, pero no se le exige piso).
function pisoCumplido2026(ventas){
  var equipo=0, reno=0;
  for(var i=0;i<ventas.length;i++){
    var v=ventas[i], u=v.unidades||1;
    if(v.tipo==='equipo' || v.tipo==='pospago') equipo+=u;
    else if(v.tipo==='renovacion') reno+=u;
  }
  return (equipo>=2) || (equipo>=1 && reno>=1);
}

function seguroPorPrecio2026(precioEquipo){
  for(var i=0;i<SEGURO_2026.length;i++){
    var t=SEGURO_2026[i];
    if(precioEquipo>=t.min && precioEquipo<=t.max) return t;
  }
  return null;
}

function aceleradorPct2026(alcancePct, escala){
  var tabla = escala==='gerente' ? ACEL_GERENTE_2026 : ACEL_EJECUTIVO_2026;
  for(var i=0;i<tabla.length;i++){
    if(alcancePct>=tabla[i].min && alcancePct<=tabla[i].max) return tabla[i].pct;
  }
  return 0;
}

// Comisión unitaria al 100% según el tipo de venta.
function comisionUnitaria2026(v){
  switch(v.tipo){
    case 'equipo':           // línea nueva con equipo (antes 'pospago')
    case 'pospago':          // alias heredado
    case 'renovacion':       // renovación con equipo
      return COM_EQUIPO_2026[v.plan] || 0;
    case 'servicio':         // equipo propio / solo servicio
      return (COM_SERVICIO_2026[v.plan] !== undefined)
        ? COM_SERVICIO_2026[v.plan]
        : (COM_LITE_2026[v.plan] || 0);
    case 'negocios':
      return (COM_NEGOCIOS_2026[v.conEquipo?'equipo':'servicio'][v.renta]) || 0;
    case 'seguro': {
      var t = v.com !== undefined ? {com:v.com} : seguroPorPrecio2026(v.precioEquipo);
      return t ? t.com : 0;
    }
    case 'accesorio':
      return Math.round(v.valor * (v.alphacomm ? TASA_2026.accesorioAlphacomm
                                               : TASA_2026.accesorioOtras));
    case 'prepago':
      return v.recarga < TASA_2026.recargaMinima ? 0
        : Math.round(v.recarga * TASA_2026.prepago);
    case 'addon':
      return Math.round(v.valor * TASA_2026.addon);
    default:
      return 0;
  }
}

// ¿Esta venta genera bono de valor? Solo pospago con equipo y renovaciones
// con equipo, y solo si su métrica llegó al 100%.
function bonoUnitario2026(v){
  if(v.tipo!=='equipo' && v.tipo!=='pospago' && v.tipo!=='renovacion') return 0;
  return BONO_VALOR_2026[v.plan] || 0;
}

/* ── MOTOR DEL EJECUTIVO ────────────────────────────────────────────────── */
/*
   ventas: [{ tipo, plan, unidades, metrica, ... }]
   alcances: { metrica: pct }   ej. { pospago:110, renovacion:105, seguros:80 }
   opts: { totalVentasSemana, arpuEquipo, arpuServicio, alcancePospagoEquipo }

   Reglas implementadas:
   · <80% de alcance en su métrica → esa venta no paga nada
   · base = comisión unitaria × unidades × min(alcance,100%)  ← tope al 100%
   · bono de valor por unidad al llegar a 100% (solo pospago/renos con equipo)
   · acelerador sobre la base al llegar a 105%, pago mensual
   · candado: "servicio" solo comisiona si pospago con equipo ≥80%
   · piso de 2 ventas semanales, si no, nada comisiona
   · ARPU de tienda como llave de bono y acelerador
*/
function calcularEjecutivo2026(ventas, alcances, opts){
  opts = opts || {};
  var det=[], base=0, bono=0, acel=0;
  var avisos=[];

  // [ago-2026] El gerente también vende: sus ventas suman a la tienda y se le
  // pagan con las MISMAS reglas del ejecutivo, salvo el piso, del que está
  // exento. Se le llama con { exigePiso:false }.
  var exigePiso = opts.exigePiso !== false;
  var pisoOk = !exigePiso || pisoCumplido2026(ventas);
  if(!pisoOk) avisos.push('Piso semanal no cubierto (1 equipo + 1 reno, o 2 equipos): no comisiona nada');

  for(var i=0;i<ventas.length;i++){
    var v = ventas[i];
    var u = v.unidades || 1;
    var met = v.metrica || (v.tipo==='pospago' ? 'equipo' : v.tipo);
    var alc = alcances[met];
    if(alc === undefined) alc = 0;

    var fila = { venta:v, metrica:met, alcance:alc, unidades:u,
                 unitaria:comisionUnitaria2026(v), base:0, bono:0, acel:0, nota:'' };

    if(!pisoOk){ fila.nota='piso semanal no cubierto'; det.push(fila); continue; }

    // Candado: solo servicio comisiona si equipo llegó al 80%.
    if(v.tipo==='servicio'){
      var alcEq = (opts.alcanceEquipo !== undefined) ? opts.alcanceEquipo
                : (alcances.equipo !== undefined ? alcances.equipo : alcances.pospago || 0);
      if(alcEq < UMBRAL_2026.base){
        fila.nota='bloqueado: equipo < 80%'; det.push(fila); continue;
      }
    }
    if(alc < UMBRAL_2026.base){
      fila.nota='métrica por debajo del 80%'; det.push(fila); continue;
    }

    // Renovación anticipada: 6-12 meses paga 50%, ≤6 meses no paga ni cuenta.
    var factorReno = 1;
    if(v.tipo==='renovacion' && v.mesesVigencia !== undefined){
      if(v.mesesVigencia <= 6){ fila.nota='reno anticipada ≤6 meses: no paga'; det.push(fila); continue; }
      if(v.mesesVigencia <= 12){ factorReno = 0.5; fila.nota='reno anticipada 6-12 meses: 50%'; }
    }

    // Base: se topa al 100% aunque el alcance sea mayor.
    // [ago-2026] Diego confirmó REDONDEO por renglón (el PDF truncaba).
    var factorAlc = Math.min(alc, 100) / 100;
    fila.base = Math.round(fila.unitaria * u * factorAlc * factorReno);

    // ARPU: llave de tienda, por métrica. null = esa métrica no lleva mínimo.
    var minArpu = ARPU_MIN_2026[met];
    var arpuOk = true;
    if(minArpu !== null && minArpu !== undefined){
      var arpuVal = (opts.arpu && opts.arpu[met] !== undefined) ? opts.arpu[met] : undefined;
      if(arpuVal !== undefined && arpuVal < minArpu){
        arpuOk = false;
        fila.nota = 'ARPU $'+arpuVal+' < $'+minArpu+': sin bono ni acelerador';
      }
    }

    if(alc >= UMBRAL_2026.bonoValor && arpuOk){
      fila.bono = bonoUnitario2026(v) * u;
    }
    if(alc >= UMBRAL_2026.acelEjec && arpuOk){
      fila.acel = fila.base * aceleradorPct2026(alc, 'ejecutivo');
    }

    base += fila.base; bono += fila.bono; acel += fila.acel;
    det.push(fila);
  }

  return {
    detalle: det,
    comisionBase: base,
    bonoValor: bono,
    pagoSemanal: base + bono,
    aceleradorSemana: acel,   // se SUMA al monedero del mes, no se paga aún
    avisos: avisos
  };
}

/* ── MONEDERO ───────────────────────────────────────────────────────────── */
/*
   El acelerador NO se puede calcular al capturar una venta: depende del
   alcance de tienda al CIERRE de la semana y se computa sobre la comisión
   base de toda la métrica, no de una venta suelta. Por eso vive aparte.

   semanas: [{ inicio, fin, acelerador, puntosMarca }]
   Los meses tienen semanas recortadas (una puede ser de 3 días), así que cada
   semana carga su rango real de fechas en vez de un número S1..S4.
*/
function monedero2026(semanas){
  var tot=0, totPts=0, det=[];
  for(var i=0;i<semanas.length;i++){
    var s=semanas[i];
    var monto = s.acelerador || 0;
    var pts = s.puntosMarca || 0;
    tot += monto; totPts += pts;
    det.push({ inicio:s.inicio, fin:s.fin, acelerador:monto, puntosMarca:pts,
               dias: s.dias || null, acumulado: tot });
  }
  return { saldo: tot, puntosMarca: totPts, total: tot+totPts, semanas: det };
}

/* ── MOTOR DEL GERENTE ──────────────────────────────────────────────────── */
/*
   metricas: [{ nombre, baseTienda, alcance, ventasConIncentivo, puntosPorVenta }]

   Diferencia clave con el ejecutivo: el 35% NO se multiplica por el alcance.
   Es 35% plano de la base de tienda, con el 80% como simple compuerta.
   (En el ejemplo, Prepago al 88% cobra 2790 × 0.35 = $976 completo.)

   El "monedero" de puntos es el acelerador expresado en puntos: 1 punto = 1 peso.
*/
function calcularGerente2026(metricas, opts){
  opts = opts || {};
  var det=[], baseTotal=0, semanal=0, puntosAcel=0, puntosMarca=0;
  var avisos=[];

  var arpuEqOk = (opts.arpuEquipo   === undefined) || (opts.arpuEquipo   >= UMBRAL_2026.arpuEquipo);
  var arpuSvOk = (opts.arpuServicio === undefined) || (opts.arpuServicio >= UMBRAL_2026.arpuServicio);
  if(!arpuEqOk || !arpuSvOk) avisos.push('ARPU por debajo del mínimo: no se liberan aceleradores');

  // Candado: pospago solo servicio depende del 80% en pospago nuevo.
  var mPosNuevo = null;
  for(var k=0;k<metricas.length;k++){
    if(/pospago\s*nuevo/i.test(metricas[k].nombre)) mPosNuevo = metricas[k];
  }
  var servicioLiberado = !mPosNuevo || mPosNuevo.alcance >= UMBRAL_2026.base;

  for(var i=0;i<metricas.length;i++){
    var m = metricas[i];
    var fila = { nombre:m.nombre, baseTienda:m.baseTienda, alcance:m.alcance,
                 semanal:0, acelPct:0, puntos:0, puntosMarca:0, nota:'' };
    baseTotal += m.baseTienda;

    var esServicio = /pospago\s*servicio|solo\s*servicio/i.test(m.nombre);
    if(esServicio && !servicioLiberado){
      fila.nota='bloqueado: pospago nuevo < 80%'; det.push(fila); continue;
    }
    if(m.alcance < UMBRAL_2026.base){
      fila.nota='por debajo del 80%'; det.push(fila); continue;
    }

    // 35% plano sobre la base de la métrica (sin multiplicar por alcance).
    fila.semanal = Math.round(m.baseTienda * UMBRAL_2026.gerentePct);
    semanal += fila.semanal;

    // Acelerador en puntos, al 100%.
    var arpuOk = esServicio ? arpuSvOk : arpuEqOk;
    if(m.alcance >= UMBRAL_2026.acelGer && arpuOk){
      fila.acelPct = aceleradorPct2026(m.alcance, 'gerente');
      fila.puntos = Math.round(m.baseTienda * fila.acelPct);
      puntosAcel += fila.puntos;
    }

    // Puntos por venta con incentivo de marca (suman aparte del acelerador).
    if(m.ventasConIncentivo && m.puntosPorVenta){
      fila.puntosMarca = m.ventasConIncentivo * m.puntosPorVenta;
      puntosMarca += fila.puntosMarca;
    }
    det.push(fila);
  }

  return {
    detalle: det,
    baseTiendaTotal: baseTotal,
    bonoSemanal: Math.round(baseTotal * UMBRAL_2026.gerentePct),
    sumaFilas: semanal,
    puntosAcelerador: puntosAcel,
    puntosMarca: puntosMarca,
    puntosTotales: puntosAcel + puntosMarca,
    avisos: avisos
  };
}

/* ── CUOTAS ─────────────────────────────────────────────────────────────── */
/*
   [ago-2026] El gerente captura la cuota de su tienda; el regional puede
   sobrescribirla. Gana quien tiene mayor jerarquía, no quien escribió al
   final — así una edición del gerente no pisa lo que fijó el regional.
   Se guarda el rastro de quién puso cada valor.
*/
var JERARQUIA_2026 = { gerente:1, regional:2, director:3, director_nacional:4 };

function resolverCuota2026(registros){
  // registros: [{ valor, rol, por, ts }]
  if(!registros || !registros.length) return null;
  var mejor = null;
  for(var i=0;i<registros.length;i++){
    var r = registros[i];
    var nivel = JERARQUIA_2026[r.rol] || 0;
    if(!mejor || nivel > mejor._nivel ||
       (nivel === mejor._nivel && String(r.ts) > String(mejor.ts))){
      mejor = Object.assign({}, r, { _nivel: nivel });
    }
  }
  return { valor: mejor.valor, fijadaPor: mejor.por, rol: mejor.rol,
           sobrescrita: registros.length > 1 };
}

if(typeof window !== 'undefined'){
  window.COM_EQUIPO_2026 = COM_EQUIPO_2026;
  window.COM_SERVICIO_2026 = COM_SERVICIO_2026;
  window.COM_LITE_2026 = COM_LITE_2026;
  window.COM_NEGOCIOS_2026 = COM_NEGOCIOS_2026;
  window.SEGURO_2026 = SEGURO_2026;
  window.BONO_VALOR_2026 = BONO_VALOR_2026;
  window.TASA_2026 = TASA_2026;
  window.UMBRAL_2026 = UMBRAL_2026;
  window.calcularEjecutivo2026 = calcularEjecutivo2026;
  window.calcularGerente2026 = calcularGerente2026;
  window.monedero2026 = monedero2026;
  window.resolverCuota2026 = resolverCuota2026;
  window.pisoCumplido2026 = pisoCumplido2026;
  window.ARPU_MIN_2026 = ARPU_MIN_2026;
  window.seguroPorPrecio2026 = seguroPorPrecio2026;
  window.aceleradorPct2026 = aceleradorPct2026;
}
