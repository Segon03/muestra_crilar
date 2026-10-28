// Reconocimiento de la vitrina con OpenCV.js: AKAZE sobre el cuadro reducido, emparejamiento
// contra el banco de referencias (precalculado con tools/exportar_banco.py) y homografía robusta.
import { emparejar, contarBuenos } from './emparejar.js';
import { multiplicar } from './geometria.js';
import { NCC_MIN } from './verificacion.js';

export const MIN_INLIERS = 15;      // criterio del plan para dar un plano por reconocido
export const MIN_B = 20;            // la base se confunde más (paneles parecidos entre sí): pide más coincidencias para darse por segura
export const MIN_DEBIL = 10;        // por debajo no se informa; entre 10 y 14 hay que confirmarlo con otra detección
const UMBRAL_RANSAC = 4.0;          // px sobre el cuadro de trabajo
const MAX_PUNTOS_BANCO = 800;       // tope de puntos por plano en el banco (ver tools/exportar_banco.py)
const MAX_PUNTOS_CUADRO = 2500;     // puntos que se calculan del cuadro (ordenados por respuesta)
const PUNTOS_NORMAL = 800;          // con esto se hace la primera pasada: más puntos diluyen la prueba de razón
const GRUESO = 300;                 // puntos usados en la búsqueda rápida entre vistas
const CANDIDATAS = 4;               // vistas que pasan de la búsqueda rápida al ajuste fino
const PALABRAS = 16;
const REFS_BASE = ['base', 'base640', 'base420']; // vistas derivadas de la foto base, a distintas escalas
const REF_MESA = 'foto7.jpeg'; // raíz del plano C: foto de la mesa tomada desde arriba

export function cargarOpenCV() {
  // En esta compilación el módulo `cv` tiene un `then` que se resuelve a sí mismo: devolverlo
  // desde una promesa (o hacerle `await`) cuelga la página en un bucle infinito. Se espera el
  // callback de inicialización y se quita el `then` antes de entregarlo.
  return new Promise((resolve, reject) => {
    const c = globalThis.cv;
    if (!c) return reject(new Error('No se cargó OpenCV.js'));
    const listo = () => { c.then = undefined; resolve(c); };
    if (c.Mat) return listo();
    c.onRuntimeInitialized = listo;
  });
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

// Los primeros `m` puntos (los de mayor respuesta) de un cuadro ya descripto.
function recortar(c, m) {
  if (c.n <= m) return c;
  return { pts: c.pts.subarray(0, 2 * m), desc: c.desc.subarray(0, m * PALABRAS), n: m };
}

// Coincidencias necesarias para dar un plano por reconocido sin esperar confirmación.
export const umbralFuerte = (pl) => (pl === 'A' ? MIN_INLIERS : MIN_B);

export class Reconocedor {
  constructor(cv, banco) {
    this.cv = cv;
    this.banco = banco;
    this.ultimo = { A: null, B: null, C: null }; // última vista con la que se reconoció cada plano
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
    const n = Math.min(total, MAX_PUNTOS_CUADRO);
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
    rgba.delete(); kp.delete(); desc.delete(); vacia.delete();
    return { pts, desc: palabras, n, gris }; // `gris` lo libera quien llama
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
      const pts = [];
      for (let i = 0; i < mask.data.length; i++) {
        if (!mask.data[i]) continue;
        inl++;
        if (pts.length < 400) pts.push(dst[2 * i], dst[2 * i + 1]); // puntos del cuadro, para seguirlos
      }
      res = { H: Array.from(H.data64F), inliers: inl, pts: Float32Array.from(pts) };
    }
    a.delete(); b.delete(); mask.delete(); if (H) H.delete();
    return res;
  }

  // Reconoce los dos planos en un cuadro. Devuelve {A, B} con {H (base->cuadro), inliers, ref, pts}.
  detectar(imageData) {
    const cuadro = this.describir(imageData);
    try {
      return this.detectarCuadro(cuadro);
    } finally {
      cuadro.gris.delete();
    }
  }

  detectarCuadro(cuadro) {
    const salida = { A: null, B: null, C: null, puntos: cuadro.pts, n: cuadro.n };
    const normal = recortar(cuadro, PUNTOS_NORMAL);
    salida.A = this.detectarPlano('A', normal, null);
    // La caja (A) se reconoce a más distancia que la base (B): la vista del banco que sirvió para A
    // es la primera candidata para B.
    const refA = salida.A && salida.A.inliers >= MIN_DEBIL ? salida.A.ref : null;
    const priori = [...new Set([refA, ...REFS_BASE].filter(Boolean))];
    salida.B = this.detectarPlano('B', normal, priori);
    // De lejos los puntos de la base son débiles y quedan fuera de los 800 más fuertes: segunda
    // pasada de B con todos los puntos del cuadro.
    if ((!salida.B || salida.B.inliers < MIN_B) && cuadro.n > PUNTOS_NORMAL) {
      const r = this.detectarPlano('B', cuadro, priori);
      if (r && (!salida.B || r.inliers > salida.B.inliers)) salida.B = r;
    }
    // La mesa de madera (C): misma estrategia, con la vista que sirvió para la base como candidata.
    const refB = salida.B ? salida.B.ref : refA;
    const prioriC = [...new Set([REF_MESA, refB, refA].filter(Boolean))];
    salida.C = this.detectarPlano('C', normal, prioriC);
    if ((!salida.C || salida.C.inliers < MIN_B) && cuadro.n > PUNTOS_NORMAL) {
      const r = this.detectarPlano('C', cuadro, prioriC);
      if (r && (!salida.C || r.inliers > salida.C.inliers)) salida.C = r;
    }
    // Comprobación de la base y de la mesa: si los bordes no coinciden con los de la foto base, la
    // alineación está corrida (paneles repetidos) y se descarta aunque tenga muchas coincidencias.
    if (this.verificador) {
      for (const pl of ['B']) { // la mesa (C) usa otra foto de referencia: sin comprobación por bordes
        const r = salida[pl];
        if (!r) continue;
        const ncc = this.verificador.puntaje(cuadro.gris, r.H, pl);
        r.ncc = ncc;
        if (ncc !== null && ncc < NCC_MIN[pl]) {
          this.ultimo[pl] = null;
          (salida.rechazadas = salida.rechazadas || {})[pl] = { inliers: r.inliers, ncc };
          salida[pl] = null;
        }
      }
    }
    return salida;
  }

  detectarPlano(pl, cuadro, refPrior) {
    const vistas = this.banco.planos.filter((p) => p.plano === pl);
    const probar = (p) => {
      const r = this.homografia(p, cuadro);
      return r && { H: multiplicar(r.H, p.H), inliers: r.inliers, ref: p.ref, pts: r.pts };
    };
    // 1) si ya estaba reconocido, probar primero con la misma vista (barato)
    const previa = this.ultimo[pl];
    let mejor = null, mejorP = previa;
    if (previa) {
      mejor = probar(previa);
      if (mejor && mejor.inliers >= umbralFuerte(pl)) return mejor;
    }
    // 1b) vistas prioritarias (la que sirvió para el otro plano y la foto base a varias escalas)
    for (const ref of refPrior || []) {
      if (mejor && mejor.inliers >= umbralFuerte(pl)) break;
      const v = vistas.find((p) => p.ref === ref && p !== previa);
      const r = v && probar(v);
      if (r && (!mejor || r.inliers > mejor.inliers)) { mejor = r; mejorP = v; }
    }
    if (mejor && mejor.inliers >= umbralFuerte(pl)) { this.ultimo[pl] = mejorP; return mejor; }
    // 2) búsqueda rápida entre todas las vistas con los puntos más fuertes
    const nq = Math.min(cuadro.n, GRUESO);
    const pun = vistas
      .filter((p) => p !== previa)
      .map((p) => ({ p, c: contarBuenos(p.desc, Math.min(p.n, GRUESO), cuadro.desc, nq) }))
      .filter((x) => x.c >= 4)
      .sort((a, b) => b.c - a.c)
      .slice(0, CANDIDATAS);
    // 3) ajuste fino con las mejores candidatas
    for (const { p } of pun) {
      const r = probar(p);
      if (r && (!mejor || r.inliers > mejor.inliers)) { mejor = r; mejorP = p; }
    }
    this.ultimo[pl] = mejor && mejor.inliers >= MIN_DEBIL ? mejorP : null;
    return mejor;
  }
}
