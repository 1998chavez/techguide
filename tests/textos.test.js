// [v1.73.28] Explicaciones redundantes que se quitaron (y lo que queda en su lugar).
// Correr: node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const TODO = APP + HTML;

test('ya no están las explicaciones redundantes', () => {
  for (const t of ['¿Para qué plataforma?', 'Elige el sistema del equipo a cotizar', 'iPhone & iOS', 'id="ios-cnt"', 'id="and-cnt"',
    'Sin enganche (historial excelente)', '¡Vence pronto!', "' · último día'", 'Reviews, unboxings', 'Se abre en la app de YouTube',
    'Arranca una venta ahora', '¿Cuánto tiene el cliente para pagar hoy?', '¿Cuánto puede pagar al mes?', '<span class="cot-tipo-desc">',
    'Toca compartir para enviarla al cliente', 'Toca compartir para enviarlo a tu equipo', 'Usa tu ATTUID y contraseña para entrar',
    'Esta información no aparece en la cotización del cliente']) {
    assert.ok(!TODO.includes(t), 'sigue: ' + t);
  }
});

test('lo que queda: plataforma, vigencia y YouTube', () => {
  assert.match(HTML, /<div class="hv2-sheet-title hv2-sheet-title-solo">Escoge la plataforma<\/div>/);
  assert.match(HTML, /<span class="hv2-sheet-opt-name">iPhone<\/span>/);
  assert.match(APP, /'Vigente hasta '\+_vl : _vl;/);
  assert.match(APP, /h\+='<div class="tt-section tt-solo">';\n\s+h\+='<button class="tt-btn"/);
  assert.match(APP, /De 1 a 3 rentas del plan como garantía/, 'la nota de rentas en garantía se queda: es información, no explicación');
  assert.match(HTML, /class="comm-section-sub">Solo visible para ti</, 'queda una sola nota de que la comisión es privada');
});
