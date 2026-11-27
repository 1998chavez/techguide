// TechGuide · recibirExistencias
// Copiloto manda cada día el inventario por tienda de Bajío (POST + header X-Token).
// Escribe existencias/{org} (reemplaza el anterior) y existencias/_meta.
// El token vive en el secreto EXISTENCIAS_TOKEN de Functions, nunca en el código.
'use strict';
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { armar, tokenValido, listaTiendas } = require('./existencias');

admin.initializeApp();
const TOKEN = defineSecret('EXISTENCIAS_TOKEN');

exports.recibirExistencias = onRequest(
  { region: 'us-central1', secrets: [TOKEN], invoker: 'public', maxInstances: 2, timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      res.status(405).json({ ok: false, error: 'Usa POST' });
      return;
    }
    if (!tokenValido(req.get('X-Token'), TOKEN.value())) {
      res.status(401).json({ ok: false, error: 'Token inválido' });
      return;
    }
    const r = armar(req.body);
    if (r.error) {
      res.status(400).json({ ok: false, error: r.error });
      return;
    }
    try {
      const db = admin.firestore();
      const col = db.collection('existencias');
      const ahora = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      // set sin merge: el documento de la tienda se reemplaza completo.
      r.docs.forEach((d) => batch.set(col.doc(d.id), Object.assign({}, d.data, { actualizado: ahora })));
      await batch.commit();
      const snap = await col.select('tienda', 'clave', 'fecha').get();
      const docs = [];
      snap.forEach((s) => docs.push({ id: s.id, data: s.data() || {} }));
      await col.doc('_meta').set(Object.assign({}, r.meta, { listaTiendas: listaTiendas(docs), actualizado: ahora }));
      logger.info('existencias recibidas', { region: r.meta.region, fecha: r.meta.fecha, tiendas: r.meta.tiendas, modelos: r.meta.modelos.length });
      res.json({ ok: true, tiendas: r.meta.tiendas, modelos: r.meta.modelos.length });
    } catch (e) {
      logger.error('existencias: no se pudo escribir', { error: String((e && e.message) || e) });
      res.status(500).json({ ok: false, error: 'No se pudo guardar el inventario' });
    }
  }
);
