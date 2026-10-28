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
