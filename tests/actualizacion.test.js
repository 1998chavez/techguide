// [v1.73.29] Aviso y aplicación de versiones nuevas (la prueba completa, con el service
// worker de verdad y red lenta, es: node tests/navegador.js actualizacion).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

test('cuando el SW nuevo termina de activarse se revisa otra vez y, si acaba de regresar, se aplica', () => {
  assert.match(APP, /reg\.addEventListener\('updatefound', function\(\)\{/);
  assert.match(APP, /if\(w\.state === 'activated'\) setTimeout\(revisarVersionNueva, 300\);/);
  assert.match(APP, /Date\.now\(\) - \(window\._regresoTs \|\| 0\) < 30000/);
  assert.match(APP, /window\._regresoTs = Date\.now\(\);   \/\/ \[v1\.73\.29\]/);
});

test('cerrar el aviso solo esconde esa versión; el menú dice "Nueva"', () => {
  assert.match(APP, /sessionStorage\.setItem\('_updOculto', String\(window\._swBuildId\|\|''\)\)/);
  assert.match(APP, /if\(oc && oc===String\(window\._swBuildId\|\|''\)\) return;/);
  assert.match(HTML, /<span class="pmd-nuevo" id="pmd-nuevo" hidden>Nueva<\/span>/);
  assert.match(APP, /marcarMenuActualizacion\(true\)/);
  assert.match(APP, /marcarMenuActualizacion\(false\)/);
});
