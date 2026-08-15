// =============================================================================
// TechGuide — incentivos.js  [v1.11.62]
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
// de gerente que traen los flyers (p.ej. Honor 600 $85, Reno 16F $50) NO se
// capturan aquí por decisión de negocio (v1.10.78).
// =============================================================================

// ── Monto fijo por equipo ───────────────────────────────────────────────────
window.EQUIP_INC = {
  'Honor Magic 7 Pro': 300,
  'Honor Magic 8 Lite 5G': 170,
  'Honor Magic 8 Lite 5G + Jersey': 170,
  'Honor X8D': 130,
  'Moto Edge 70 Pro + Watch': 450,
  'Moto Edge 70 Pro + Watch + Chamarra': 450,
  'Moto G77': 195,
  'Pixel 10': 250,
  'Pixel 10 Pro': 400,
  'Pixel 10 Pro XL': 400,
  'Xiaomi 15T': 250,
  'Xiaomi 17T': 220,
  'Xiaomi 17T Pro': 220,
  'Redmi Note 15 Pro 5G': 210,
  'Redmi Note 15': 120,
  'Oppo Find X9 Pro': 310,
  'Oppo Reno 14F': 155,
  'Oppo Reno 13 5G': 85,
  'Oppo A6k': 85,
  'Oppo A5 Pro 5G': 85
};
// ── Monto por plan (gana sobre EQUIP_INC cuando el flyer diferencia) ────────
window.EQUIP_INC_BY_PLAN = {
  'Honor 600': {"Black":680,"Platino":680,"Diamante":680}
};
// ── Unidades mínimas del mismo modelo para que el bono aplique ──────────────
window.EQUIP_INC_MIN_UNITS = {
  'Oppo Reno 16F': 2   // "Aplica a partir de 2 ventas"
};

// ── Vigencia declarada de cada flyer ────────────────────────────────────────
// [v1.11.62] IMPORTANTE — HOY ESTO ES SOLO INFORMATIVO: alimenta el panel de
// Vigencias para avisar qué bonos están por vencer o ya vencieron. NO apaga el
// bono automáticamente: un bono vencido SIGUE pagando hasta que se edite este
// archivo. Apagarlo solo es una decisión de negocio (afecta dinero de la gente)
// y está pendiente de confirmación explícita de Diego.
//
// Las fechas de fin vienen de los flyers. Las de inicio de los flyers del 06-jul
// son inferidas de la fecha del flyer, no de una vigencia impresa.
window.EQUIP_INC_VIGENCY = {
  'Honor Magic 7 Pro': {start:'2026-08-13', end:'2026-09-27'},
  'Honor Magic 8 Lite 5G': {start:'2026-08-13', end:'2026-09-27'},
  'Honor Magic 8 Lite 5G + Jersey': {start:'2026-08-13', end:'2026-09-27'},
  'Honor X8D': {start:'2026-08-13', end:'2026-09-27'},
  'Moto Edge 70 Pro + Watch': {start:'2026-08-03', end:'2026-08-30'},
  'Moto Edge 70 Pro + Watch + Chamarra': {start:'2026-08-03', end:'2026-08-30'},
  'Moto G77': {start:'2026-08-03', end:'2026-08-30'},
  'Pixel 10': {start:'2026-08-03', end:'2026-08-30'},
  'Pixel 10 Pro': {start:'2026-08-03', end:'2026-08-30'},
  'Pixel 10 Pro XL': {start:'2026-08-03', end:'2026-08-30'},
  'Xiaomi 15T': {start:'2026-08-03', end:'2026-08-30'},
  'Xiaomi 17T': {start:'2026-08-03', end:'2026-08-30'},
  'Xiaomi 17T Pro': {start:'2026-08-03', end:'2026-08-30'},
  'Redmi Note 15 Pro 5G': {start:'2026-08-03', end:'2026-08-30'},
  'Redmi Note 15': {start:'2026-08-03', end:'2026-08-30'},
  'Oppo Find X9 Pro': {start:'2026-08-03', end:'2026-08-30'},
  'Oppo Reno 14F': {start:'2026-08-03', end:'2026-08-30'},
  'Oppo Reno 13 5G': {start:'2026-08-03', end:'2026-08-30'},
  'Oppo A6k': {start:'2026-08-03', end:'2026-08-30'},
  'Oppo A5 Pro 5G': {start:'2026-08-03', end:'2026-08-30'},
  'Honor 600': {start:'2026-07-13', end:'2026-08-23'}
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
