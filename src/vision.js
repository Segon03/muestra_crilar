// Reconocimiento de la vitrina con OpenCV.js: AKAZE sobre el cuadro reducido, emparejamiento
// contra el banco de referencias (precalculado con tools/exportar_banco.py) y homografía robusta.
import { emparejar, contarBuenos } from './emparejar.js';
import { multiplicar } from './geometria.js';

export const ANCHO_TRABAJO = 480;
export const MIN_INLIERS = 15;      // criterio del plan para dar un plano por reconocido
const UMBRAL_RANSAC = 4.0;          // px sobre el cuadro de trabajo
const MAX_PUNTOS = 800;             // mismo tope que el banco
const GRUESO = 300;                 // puntos usados en la búsqueda rápida entre vistas
const CANDIDATAS = 4;               // vistas que pasan de la búsqueda rápida al ajuste fino
const PALABRAS = 16;

export async function cargarOpenCV() {
  let c = window.cv;
  if (!c) throw new Error('No se cargó OpenCV.js');
  if (typeof c === 'function') c = await c();
  else if (typeof c.then === 'function') c = await c;
  if (!c.Mat) await new Promise((r) => { c.onRuntimeInitialized = r; });
  return c;
}

export async function cargarBanco(ruta = 'datos/banco_akaze') {
  const [meta, buf] = await Promise.all([
    fetch(`${ruta}.json`).then((r) => r.json()),
    fetch(`${ruta}.bin`).then((r) => r.arrayBuffer()),
  ]);
  const planos = meta.planos.map((p) => ({
    ref: p.ref,
    plano: p.plano,
    n: p.n,
    H: p.H, // coordenadas de vitrina_base.jpg -> coordenadas de la vista de referencia
    pts: new Float32Array(buf, p.offset, p.n * 2),
    desc: new Uint32Array(buf, p.offset + p.n * 8, p.n * PALABRAS),
  }));
  return { planos, meta };
}

export class Reconocedor {
  constructor(cv, banco) {
    this.cv = cv;
    this.banco = banco;
    this.ultimo = { A: null, B: null }; // última vista con la que se reconoció cada plano
    if (!cv.AKAZE) throw new Error('Esta compilación de OpenCV.js no incluye AKAZE');
    try { this.akaze = new cv.AKAZE(); } catch (e) { this.akaze = cv.AKAZE.create(); }
    if (this.akaze.setThreshold) this.akaze.setThreshold(0.0005);
  }

  // imageData: cuadro ya reducido a ANCHO_TRABAJO de ancho.
  describir(imageData) {
    const cv = this.cv;
    const rgba = cv.matFromImageData(imageData);
    const gris = new cv.Mat();
    cv.cvtColor(rgba, gris, cv.COLOR_RGBA2GRAY);
    const kp = new cv.KeyPointVector();
    const desc = new cv.Mat();
    const vacia = new cv.Mat();
    this.akaze.detectAndCompute(gris, vacia, kp, desc);
    const total = kp.size();
    const idx = Array.from({ length: total }, (_, i) => i);
    const resp = idx.map((i) => kp.get(i).response);
    idx.sort((a, b) => resp[b] - resp[a]);
    const n = Math.min(total, MAX_PUNTOS);
    const pts = new Float32Array(n * 2);
    const palabras = new Uint32Array(n * PALABRAS);
    const bytes = new Uint8Array(palabras.buffer);
    const ancho = desc.cols;
    for (let i = 0; i < n; i++) {
      const k = kp.get(idx[i]);
      pts[2 * i] = k.pt.x;
      pts[2 * i + 1] = k.pt.y;
      bytes.set(desc.data.subarray(idx[i] * ancho, (idx[i] + 1) * ancho), i * PALABRAS * 4);
    }
    rgba.delete(); gris.delete(); kp.delete(); desc.delete(); vacia.delete();
    return { pts, desc: palabras, n };
  }

  // Homografía entre una vista del banco y el cuadro. Devuelve {H (9), inliers} o null.
  homografia(plano, cuadro) {
    const cv = this.cv;
    const m = emparejar(plano.desc, plano.n, cuadro.desc, cuadro.n);
    const k = m.qi.length;
    if (k < 8) return null;
    const src = new Float32Array(k * 2);
    const dst = new Float32Array(k * 2);
    for (let i = 0; i < k; i++) {
      src[2 * i] = plano.pts[2 * m.qi[i]]; src[2 * i + 1] = plano.pts[2 * m.qi[i] + 1];
      dst[2 * i] = cuadro.pts[2 * m.ti[i]]; dst[2 * i + 1] = cuadro.pts[2 * m.ti[i] + 1];
    }
    const a = cv.matFromArray(k, 1, cv.CV_32FC2, Array.from(src));
    const b = cv.matFromArray(k, 1, cv.CV_32FC2, Array.from(dst));
    const mask = new cv.Mat();
    let H = null;
    try { H = cv.findHomography(a, b, cv.RANSAC, UMBRAL_RANSAC, mask, 2000, 0.995); } catch (e) { H = null; }
    let res = null;
    if (H && H.rows === 3 && H.cols === 3) {
      let inl = 0;
      for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) inl++;
      res = { H: Array.from(H.data64F), inliers: inl };
    }
    a.delete(); b.delete(); mask.delete(); if (H) H.delete();
    return res;
  }

  // Reconoce los dos planos en un cuadro. Devuelve {A, B} con {H (base->cuadro), inliers, ref}.
  detectar(imageData) {
    const cuadro = this.describir(imageData);
    const salida = { A: null, B: null, puntos: cuadro.pts, n: cuadro.n };
    for (const pl of ['A', 'B']) salida[pl] = this.detectarPlano(pl, cuadro);
    return salida;
  }

  detectarPlano(pl, cuadro) {
    const vistas = this.banco.planos.filter((p) => p.plano === pl);
    const probar = (p) => {
      const r = this.homografia(p, cuadro);
      return r && { H: multiplicar(r.H, p.H), inliers: r.inliers, ref: p.ref };
    };
    // 1) si ya estaba reconocido, probar primero con la misma vista (barato)
    const previa = this.ultimo[pl];
    let mejor = null;
    if (previa) {
      mejor = probar(previa);
      if (mejor && mejor.inliers >= MIN_INLIERS) return mejor;
    }
    // 2) búsqueda rápida entre todas las vistas con los puntos más fuertes
    const nq = Math.min(cuadro.n, GRUESO);
    const pun = vistas
      .filter((p) => p !== previa)
      .map((p) => ({ p, c: contarBuenos(p.desc, Math.min(p.n, GRUESO), cuadro.desc, nq) }))
      .filter((x) => x.c >= 4)
      .sort((a, b) => b.c - a.c)
      .slice(0, CANDIDATAS);
    // 3) ajuste fino con las mejores candidatas
    let mejorP = previa;
    for (const { p } of pun) {
      const r = probar(p);
      if (r && (!mejor || r.inliers > mejor.inliers)) { mejor = r; mejorP = p; }
    }
    this.ultimo[pl] = mejor && mejor.inliers >= MIN_INLIERS ? mejorP : null;
    return mejor;
  }
}
