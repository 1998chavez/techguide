// Correr: cd functions && node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { armar, tokenValido, claveTienda, listaTiendas } = require('./existencias');

const BASE = () => ({
  region: 'BAJIO', fecha: '2026-11-26', recibido: '2026-11-26T11:05:00-06:00',
  tiendas: [
    { org: 'ZX1', tienda: 'PRM TDA LEON ALTACIA', equipos: [{ modelo: 'HONOR X7B 256GB 4G', cant: 3 }, { modelo: 'apple  iphone 17 256gb 5g', cant: 2 }] },
    { org: 'ZX2', tienda: 'PRM TDA LEÓN CENTRO', equipos: [{ modelo: 'HONOR X7B 256GB 4G', cant: 1 }, { modelo: 'HONOR X7B 256GB 4G', cant: 4 }] },
  ],
});

test('token: igual pasa; distinto, vacío o sin secreto no', () => {
  assert.equal(tokenValido('abc123', 'abc123'), true);
  assert.equal(tokenValido('abc124', 'abc123'), false);
  assert.equal(tokenValido('', 'abc123'), false);
  assert.equal(tokenValido(undefined, 'abc123'), false);
  assert.equal(tokenValido('', ''), false);
  assert.equal(tokenValido('abc1234', 'abc123'), false);
});

test('clave de tienda: sin "PRM TDA", mayúsculas y sin acentos', () => {
  assert.equal(claveTienda('PRM TDA LEÓN CENTRO'), 'LEON CENTRO');
  assert.equal(claveTienda('prm tda  plaza nogal león'), 'PLAZA NOGAL LEON');
  assert.equal(claveTienda('LAGOS'), 'LAGOS');
});

test('un documento por tienda y _meta con fecha, recibido, número de tiendas y modelos distintos', () => {
  const r = armar(BASE());
  assert.equal(r.error, undefined);
  assert.deepEqual(r.docs.map((d) => d.id), ['ZX1', 'ZX2']);
  const a = r.docs[0].data;
  assert.equal(a.tienda, 'PRM TDA LEON ALTACIA');
  assert.equal(a.clave, 'LEON ALTACIA');
  assert.deepEqual(a.equipos, [{ modelo: 'APPLE IPHONE 17 256GB 5G', cant: 2 }, { modelo: 'HONOR X7B 256GB 4G', cant: 3 }]);
  assert.equal(a.piezas, 5);
  assert.deepEqual(r.docs[1].data.equipos, [{ modelo: 'HONOR X7B 256GB 4G', cant: 5 }], 'el mismo modelo en una tienda se suma');
  assert.deepEqual(r.meta, { region: 'BAJIO', fecha: '2026-11-26', recibido: '2026-11-26T11:05:00-06:00', tiendas: 2,
    modelos: ['APPLE IPHONE 17 256GB 5G', 'HONOR X7B 256GB 4G'] });
});

test('rechaza lo que no cuadra', () => {
  const casos = [
    [null, /objeto JSON/], [[], /objeto JSON/],
    [Object.assign(BASE(), { region: '' }), /region/],
    [Object.assign(BASE(), { fecha: '26/11/2026' }), /fecha/],
    [Object.assign(BASE(), { recibido: '' }), /recibido/],
    [Object.assign(BASE(), { tiendas: [] }), /vacío/],
  ];
  for (const [b, re] of casos) assert.match(armar(b).error || '', re);
  const b1 = BASE(); b1.tiendas[0].org = '../x'; assert.match(armar(b1).error, /org inválido/);
  const b2 = BASE(); b2.tiendas[0].org = '_meta'; assert.match(armar(b2).error, /org inválido/);
  const b3 = BASE(); b3.tiendas[1].org = 'ZX1'; assert.match(armar(b3).error, /repetido/);
  const b4 = BASE(); b4.tiendas[0].equipos[0].cant = -1; assert.match(armar(b4).error, /cant/);
  const b5 = BASE(); b5.tiendas[0].equipos[0].cant = 1.5; assert.match(armar(b5).error, /cant/);
  const b6 = BASE(); b6.tiendas[0].equipos[0].modelo = ''; assert.match(armar(b6).error, /modelo/);
  const b7 = BASE(); b7.tiendas[0].tienda = ''; assert.match(armar(b7).error, /tienda vacío/);
});

test('_meta.listaTiendas: todas las tiendas con documento, sin _meta, ordenadas', () => {
  const l = listaTiendas([
    { id: '_meta', data: {} },
    { id: 'ZX2', data: { tienda: 'PRM TDA LEON CENTRO', clave: 'LEON CENTRO', fecha: '2026-11-26' } },
    { id: 'ZX9', data: { tienda: 'PRM TDA LAGOS', fecha: '2026-11-25' } },
  ]);
  assert.deepEqual(l, [
    { org: 'ZX9', tienda: 'PRM TDA LAGOS', clave: 'LAGOS', fecha: '2026-11-25' },
    { org: 'ZX2', tienda: 'PRM TDA LEON CENTRO', clave: 'LEON CENTRO', fecha: '2026-11-26' },
  ]);
});
