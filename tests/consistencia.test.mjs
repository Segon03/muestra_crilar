// Pruebas de la coherencia entre planos (la mesa no puede caer sobre las tarjetas). Uso: node tests/consistencia.test.mjs
import assert from 'node:assert/strict';
import { interseccionConvexa, areaPoligono } from '../src/geometria.js';
import { solapeMesaConTarjetas, SOLAPE_MAX } from '../src/consistencia.js';

const cuad = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
// intersección: cuadrados de 10 desplazados 5 -> 25
assert.equal(areaPoligono(interseccionConvexa(cuad(0, 0, 10, 10), cuad(5, 5, 10, 10))), 25);
assert.equal(interseccionConvexa(cuad(0, 0, 10, 10), cuad(20, 20, 5, 5)).length, 0);
assert.equal(areaPoligono(interseccionConvexa(cuad(0, 0, 10, 10), cuad(2, 2, 3, 3))), 9);

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const areas = [
  { id: '04_x', plano: 'B', quad: cuad(100, 100, 100, 100) },
  { id: '09_x', plano: 'C', quad: cuad(300, 100, 100, 100) },
];
// bien: la mesa queda al costado de la tarjeta
assert.equal(solapeMesaConTarjetas(areas, { B: I, C: I }, 640, 1138), 0);
// mal: una alineación de la mesa que la lleva encima de la tarjeta (traslación de -200 en x)
const encima = [1, 0, -200, 0, 1, 0, 0, 0, 1];
const s = solapeMesaConTarjetas(areas, { B: I, C: encima }, 640, 1138);
assert.ok(s > SOLAPE_MAX, `solape ${s}`);
// sin una de las dos no se puede comprobar
assert.equal(solapeMesaConTarjetas(areas, { B: I, C: null }, 640, 1138), 0);
console.log('consistencia entre planos: ok');
