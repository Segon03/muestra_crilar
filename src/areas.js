// Arma la lista de áreas con el cuadrilátero que corresponde a cada plano.
//   A: caja de la pared · B: plataforma blanca con las tarjetas · C: mesa de madera (nido, nidos de
//   barro, rama). B y A usan coordenadas de la foto base; C usa las de su propia foto de referencia.
import { cajaACuadrilatero, planoDe, proyectarCuadrilatero, cuadrilateroValido, interseccionConvexa, areaPoligono } from './geometria.js';
import { solapeMesaConTarjetas, SOLAPE_MAX, anisotropia, ANISOTROPIA_MAX, TAMANO_MAX } from './consistencia.js';

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

// Cuadriláteros que se dibujan en un cuadro, con las reglas de coherencia entre planos.
//   H: homografías vigentes {A, B, C}. Devuelve {quads: {id: {q, aprox}}, descartarC}.
//   descartarC: la alineación de la mesa se superpone con las tarjetas y hay que olvidarla.

export function calcularQuads(areas, H, ancho, alto) {
  const solape = solapeMesaConTarjetas(areas, H, ancho, alto);
  const descartarC = solape > SOLAPE_MAX;
  const Hs = descartarC ? { ...H, C: null } : H;
  // escala de referencia: una tarjeta (Himenópteros) con la homografía de la base
  const tarjeta = areas.find((a) => a.plano === 'B' && a.id.startsWith('04'));
  const qt = tarjeta && Hs.B ? proyectarCuadrilatero(Hs.B, tarjeta.quad) : null;
  const escalaTarjeta = qt && cuadrilateroValido(qt, ancho, alto) ? Math.sqrt(areaPoligono(qt)) : null;
  const proyectar = (h, base, plano) => {
    if (!h || !base) return null;
    const q = proyectarCuadrilatero(h, base);
    if (!cuadrilateroValido(q, ancho, alto)) return null;
    if (plano === 'C') {
      if (anisotropia(base, q) > ANISOTROPIA_MAX) return null; // mesa muy estirada: no es fiable
      if (escalaTarjeta && Math.sqrt(areaPoligono(q)) > TAMANO_MAX * escalaTarjeta) return null; // enorme frente a las tarjetas
    }
    return q;
  };
  const quads = {};
  for (const a of areas) {
    let aprox = false;
    let q = proyectar(Hs[a.plano], a.quad, a.plano);
    if (!q && a.plano === 'C') { q = proyectar(Hs.B, a.quadAprox, 'B'); aprox = !!q; } // mesa sin reconocer o inservible: se estima con la base
    if (q) quads[a.id] = { q, aprox };
  }
  return { quads, descartarC, solape };
}
