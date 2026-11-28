// Inventario por tienda (Bajío): validación y armado de documentos, sin Firebase,
// para poder probarlo con node --test. index.js solo valida el token y escribe.
'use strict';
const crypto = require('crypto');

const ORG_OK = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_TIENDAS = 300;       // un batch de Firestore admite 500 escrituras
const MAX_EQUIPOS = 2000;
const MAX_COLORES = 60;

// "#1d1d1f" → "#1D1D1F"; "#fff" → "#FFFFFF"; cualquier otra cosa → null (punto gris en la app).
function normTono(t) {
  const s = String(t == null ? '' : t).trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase();
  return null;
}

// colores de un equipo → { lista } (null si no vino) o { error }. Sus piezas deben sumar cant.
function leerColores(v, cant, donde) {
  if (v === undefined || v === null) return { lista: null };
  if (!Array.isArray(v)) return { error: donde + '.colores no es lista' };
  if (v.length > MAX_COLORES) return { error: donde + ' trae más de ' + MAX_COLORES + ' colores' };
  const lista = [];
  let total = 0;
  for (let k = 0; k < v.length; k++) {
    const c = v[k] || {};
    const color = String(c.color == null ? '' : c.color).trim().replace(/\s+/g, ' ');
    const n = Number(c.cant);
    if (!color || color.length > 60) return { error: donde + '.colores[' + k + '].color inválido' };
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: donde + '.colores[' + k + '].cant inválida' };
    total += n;
    lista.push({ color, tono: normTono(c.tono), cant: n });
  }
  if (total !== cant) return { error: donde + '.colores suman ' + total + ' y cant es ' + cant };
  return { lista };
}

// Igual que invClaveTienda de la app: mayúsculas, sin acentos ni "PRM TDA".
function claveTienda(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/^PRM TDA(\s+|$)/, '').replace(/\s+/g, ' ');
}

// Comparación de tiempo constante; un secreto vacío nunca valida.
function tokenValido(recibido, esperado) {
  const a = Buffer.from(String(recibido || ''), 'utf8');
  const b = Buffer.from(String(esperado || ''), 'utf8');
  if (!b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// body → { error } o { docs: [{ id, data }], meta }
function armar(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'El cuerpo no es un objeto JSON' };
  const region = String(body.region || '').trim().toUpperCase();
  if (!region) return { error: 'Falta region' };
  const fecha = String(body.fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'fecha debe ser AAAA-MM-DD' };
  const recibido = String(body.recibido || '').trim();
  if (!recibido || recibido.length > 40) return { error: 'Falta recibido' };
  if (!Array.isArray(body.tiendas) || !body.tiendas.length) return { error: 'tiendas viene vacío' };
  if (body.tiendas.length > MAX_TIENDAS) return { error: 'Más de ' + MAX_TIENDAS + ' tiendas' };

  const vistas = new Set();
  const modelos = new Set();
  const docs = [];
  for (let i = 0; i < body.tiendas.length; i++) {
    const t = body.tiendas[i] || {};
    const org = String(t.org || '').trim();
    if (!ORG_OK.test(org) || org === '_meta') return { error: 'tiendas[' + i + '].org inválido' };
    if (vistas.has(org)) return { error: 'org repetido: ' + org };
    vistas.add(org);
    const tienda = String(t.tienda || '').trim();
    if (!tienda) return { error: 'tiendas[' + i + '].tienda vacío' };
    if (!Array.isArray(t.equipos)) return { error: 'tiendas[' + i + '].equipos no es lista' };
    if (t.equipos.length > MAX_EQUIPOS) return { error: 'tiendas[' + i + '] trae más de ' + MAX_EQUIPOS + ' equipos' };
    // El mismo modelo dos veces en una tienda (otro color, por ejemplo) se suma, y sus
    // colores también (por nombre). Si una de esas filas no trae colores, ese modelo
    // se guarda sin colores para que nunca sumen distinto que sus piezas.
    const suma = new Map();
    for (let j = 0; j < t.equipos.length; j++) {
      const e = t.equipos[j] || {};
      const donde = 'tiendas[' + i + '].equipos[' + j + ']';
      const modelo = String(e.modelo || '').trim().replace(/\s+/g, ' ').toUpperCase();
      const cant = Number(e.cant);
      if (!modelo || modelo.length > 120) return { error: donde + '.modelo inválido' };
      if (!Number.isInteger(cant) || cant < 0 || cant > 100000) return { error: donde + '.cant inválida' };
      const cols = leerColores(e.colores, cant, donde);
      if (cols.error) return { error: cols.error };
      const s = suma.get(modelo) || { cant: 0, filas: 0, conColores: 0, colores: new Map() };
      s.cant += cant;
      s.filas++;
      if (cols.lista) {
        s.conColores++;
        cols.lista.forEach((c) => {
          const k = c.color.toUpperCase();
          const x = s.colores.get(k);
          if (x) { x.cant += c.cant; if (!x.tono) x.tono = c.tono; } else s.colores.set(k, Object.assign({}, c));
        });
      }
      suma.set(modelo, s);
    }
    const equipos = Array.from(suma, ([modelo, s]) => {
      const e = { modelo, cant: s.cant };
      if (s.conColores && s.conColores === s.filas) e.colores = Array.from(s.colores.values()).filter((c) => c.cant > 0);
      return e;
    }).sort((a, b) => (a.modelo < b.modelo ? -1 : 1));
    equipos.forEach((e) => modelos.add(e.modelo));
    docs.push({
      id: org,
      data: { org, tienda, clave: claveTienda(tienda), region, fecha, recibido, equipos, piezas: equipos.reduce((s, e) => s + e.cant, 0) },
    });
  }
  const meta = { region, fecha, recibido, tiendas: docs.length, modelos: Array.from(modelos).sort() };
  return { docs, meta };
}

// Lista de tiendas para _meta con TODAS las que tienen documento (una tienda que no
// vino hoy conserva el suyo y su fecha). snapDocs: [{ id, data }].
function listaTiendas(snapDocs) {
  return snapDocs.filter((d) => d.id !== '_meta').map((d) => ({
    org: d.id, tienda: d.data.tienda || '', clave: d.data.clave || claveTienda(d.data.tienda), fecha: d.data.fecha || '',
  })).sort((a, b) => (a.tienda < b.tienda ? -1 : a.tienda > b.tienda ? 1 : 0));
}

module.exports = { armar, tokenValido, claveTienda, listaTiendas, normTono };
