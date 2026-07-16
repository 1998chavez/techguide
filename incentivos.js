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
  // Flyer Google (06 jul → 02 ago)
  'Pixel 10': 250,
  'Pixel 10 Pro': 400,
  'Pixel 10 Pro XL': 400,
  // Flyer Honor (06 jul → 09 ago)
  'Honor 400': 300,
  'Honor 400 + Balón': 300,
  'Honor X8D': 180,
  'Honor Magic 8 Lite 5G': 160,
  // Flyer Oppo (06 jul → 02 ago)
  'Oppo Find X9 Pro': 310,
  'Oppo Reno14 BDL Headphones': 190,
  'Oppo Reno 14F': 155,
  'Oppo A6k': 70,
  'Oppo A5 Pro 5G': 45,
  // Flyer Xiaomi (06 jul → 02 ago)
  'Xiaomi 17T': 150,
  'Xiaomi 15T': 250,
  'Redmi Note 15 Pro 5G': 210,
  'Redmi Note 15': 120
};

// ── Monto por plan (gana sobre EQUIP_INC cuando el flyer diferencia) ────────
window.EQUIP_INC_BY_PLAN = {
  // Flyer Honor 600 (13 jul → 23 ago): Black y superiores $680, acumulable.
  'Honor 600': { 'Black': 680, 'Platino': 680, 'Diamante': 680 },
  // Flyer Oppo Reno 16F (13 jul → 09 ago): Oro $200 / Black y superiores $500.
  'Oppo Reno 16F': { 'Oro': 200, 'Black': 500, 'Platino': 500, 'Diamante': 500 }
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
  'Pixel 10':                   { start: '2026-07-06', end: '2026-08-02' },
  'Pixel 10 Pro':               { start: '2026-07-06', end: '2026-08-02' },
  'Pixel 10 Pro XL':            { start: '2026-07-06', end: '2026-08-02' },
  'Honor 400':                  { start: '2026-07-06', end: '2026-08-09' },
  'Honor 400 + Balón':          { start: '2026-07-06', end: '2026-08-09' },
  'Honor X8D':                  { start: '2026-07-06', end: '2026-08-09' },
  'Honor Magic 8 Lite 5G':      { start: '2026-07-06', end: '2026-08-09' },
  'Oppo Find X9 Pro':           { start: '2026-07-06', end: '2026-08-02' },
  'Oppo Reno14 BDL Headphones': { start: '2026-07-06', end: '2026-08-02' },
  'Oppo Reno 14F':              { start: '2026-07-06', end: '2026-08-02' },
  'Oppo A6k':                   { start: '2026-07-06', end: '2026-08-02' },
  'Oppo A5 Pro 5G':             { start: '2026-07-06', end: '2026-08-02' },
  'Xiaomi 17T':                 { start: '2026-07-06', end: '2026-08-02' },
  'Xiaomi 15T':                 { start: '2026-07-06', end: '2026-08-02' },
  'Redmi Note 15 Pro 5G':       { start: '2026-07-06', end: '2026-08-02' },
  'Redmi Note 15':              { start: '2026-07-06', end: '2026-08-02' },
  'Honor 600':                  { start: '2026-07-13', end: '2026-08-23' },
  'Oppo Reno 16F':              { start: '2026-07-13', end: '2026-08-09' }
};
