// Funciones geométricas puras (sin OpenCV): homografías 3x3 como arreglos de 9 números por filas.

export function multiplicar(A, B) {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
    }
  }
  return C;
}

export function aplicar(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function cajaACuadrilatero(b) {
  return [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]];
}

export function proyectarCuadrilatero(H, quad) {
  return quad.map(([x, y]) => aplicar(H, x, y));
}

export function areaPoligono(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// Convexo, sin vértices inválidos y de tamaño razonable respecto del cuadro.
export function cuadrilateroValido(q, ancho, alto) {
  if (!q.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return false;
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cruz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cruz > 0) pos++; else if (cruz < 0) neg++;
  }
  if (pos !== 4 && neg !== 4) return false;
  const area = areaPoligono(q);
  return area > 0.0005 * ancho * alto && area < 20 * ancho * alto;
}

// Punto dentro de un polígono convexo.
export function contiene(poli, x, y) {
  let signo = 0;
  for (let i = 0; i < poli.length; i++) {
    const [x1, y1] = poli[i];
    const [x2, y2] = poli[(i + 1) % poli.length];
    const c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (c !== 0) {
      const s = c > 0 ? 1 : -1;
      if (signo === 0) signo = s; else if (s !== signo) return false;
    }
  }
  return true;
}

export function planoDe(id) {
  return id.startsWith('01_') ? 'A' : 'B';
}
