// Pruebas de las partes de la app que no dependen de OpenCV. Uso: node tests/geometria.test.mjs
import assert from 'node:assert/strict';
import { multiplicar, aplicar, contiene, cuadrilateroValido, areaPoligono, planoDe, cajaACuadrilatero, proyectarCuadrilatero } from '../src/geometria.js';
import { emparejar } from '../src/emparejar.js';

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const T = [1, 0, 10, 0, 1, 20, 0, 0, 1];
assert.deepEqual(multiplicar(I, T), T);
assert.deepEqual(aplicar(T, 5, 5), [15, 25]);
assert.deepEqual(aplicar(multiplicar(T, T), 0, 0), [20, 40]);

const cuadro = cajaACuadrilatero({ x1: 0, y1: 0, x2: 100, y2: 50 });
assert.equal(areaPoligono(cuadro), 5000);
assert.ok(contiene(cuadro, 50, 25));
assert.ok(!contiene(cuadro, 150, 25));
assert.ok(cuadrilateroValido(proyectarCuadrilatero(T, cuadro), 480, 640));
assert.ok(!cuadrilateroValido([[0, 0], [100, 100], [100, 0], [0, 100]], 480, 640), 'cuadrilátero cruzado');
assert.ok(!cuadrilateroValido([[0, 0], [1, 0], [1, 1], [0, 1]], 480, 640), 'demasiado chico');
assert.equal(planoDe('01_caja_entomologica_superior'), 'A');
assert.equal(planoDe('11_rama_oncideres'), 'B');

// emparejar: un descriptor idéntico se empareja, uno ambiguo no
const a = new Uint32Array(16).fill(0xffff0000);
const b = new Uint32Array(48);
b.set(a, 0); b.fill(0x0f0f0f0f, 16, 32); b.fill(0x0f0f0f0e, 32, 48);
const r = emparejar(a, 1, b, 3);
assert.deepEqual([r.qi, r.ti], [[0], [0]]);
console.log('geometría y emparejamiento: ok');
