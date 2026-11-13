// =============================================================================
// TechGuide — incentivos.js  [v1.73.7 · flyers de noviembre 2026]
// FUENTE ÚNICA de los incentivos de equipo (bonos de marca, nivel EJECUTIVO).
//
// [v1.73.7] LOS FLYERS YA PAGAN EN PUNTOS, NO EN PESOS ("Gana puntos y llena tu
// monedero"). Por instrucción de Diego (10-nov-2026) todo se maneja como
// puntos: PUNTOS_FLYERS de abajo es lo que la app muestra (pastilla en los
// equipos, ficha, Tu comisión, Top comisiones y Vigencias). Los puntos NO se
// suman a la comisión en pesos.
//
// POR QUÉ EXISTE: antes esta información vivía duplicada en 6 archivos —
// catalog.js y los 5 comisiones-*.html. Ahora se edita AQUÍ y nada más.
//
// SE CARGA SIN ?v=BUILD_ID a propósito: pesa ~3KB y va stale-while-revalidate
// en el Service Worker, para que los tableros puedan consumirlo sin BUILD_ID.
//
// REGLA VIGENTE: solo se modelan los incentivos de nivel EJECUTIVO. Los puntos
// de gerente de tienda que traen los flyers NO se capturan (v1.10.78; Diego lo
// confirmó el 10-nov-2026: "muestra para ejecutivos nada más").
//
// REGLA DE VIGENCIA (Diego, 01-sep-2026): si un flyer venció y no llegó uno
// nuevo, el bono está VENCIDO hasta nuevo aviso. Con puntos esto es automático:
// cada flyer trae ini/fin y fuera de esas fechas la app no muestra sus puntos.
// Aun así, al vencer se borra de aquí para no acumular flyers viejos.
// =============================================================================

// ── Puntos por equipo, por flyer ────────────────────────────────────────────
// LLAVE = ID DEL CATÁLOGO (no nombre): el Honor X6E paga distinto en 128 GB y en
// 256 GB, y las dos versiones comparten nombre. Solo puntos de EJECUTIVO.
// Condiciones de los 3 flyers: "Se paga incentivo desde plan Azul 3 y
// superiores. Comisionan de manera independiente en Pospago con Equipo y
// Renovaciones logrando el 100% de alcance semanal. El pago es mensual vía
// nómina para gerentes y semanal para ejecutivos. Sujeto a nuevo esquema de
// comisiones."
window.PUNTOS_FLYERS = [
  // ── OPPO — del 2 de noviembre al 6 de diciembre de 2026 ──────────────────
  // Find X10 (lanzamiento) 220 pts: todavía sin ficha en el catálogo; entra
  // cuando tenga ficha. El Find X9 Pro sigue OCULTO (Diego, 10-nov): sus puntos
  // quedan registrados pero no se ve en la app.
  { marca:'OPPO', ini:'2026-11-02', fin:'2026-12-06', puntos:{
    opfindx9pro:220, opreno16:330, opreno16f:225, opa6k:45, opa6:45 } },
  // ── MOTOROLA — del 5 de octubre de 2026 al 3 de enero de 2027 ─────────────
  // El flyer dice "Moto Edge 70 Pro": en el catálogo vive como bundle con Watch
  // y con Watch + Chamarra; los dos pagan igual (como en flyers anteriores).
  // [v1.73.11] Diego (13-nov): los SKUs nuevos suman los puntos de su modelo:
  // G77 + Moto Buds 2 = G77 (230) y Edge 70 Fusión 12 GB = Edge 70 Fusion (245).
  { marca:'MOTOROLA', ini:'2026-10-05', fin:'2027-01-03', puntos:{
    mg77:230, mg77_buds2:230, medge70f_npi:245, medge70f_12:245, medge70pro_w:450, medge70pro_wc:450 } },
  // ── HONOR — del 2 de noviembre al 27 de diciembre de 2026 ─────────────────
  // El Honor 600 ya no es "solo Black, Platino y Diamante": este flyer lo paga
  // desde Azul 3 como a todos.
  { marca:'HONOR', ini:'2026-11-02', fin:'2026-12-27', puntos:{
    hx6e:80, hx6e_256:130, hx7e:180, honor600:280 } }
];

// ── Bonos en PESOS (esquema anterior) ───────────────────────────────────────
// [v1.73.7] Vacíos. Los últimos flyers en pesos vencieron (Honor 27-sep,
// Motorola y Xiaomi 04-oct, Honor 600 11-oct) y los nuevos pagan en puntos.
// Se conservan las variables, vacías, porque los comisiones-*.html (apagados
// con COMISIONES_OFF) y el cálculo de comisión en pesos las leen.
window.EQUIP_INC = {};
window.EQUIP_INC_BY_PLAN = {};
window.EQUIP_INC_MIN_UNITS = {};
window.EQUIP_INC_VIGENCY = {};

// ── [v1.11.64] RENTA MENSUAL POR PLAN — insumo del ARPU de los tableros ─────
// POR QUÉ VIVE AQUÍ: estaba duplicada a mano en los 4 tableros que calculan ARPU
// (gerente, regional, director, dn). Mismo problema que tenían los incentivos.
//
// EL BUG QUE ESTO CIERRA (v1.11.63 y antes): la tabla SOLO tenía los planes
// Premium. arpuOf() hace `s += v[p] * (PLAN_ARPU[p] || 0)` — o sea, una venta de
// un plan ausente contaba en el DENOMINADOR y aportaba $0 al numerador. Cada
// venta Lite o A Negocios hundía el ARPU de la tienda.
// Caso real (Paseo del Moral, semana 29): 7 ventas con 2 Lite → $378 en TechGuide
// contra $523 del Portal. Con las rentas reales de abajo: 3,663/7 = $523. Exacto.
//
// Las rentas salen de los flyers oficiales de Prime MX. Nota: para 'Titanio' se
// usa $799 y no la renta de catálogo ($1,599) — decisión de negocio de Diego
// (v1.11.x): el ARPU corre con $799 aunque la comisión pague como Black.
window.PLAN_ARPU = {
  // Premium
  'Azul 1': 330, 'Azul 2': 435, 'Azul 3': 550, 'Plata': 650, 'Oro': 725,
  'Black': 825, 'Platino': 1035, 'Diamante': 1300,
  'Titanio': 799, 'Titanio Trade In': 799,
  // Lite (flyer AT&T Lite)
  'Lite': 299, 'Lite 1': 349, 'Lite 2': 449, 'Lite 3': 549, 'Lite 4': 669, 'Lite 5': 999,
  // A Negocios — la llave ES el monto de la renta (así lo guarda el form)
  '239': 239, '299': 299, '399': 399, '499': 499, '599': 599, '699': 699,
  '799': 799, '899': 899, '999': 999, '1299': 1299, '1499': 1499
};


// ── [v1.11.67] QUÉ CUENTA PARA ARPU Y MIX ──────────────────────────────────
// PDF jul26, textual — Gerentes pág.2 y Ejecutivos pág.4:
//   "Para el cálculo de mix y ARPU solamente se consideran planes de la familia
//    PREMIUM y LITE."
// Los planes A Negocios SÍ suman al avance de cuota de la tienda (r.po) y SÍ
// comisionan; simplemente no entran ni al ARPU ni al mix. Confirmado por Diego.
//
// La familia se deduce de la llave del plan, no de un campo aparte: el form de
// captura guarda 'Oro'/'Azul 1' (Premium), 'Lite 3' (Lite) y '499'/'1299'
// (A Negocios — la llave ES el monto de la renta). Es la señal más confiable que
// hay en el documento guardado: `sub` no sirve porque en migraciones arranca con
// 'Migración' y pierde la familia.
window.esPlanNegocios = function(plan){ return /^[0-9]+$/.test(String(plan||'')); };

// Además excluye —en vez de contar como $0— cualquier plan sin renta registrada.
// Esto es el candado contra el bug de v1.11.63: arpuOf hacía `PLAN_ARPU[p]||0`, y
// un plan ausente contaba en el denominador aportando cero, hundiendo el ARPU de
// la tienda en silencio. Ahora un plan desconocido se sale de la cuenta y avisa.
window.cuentaParaArpuMix = function(plan){
  if(window.esPlanNegocios(plan)) return false;
  if(!(plan in window.PLAN_ARPU)){
    try{ console.warn('[ARPU/mix] plan sin renta registrada, queda fuera del cálculo:', plan); }catch(e){}
    return false;
  }
  return true;
};
