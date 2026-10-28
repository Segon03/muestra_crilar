// Prueba del ajuste de borde de la caja con una imagen sintética. Uso: node tests/ajuste.test.mjs
import assert from 'node:assert/strict';
import { ajustarCuadrilatero } from '../src/ajuste.js';

const W = 320, H = 240;
// marco negro con abertura clara (trapecio leve) sobre pared gris claro
const abertura = [[90, 60], [230, 52], [222, 170], [96, 178]];
const g = new Uint8Array(W * H).fill(200);
const dentro = (poli, x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = poli[i], [x2, y2] = poli[(i + 1) % 4]; const c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1); s += c > 0 ? 1 : -1; } return Math.abs(s) === 4; };
const marco = abertura.map(([x, y], i) => [x + (i === 0 || i === 3 ? -16 : 16), y + (i < 2 ? -14 : 14)]);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = dentro(abertura, x, y) ? 215 : dentro(marco, x, y) ? 30 : 200;

const error = (q) => Math.max(...q.map((p, i) => Math.hypot(p[0] - abertura[i][0], p[1] - abertura[i][1])));
// predicción desplazada y algo agrandada (como el error de la homografía)
const previsto = abertura.map(([x, y]) => [x + 7, y + 9]);
const aj = ajustarCuadrilatero(g, W, H, previsto);
assert.ok(aj, 'debe encontrar el borde');
assert.ok(error(aj) < 1.5, `error tras el ajuste: ${error(aj).toFixed(2)} px`);
assert.ok(error(previsto) > 8, 'la predicción de partida está lejos');

// sin contraste no hay borde: no se inventa nada
assert.equal(ajustarCuadrilatero(new Uint8Array(W * H).fill(128), W, H, previsto), null);
// recuadro demasiado chico: no se intenta
assert.equal(ajustarCuadrilatero(g, W, H, [[100, 100], [120, 100], [120, 115], [100, 115]]), null);
console.log(`ajuste de borde: ok (error ${error(previsto).toFixed(1)} -> ${error(aj).toFixed(2)} px)`);
