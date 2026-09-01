// =============================================================================
// TechGuide — incentivos.js  [v1.37 · flyers al 01-sep-2026]
// FUENTE ÚNICA de los incentivos de equipo (bonos de marca, nivel EJECUTIVO).
//
// POR QUÉ EXISTE: antes esta información vivía duplicada en 6 archivos —
// catalog.js (indexada por ID, decorativa: nadie la leía para pagar) y los 5
// comisiones-*.html (indexada por nombre, la que sí paga). Cada flyer eran 6
// ediciones a mano y la posibilidad de que un rol pagara distinto que otro.
// Ahora se edita AQUÍ y nada más.
//
// LLAVE = NOMBRE DEL MODELO, no ID. Es la llave operativa real: es lo que
// guardan las ventas en Firestore (v.modelo) y lo que ofrece el dropdown del
// form del ejecutivo. Las variantes de almacenamiento comparten nombre y bono
// (Pixel 10 128 y 256 = $250), así que colapsarlas no pierde información.
//
// SE CARGA SIN ?v=BUILD_ID a propósito: pesa ~3KB y va stale-while-revalidate
// en el Service Worker. Así los 5 tableros pueden consumirlo sin necesitar cada
// uno su propio BUILD_ID (que volvería el bump de versión un ritual de 7
// constantes en vez de 4).
//
// REGLA VIGENTE: solo se modelan los incentivos de nivel EJECUTIVO. Los montos
// de gerente que traen los flyers (p.ej. Honor 600 $68, Xiaomi 17T $30) NO se
// capturan aquí por decisión de negocio (v1.10.78).
//
// REGLA DE VIGENCIA (Diego, 01-sep-2026): si un flyer venció y no llegó uno
// nuevo, el bono está VENCIDO hasta nuevo aviso. Ya no se dejan pagando bonos
// sin respaldo: al vencer sin reemplazo, el modelo se BORRA de este archivo.
// Solo regresa con flyer en mano.
// =============================================================================

// ── Monto fijo por equipo ───────────────────────────────────────────────────
window.EQUIP_INC = {
  // ── HONOR — flyer 13-ago a 27-sep (sin cambios de monto) ─────────────────
  'Honor Magic 7 Pro': 300,
  'Honor Magic 8 Lite 5G': 170,
  'Honor Magic 8 Lite 5G + Jersey': 170,
  'Honor X8D': 130,
  // ── MOTOROLA — flyer 03-ago a 04-oct ("extendemos la vigencia") ──────────
  'Moto Edge 70 Pro + Watch': 450,
  'Moto Edge 70 Pro + Watch + Chamarra': 450,
  'Moto Edge 70 Fusión': 200,          // [01-sep] alta: el flyer lo suma
  'Moto G77': 195,
  // ── XIAOMI — flyer 31-ago a 04-oct. Bajaron 15T y 17T ───────────────────
  'Xiaomi 15T': 180,                   // [01-sep] 250 -> 180
  'Xiaomi 17T': 190,                   // [01-sep] 220 -> 190
  'Redmi Note 17 + Sound Pocket': 100, // [01-sep] alta ("Redmi Note 17" en el flyer)
  'Redmi Note 17 Pro 5G': 180,         // [01-sep] alta. OJO: sin ficha en el catálogo
  // [01-sep] BAJA de 11 bonos cuyo flyer venció el 30-ago sin reemplazo:
  // Pixel 10 / Pro / Pro XL, Xiaomi 17T Pro, Redmi Note 15 y Note 15 Pro 5G,
  // Oppo Find X9 Pro, Reno 14F, Reno 13 5G, A6k y A5 Pro 5G.
  // Regla de negocio de Diego (01-sep): si un flyer venció y no llegó uno
  // nuevo, el bono está vencido hasta nuevo aviso. Vuelven a entrar solo con
  // flyer en mano. Esto reemplaza la nota de v1.11.62 que los dejaba pagando.
};
// ── Monto por plan (gana sobre EQUIP_INC cuando el flyer diferencia) ────────
window.EQUIP_INC_BY_PLAN = {
  // [01-sep] Flyer Honor 600 del 27-ago al 11-oct: 425 ejecutivo (antes 680).
  // "Aplica en Plan Black, Platino y Diamante" — por eso va aquí y no en
  // EQUIP_INC: BY_PLAN paga SOLO en los planes listados, $0 en el resto.
  'Honor 600': {"Black":425,"Platino":425,"Diamante":425}
};
// ── Unidades mínimas del mismo modelo para que el bono aplique ──────────────
window.EQUIP_INC_MIN_UNITS = {
  'Oppo Reno 16F': 2   // "Aplica a partir de 2 ventas"
};

// ── Vigencia declarada de cada flyer ────────────────────────────────────────
// [01-sep] Sigue alimentando el panel de Vigencias (avisa qué está por vencer),
// pero ya no hay bonos vencidos aquí: la regla de Diego es que al vencer sin
// flyer nuevo el modelo SALE del archivo. Así que este bloque y EQUIP_INC de
// arriba tienen exactamente las mismas llaves, y el panel sirve para avisar
// ANTES del vencimiento, no para reportar deuda vieja.
//
// Las fechas vienen de los flyers.
window.EQUIP_INC_VIGENCY = {
  // ── VIGENTES ────────────────────────────────────────────────────────────
  'Honor Magic 7 Pro': {start:'2026-08-13', end:'2026-09-27'},
  'Honor Magic 8 Lite 5G': {start:'2026-08-13', end:'2026-09-27'},
  'Honor Magic 8 Lite 5G + Jersey': {start:'2026-08-13', end:'2026-09-27'},
  'Honor X8D': {start:'2026-08-13', end:'2026-09-27'},
  'Honor 600': {start:'2026-08-27', end:'2026-10-11'},
  'Moto Edge 70 Pro + Watch': {start:'2026-08-03', end:'2026-10-04'},
  'Moto Edge 70 Pro + Watch + Chamarra': {start:'2026-08-03', end:'2026-10-04'},
  'Moto Edge 70 Fusión': {start:'2026-08-03', end:'2026-10-04'},
  'Moto G77': {start:'2026-08-03', end:'2026-10-04'},
  'Xiaomi 15T': {start:'2026-08-31', end:'2026-10-04'},
  'Xiaomi 17T': {start:'2026-08-31', end:'2026-10-04'},
  'Redmi Note 17 + Sound Pocket': {start:'2026-08-31', end:'2026-10-04'},
  'Redmi Note 17 Pro 5G': {start:'2026-08-31', end:'2026-10-04'}
  // Los 11 bonos vencidos el 30-ago salieron del archivo el 01-sep junto con
  // sus montos. Aquí solo viven los flyers que están en mano.
};

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
