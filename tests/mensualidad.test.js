// [v1.73.8] Mensualidad con el enganche máximo (plan + equipo), en el home.
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { cargar, extraerFuncion } = require('./cargar-app.js');

const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('equipo incluido: solo el plan', () => {
  const c = cargar();
  assert.equal(c.mensualidadMax(0, 3999, 650, 30), 650);
});

test('equipo de $30 a 30 meses: $1 del equipo más el plan', () => {
  const c = cargar();
  assert.equal(c.mensualidadMax(30, 3999, 650, 30), 651);
});

test('70% o más: la garantía no baja el equipo (equipo completo entre el plazo)', () => {
  const c = cargar();
  assert.equal(c.mensualidadMax(1998.8, 9999, 650, 36), 650 + Math.round(1998.8 / 36)); // Oppo A6 Plata: $706
  assert.equal(c.mensualidadMax(1998.8, 9999, 650, 36), 706);
});

test('menos de 70%: el enganche máximo (50%) sí baja el equipo', () => {
  const c = cargar();
  assert.equal(c.mensualidadMax(9438.7, 18999, 650, 36), 781); // Reno 16 Plata
  assert.equal(c.mensualidadMax(7838.99, 18999, 725, 36), 834); // Reno 16 Oro
  assert.equal(c.mensualidadMax(3048.7, 9999, 650, 36), 692); // Magic 8 Lite Plata (69.5%)
});

test('la tarjeta de campaña y la de Equipos del momento muestran la mensualidad', () => {
  assert.match(extraerFuncion(APP, 'columnaPlanHTML'), /Mensualidad: <b>/);
  assert.match(extraerFuncion(APP, 'initMomento'), /Mensualidad: <b>/);
});

test('la sugerencia de plan usa la misma mensualidad (la garantía ya no baja el equipo)', () => {
  const f = extraerFuncion(APP, 'calcularMejorPlan');
  assert.match(f, /mensualidadMax\(/);
  assert.doesNotMatch(f, /promoActual - ceActual\.entrada|promo - ce\.entrada/);
});
