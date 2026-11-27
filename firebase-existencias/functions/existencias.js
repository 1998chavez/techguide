// Inventario por tienda (Bajío): validación y armado de documentos, sin Firebase,
// para poder probarlo con node --test. index.js solo valida el token y escribe.
'use strict';
const crypto = require('crypto');

const ORG_OK = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_TIENDAS = 300;       // un batch de Firestore admite 500 escrituras
const MAX_EQUIPOS = 2000;

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
    // El mismo modelo dos veces en una tienda (otro color, por ejemplo) se suma.
    const suma = new Map();
    for (let j = 0; j < t.equipos.length; j++) {
      const e = t.equipos[j] || {};
      const modelo = String(e.modelo || '').trim().replace(/\s+/g, ' ').toUpperCase();
      const cant = Number(e.cant);
      if (!modelo || modelo.length > 120) return { error: 'tiendas[' + i + '].equipos[' + j + '].modelo inválido' };
      if (!Number.isInteger(cant) || cant < 0 || cant > 100000) return { error: 'tiendas[' + i + '].equipos[' + j + '].cant inválida' };
      suma.set(modelo, (suma.get(modelo) || 0) + cant);
    }
    const equipos = Array.from(suma, ([modelo, cant]) => ({ modelo, cant })).sort((a, b) => (a.modelo < b.modelo ? -1 : 1));
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

module.exports = { armar, tokenValido, claveTienda, listaTiendas };
