// Pruebas de la coherencia entre planos (la mesa no puede caer sobre las tarjetas). Uso: node tests/consistencia.test.mjs
import assert from 'node:assert/strict';
import { interseccionConvexa, areaPoligono } from '../src/geometria.js';
import { solapeMesaConTarjetas, SOLAPE_MAX, anisotropia, ANISOTROPIA_MAX, TAMANO_MAX } from '../src/consistencia.js';
import { calcularQuads } from '../src/areas.js';

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

// anisotropía: una traslación no estira; un estiramiento 10:1 sí
const base = cuad(0, 0, 50, 50);
assert.ok(Math.abs(anisotropia(base, cuad(30, 40, 50, 50)) - 1) < 1e-9);
assert.ok(anisotropia(base, cuad(0, 0, 500, 50)) > ANISOTROPIA_MAX);

// calcularQuads: la mesa estirada/enorme se reemplaza por la estimación con la base (punteada)
const hay = [
  { id: '04_h', plano: 'B', quad: cuad(100, 100, 100, 100), quadAprox: null },
  { id: '11_r', plano: 'C', quad: cuad(0, 0, 50, 50), quadAprox: cuad(300, 100, 100, 100) },
];
let r = calcularQuads(hay, { B: I, C: [1, 0, 400, 0, 1, 300, 0, 0, 1] }, 1000, 2000);
assert.equal(r.quads['11_r'].aprox, false, 'mesa bien: se usa su homografía');
const estirada = [10, 0, 400, 0, 1, 300, 0, 0, 1]; // estira 10x en x
r = calcularQuads(hay, { B: I, C: estirada }, 1000, 2000);
assert.equal(r.quads['11_r'].aprox, true, 'mesa estirada: cae a la base');
const enorme = [10, 0, 400, 0, 10, 300, 0, 0, 1]; // 10x en ambos: 5 tarjetas, más que TAMANO_MAX
assert.ok(TAMANO_MAX < 5);
r = calcularQuads(hay, { B: I, C: enorme }, 2000, 4000);
assert.equal(r.quads['11_r'].aprox, true, 'mesa enorme frente a las tarjetas: cae a la base');
console.log('consistencia entre planos: ok');
