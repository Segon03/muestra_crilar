// Seguimiento entre detecciones: flujo óptico Lucas-Kanade sobre los puntos que dieron la
// homografía, más la lógica de qué detecciones se aceptan y cuándo se pierde un plano.
import { multiplicar, cuadrilateroValido, proyectarCuadrilatero, distanciaHomografias, ESQUINAS } from './geometria.js';
import { MIN_INLIERS, MIN_DEBIL } from './vision.js';

const MIN_PUNTOS = 10;          // por debajo de esto el plano se da por perdido
const UMBRAL_PASO = 3.0;        // px, RANSAC de cada paso de seguimiento
const CONFIRMAR_MS = 1500;      // una detección débil sin confirmar se descarta pasado este tiempo
const OBJETIVO_PUNTOS = 80;     // si quedan menos puntos que esto se agregan otros dentro del plano
const MAX_SALTO = 0.25;         // un paso que mueve las esquinas del plano más que esta fracción del ancho se rechaza
const COMPATIBLE = 0.08;        // fracción del ancho: dos homografías "coinciden" si sus esquinas están más cerca

export class Seguidor {
  constructor(cv) {
    this.cv = cv;
    this.ventana = new cv.Size(21, 21);
    this.criterio = new cv.TermCriteria(cv.TermCriteria_EPS | cv.TermCriteria_COUNT, 20, 0.03);
  }

  gris(imageData) {
    const cv = this.cv;
    const rgba = cv.matFromImageData(imageData);
    const g = new cv.Mat();
    cv.cvtColor(rgba, g, cv.COLOR_RGBA2GRAY);
    rgba.delete();
    return g;
  }

  // Sigue `pts` (xy planos) de `prev` a `cur`. Devuelve {H (9, prev->cur), pts (en cur)} o null.
  paso(prev, cur, pts) {
    const cv = this.cv;
    const n = pts.length / 2;
    if (n < MIN_PUNTOS) return null;
    const p0 = cv.matFromArray(n, 1, cv.CV_32FC2, Array.from(pts));
    const p1 = new cv.Mat(), est = new cv.Mat(), err = new cv.Mat();
    let res = null;
    try {
      cv.calcOpticalFlowPyrLK(prev, cur, p0, p1, est, err, this.ventana, 3, this.criterio);
      const a = [], b = [];
      for (let i = 0; i < n; i++) {
        if (!est.data[i]) continue;
        a.push(pts[2 * i], pts[2 * i + 1]);
        b.push(p1.data32F[2 * i], p1.data32F[2 * i + 1]);
      }
      const m = a.length / 2;
      if (m >= MIN_PUNTOS) {
        const A = cv.matFromArray(m, 1, cv.CV_32FC2, a);
        const B = cv.matFromArray(m, 1, cv.CV_32FC2, b);
        const mask = new cv.Mat();
        const H = cv.findHomography(A, B, cv.RANSAC, UMBRAL_PASO, mask, 1000, 0.99);
        if (H && H.rows === 3) {
          const buenos = [];
          for (let i = 0; i < m; i++) if (mask.data[i]) buenos.push(b[2 * i], b[2 * i + 1]);
          if (buenos.length / 2 >= MIN_PUNTOS) res = { H: Array.from(H.data64F), pts: Float32Array.from(buenos) };
        }
        if (H) H.delete();
        A.delete(); B.delete(); mask.delete();
      }
    } finally {
      p0.delete(); p1.delete(); est.delete(); err.delete();
    }
    return res;
  }
}

// Puntos nuevos para seguir dentro del plano proyectado (esquinas de Shi-Tomasi), lejos de los que ya hay.
function reponer(cv, gris, plano, H, pts) {
  const q = proyectarCuadrilatero(H, ESQUINAS[plano]);
  const mascara = cv.Mat.zeros(gris.rows, gris.cols, cv.CV_8UC1);
  const poli = cv.matFromArray(4, 1, cv.CV_32SC2, q.flat().map(Math.round));
  const esq = new cv.Mat();
  const nuevos = [];
  try {
    cv.fillConvexPoly(mascara, poli, new cv.Scalar(255));
    cv.goodFeaturesToTrack(gris, esq, 150, 0.01, 7, mascara, 3, false, 0.04);
    for (let i = 0; i < esq.rows; i++) {
      const x = esq.data32F[2 * i], y = esq.data32F[2 * i + 1];
      let lejos = true;
      for (let j = 0; j < pts.length; j += 2) if (Math.abs(pts[j] - x) < 6 && Math.abs(pts[j + 1] - y) < 6) { lejos = false; break; }
      if (lejos) nuevos.push(x, y);
    }
  } finally { mascara.delete(); poli.delete(); esq.delete(); }
  const out = new Float32Array(pts.length + nuevos.length);
  out.set(pts); out.set(nuevos, pts.length);
  return out;
}

// Estado de cada plano (A: caja, B: base): homografía vigente base->cuadro y puntos que se siguen.
export class Rastreo {
  constructor(seguidor, ancho) {
    this.seg = seguidor;
    this.ancho = ancho;
    this.planos = { A: null, B: null };
  }

  // Avanza un cuadro: sigue los puntos de cada plano de `prev` a `cur`.
  avanzar(prev, cur, ahora) {
    for (const pl of ['A', 'B']) {
      const e = this.planos[pl];
      if (!e) continue;
      const p = this.seg.paso(prev, cur, e.pts);
      if (p) {
        const H = multiplicar(p.H, e.H);
        if (this.plausible(pl, H, cur) && distanciaHomografias(pl, e.H, H) < MAX_SALTO * this.ancho) {
          e.H = H; e.pts = p.pts; e.vivo = ahora;
          if (e.pts.length / 2 < OBJETIVO_PUNTOS) e.pts = reponer(this.seg.cv, cur, pl, H, e.pts);
          continue;
        }
      }
      if (ahora - e.vivo > 300) this.planos[pl] = null; // un fallo suelto se tolera un instante
    }
    for (const pl of ['A', 'B']) {
      const e = this.planos[pl];
      if (e && !e.confirmado && ahora - e.desde > CONFIRMAR_MS) this.planos[pl] = null;
    }
  }

  plausible(pl, H, cur) {
    const q = proyectarCuadrilatero(H, ESQUINAS[pl]);
    return cuadrilateroValido(q, cur.cols, cur.rows);
  }

  // Incorpora el resultado de una detección hecha sobre `grisDet` cuando el cuadro actual es `gris`.
  recibir(det, grisDet, gris, ahora) {
    for (const pl of ['A', 'B']) {
      const r = det[pl];
      if (!r || r.inliers < MIN_DEBIL || !r.pts || r.pts.length < 2 * MIN_PUNTOS) continue;
      let H = r.H, pts = r.pts;
      if (grisDet !== gris) { // la detección es de un cuadro anterior: llevarla al actual
        const p = this.seg.paso(grisDet, gris, r.pts);
        if (!p) continue;
        H = multiplicar(p.H, r.H);
        pts = p.pts;
      }
      if (!this.plausible(pl, H, gris)) continue;
      const actual = this.planos[pl];
      const fuerte = r.inliers >= MIN_INLIERS;
      const coincide = actual && distanciaHomografias(pl, actual.H, H) < COMPATIBLE * this.ancho;
      if (fuerte || coincide) {
        this.planos[pl] = { H, pts, ref: r.ref, inliers: r.inliers, confirmado: true, desde: actual?.desde ?? ahora, vivo: ahora };
      } else {
        // detección débil sin respaldo: queda oculta hasta que otra la confirme
        this.planos[pl] = { H, pts, ref: r.ref, inliers: r.inliers, confirmado: false, desde: ahora, vivo: ahora };
      }
    }
  }

  // Homografías a mostrar: confirmadas y vistas hace poco.
  vigentes(ahora, perdidaMs) {
    const out = { A: null, B: null };
    for (const pl of ['A', 'B']) {
      const e = this.planos[pl];
      if (e && e.confirmado && ahora - e.vivo < perdidaMs) out[pl] = e.H;
    }
    return out;
  }
}
