// Comprobación de la base (plano B): lleva el cuadro al espacio de la foto base con la homografía
// obtenida y compara los bordes con los de la foto base dentro de las tarjetas (áreas 02 a 07).
// Los paneles se parecen entre sí y una homografía corrida un panel puede juntar 20 o más
// coincidencias; el parecido de bordes es alto cuando la alineación es buena y casi nulo cuando
// está corrida. (Mismos parámetros que el prototipo de Python.)
export const ESCALA = 0.25;        // la foto base se reduce a 400x300
export const ANCHO = 400, ALTO = 300;
export const NCC_MIN = { B: 0.2 }; // por debajo, la alineación del plano se descarta
// zonas que se comparan en cada plano (prefijos de id de área)
const ZONAS = { B: ['02', '03', '04', '05', '06', '07'] };

export class Verificador {
  // baseGris: bytes 400x300; poligonos: {id: [[x,y]x4]} de referencias/areas_poligonos.json
  constructor(cv, baseGris, poligonos) {
    this.cv = cv;
    const base = new cv.Mat(ALTO, ANCHO, cv.CV_8UC1);
    base.data.set(baseGris);
    this.bordesBase = this.bordes(base);
    base.delete();
    this.mascaras = {};
    for (const [pl, zonas] of Object.entries(ZONAS)) {
      const m = cv.Mat.zeros(ALTO, ANCHO, cv.CV_8UC1);
      for (const [id, q] of Object.entries(poligonos)) {
        if (!zonas.includes(id.slice(0, 2))) continue;
        const pts = cv.matFromArray(4, 1, cv.CV_32SC2, q.flat().map((v) => Math.round(v * ESCALA)));
        cv.fillConvexPoly(m, pts, new cv.Scalar(255));
        pts.delete();
      }
      this.mascaras[pl] = Uint8Array.from(m.data);
      m.delete();
    }
  }

  // Magnitud del gradiente suavizada de una imagen de 8 bits; devuelve Float32Array.
  bordes(gris) {
    const cv = this.cv;
    const a = new cv.Mat(), f = new cv.Mat(), gx = new cv.Mat(), gy = new cv.Mat(), mag = new cv.Mat(), sal = new cv.Mat();
    cv.GaussianBlur(gris, a, new cv.Size(0, 0), 1.2, 1.2);
    a.convertTo(f, cv.CV_32F);
    cv.Sobel(f, gx, cv.CV_32F, 1, 0);
    cv.Sobel(f, gy, cv.CV_32F, 0, 1);
    cv.magnitude(gx, gy, mag);
    cv.GaussianBlur(mag, sal, new cv.Size(0, 0), 1.0, 1.0);
    const out = Float32Array.from(sal.data32F);
    a.delete(); f.delete(); gx.delete(); gy.delete(); mag.delete(); sal.delete();
    return out;
  }

  // gris: Mat 8 bits del cuadro; H: homografía base(1600x1200) -> cuadro (9 números).
  // Devuelve el parecido de bordes (-1 a 1) o null si casi no se ve la zona de las tarjetas.
  puntaje(gris, H, plano = 'B') {
    const mascara = this.mascaras[plano];
    const cv = this.cv;
    const S = 1 / ESCALA;
    // dst (base reducida) -> src (cuadro) = H * diag(1/ESCALA, 1/ESCALA, 1)
    const M = cv.matFromArray(3, 3, cv.CV_64F, [H[0] * S, H[1] * S, H[2], H[3] * S, H[4] * S, H[5], H[6] * S, H[7] * S, H[8]]);
    const tam = new cv.Size(ANCHO, ALTO);
    const w = new cv.Mat();
    cv.warpPerspective(gris, w, M, tam, cv.INTER_LINEAR | cv.WARP_INVERSE_MAP, cv.BORDER_CONSTANT, new cv.Scalar(0));
    const uno = cv.Mat.ones(gris.rows, gris.cols, cv.CV_8UC1);
    const v = new cv.Mat();
    cv.warpPerspective(uno, v, M, tam, cv.INTER_NEAREST | cv.WARP_INVERSE_MAP, cv.BORDER_CONSTANT, new cv.Scalar(0));
    const e = this.bordes(w);
    let n = 0, total = 0, sx = 0, sy = 0;
    for (let i = 0; i < mascara.length; i++) {
      if (!mascara[i]) continue;
      total++;
      if (!v.data[i]) continue;
      n++; sx += e[i]; sy += this.bordesBase[i];
    }
    let res = null;
    if (n >= 0.2 * total) {
      const mx = sx / n, my = sy / n;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < mascara.length; i++) {
        if (!mascara[i] || !v.data[i]) continue;
        const dx = e[i] - mx, dy = this.bordesBase[i] - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
      }
      const d = Math.sqrt(sxx * syy);
      res = d > 0 ? sxy / d : 0;
    }
    M.delete(); w.delete(); uno.delete(); v.delete();
    return res;
  }
}

// Carga la foto base reducida y los polígonos y arma el verificador. Rutas absolutas.
export async function cargarVerificador(cv, urlBaseGris, urlPoligonos) {
  const [buf, pol] = await Promise.all([
    fetch(urlBaseGris).then((r) => r.arrayBuffer()),
    fetch(urlPoligonos).then((r) => r.json()),
  ]);
  return new Verificador(cv, new Uint8Array(buf), pol.poligonos);
}
