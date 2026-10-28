// Arma la lista de áreas con el cuadrilátero que corresponde a cada plano.
//   A: caja de la pared · B: plataforma blanca con las tarjetas · C: mesa de madera (nido, nidos de
//   barro, rama). B y A usan coordenadas de la foto base; C usa las de su propia foto de referencia.
import { cajaACuadrilatero, planoDe } from './geometria.js';

// areasJson: referencias/areas.json · poligonos: referencias/areas_poligonos.json
// hayC: si el banco trae vistas de la mesa. Si no, las áreas de la mesa se siguen con la base.
export function armarAreas(areasJson, poligonos, hayC) {
  const pol = poligonos.poligonos || {};
  const mesa = (poligonos.mesa && poligonos.mesa.poligonos) || {};
  return areasJson.areas.map((a) => {
    const base = pol[a.id] || cajaACuadrilatero(a.bbox_px);
    const plano = planoDe(a.id);
    if (plano === 'C' && hayC && mesa[a.id]) {
      // quadAprox: dónde caería con la homografía de la base, por si la mesa no se reconoce (con error de paralaje)
      return { id: a.id, plano: 'C', quad: mesa[a.id], quadAprox: base };
    }
    return { id: a.id, plano: plano === 'C' ? 'B' : plano, quad: base, quadAprox: null };
  });
}
