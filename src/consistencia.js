// Coherencia entre planos. La mesa (C) y la plataforma de las tarjetas (B) no se pisan: el nido, los nidos de
// barro y la rama están en la madera, al costado de las tarjetas. Si una alineación de la mesa dibuja esas
// áreas encima de las tarjetas, es un reconocimiento equivocado (los puntos de las tarjetas se confunden con
// los de la madera) y se descarta.
import { proyectarCuadrilatero, cuadrilateroValido, interseccionConvexa, areaPoligono } from './geometria.js';

export const SOLAPE_MAX = 0.2; // fracción del área de la mesa que puede caer sobre tarjetas

// areas: lista de armarAreas(); H: {B, C} homografías vigentes. Devuelve la mayor fracción de solape
// (0 si no se puede comprobar).
export function solapeMesaConTarjetas(areas, H, ancho, alto) {
  if (!H.B || !H.C) return 0;
  const tarjetas = [];
  for (const a of areas) {
    if (a.plano !== 'B') continue;
    const q = proyectarCuadrilatero(H.B, a.quad);
    if (cuadrilateroValido(q, ancho, alto * 2)) tarjetas.push(q);
  }
  let peor = 0;
  for (const a of areas) {
    if (a.plano !== 'C') continue;
    const q = proyectarCuadrilatero(H.C, a.quad);
    if (!cuadrilateroValido(q, ancho, alto * 2)) continue;
    const area = areaPoligono(q);
    let tapado = 0;
    for (const t of tarjetas) tapado += areaPoligono(interseccionConvexa(q, t));
    peor = Math.max(peor, tapado / area);
  }
  return peor;
}

// Anisotropía de la proyección de un cuadrilátero: cuánto se estira en una dirección respecto de la otra.
// De costado y de lejos el plano de la mesa se estira muchísimo y los recuadros se vuelven enormes e
// inservibles; por encima de este límite el recuadro no se dibuja.
export const ANISOTROPIA_MAX = 6;
export function anisotropia(qBase, qProy) {
  const lado = (q, i) => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
  const sx = (lado(qProy, 0) + lado(qProy, 2)) / (lado(qBase, 0) + lado(qBase, 2));
  const sy = (lado(qProy, 1) + lado(qProy, 3)) / (lado(qBase, 1) + lado(qBase, 3));
  if (!(sx > 0) || !(sy > 0)) return Infinity;
  return Math.max(sx / sy, sy / sx);
}

// Tamaño máximo de un recuadro de la mesa en "tarjetas" (raíz del área sobre raíz del área de la tarjeta de
// Himenópteros ya proyectada). En vistas correctas el nido y la rama miden hasta ~3 tarjetas; mucho más es
// una alineación de la mesa estirada o equivocada.
export const TAMANO_MAX = 4;
