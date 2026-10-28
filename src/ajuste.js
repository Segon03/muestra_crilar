// Ajuste fino del recuadro de la caja a su borde real en la imagen.
// La homografía da el recuadro con unos píxeles de error (el vidrio no está en el mismo plano que los
// insectos y el banco de vistas acumula error). La abertura de vidrio se ve como un borde claro contra el
// marco negro: se busca ese borde cerca de cada lado del recuadro previsto, se ajusta una recta por lado
// y las esquinas son las intersecciones. Si algo falla se devuelve null y se usa el recuadro sin ajustar.

const PASO = 0.5;       // px entre muestras a lo largo de la normal
const SEPARACION = 4;   // muestras entre los dos puntos con los que se mide el escalón (2 px)
const FRACCION_BUSQUEDA = 0.14; // alcance de la búsqueda, como fracción del lado más corto
const CONTRASTE = 14;   // salto mínimo de brillo (oscuro -> claro, hacia adentro)
const MIN_LADO = 40;    // por debajo de este tamaño el borde no se distingue

function muestrear(g, ancho, alto, x, y) {
  if (x < 0) x = 0; else if (x > ancho - 1.001) x = ancho - 1.001;
  if (y < 0) y = 0; else if (y > alto - 1.001) y = alto - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * ancho + x0;
  return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) + g[i + ancho] * (1 - fx) * fy + g[i + ancho + 1] * fx * fy;
}

// Ajusta una recta (punto + dirección) por mínimos cuadrados totales.
function ajustarRecta(pts) {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(ang), dy: Math.sin(ang) };
}

function bordeLado(g, ancho, alto, a, b, centro, R) {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  dx /= L; dy /= L;
  let nx = -dy, ny = dx;
  if ((centro[0] - (a[0] + b[0]) / 2) * nx + (centro[1] - (a[1] + b[1]) / 2) * ny < 0) { nx = -nx; ny = -ny; } // hacia adentro
  const n = Math.round((2 * R) / PASO) + 1;
  const perfil = new Float32Array(n);
  let pts = [];
  for (let k = 0; k < 17; k++) {
    const f = 0.12 + (0.76 * k) / 16;
    const px = a[0] + dx * L * f, py = a[1] + dy * L * f;
    for (let i = 0; i < n; i++) {
      const s = -R + i * PASO;
      perfil[i] = muestrear(g, ancho, alto, px + nx * s, py + ny * s);
    }
    let mejor = -1e9, im = -1;
    for (let i = 0; i + SEPARACION < n; i++) {
      const d = perfil[i + SEPARACION] - perfil[i];
      if (d > mejor) { mejor = d; im = i; }
    }
    if (mejor < CONTRASTE) continue;
    const s = -R + (im + SEPARACION / 2) * PASO;
    pts.push([px + nx * s, py + ny * s]);
  }
  if (pts.length < 6) return null;
  for (let it = 0; it < 3; it++) {
    const r = ajustarRecta(pts);
    const res = pts.map(([x, y]) => Math.abs((x - r.px) * -r.dy + (y - r.py) * r.dx));
    const orden = [...res].sort((u, v) => u - v);
    const umbral = Math.max(1.5, 2 * orden[orden.length >> 1]);
    pts = pts.filter((_, i) => res[i] < umbral);
    if (pts.length < 5) return null;
  }
  return ajustarRecta(pts);
}

function interseccion(l1, l2) {
  const det = l1.dx * -l2.dy - -l2.dx * l1.dy;
  if (Math.abs(det) < 1e-6) return null;
  const rx = l2.px - l1.px, ry = l2.py - l1.py;
  const t = (rx * -l2.dy - -l2.dx * ry) / det;
  return [l1.px + l1.dx * t, l1.py + l1.dy * t];
}

// g: Uint8Array (o similar) de brillo, ancho x alto. q: 4 esquinas [x, y] en sentido horario.
export function ajustarCuadrilatero(g, ancho, alto, q) {
  const centro = [0, 1].map((k) => q.reduce((s, p) => s + p[k], 0) / 4);
  const lados = q.map((p, i) => Math.hypot(q[(i + 1) % 4][0] - p[0], q[(i + 1) % 4][1] - p[1]));
  const menor = Math.min(...lados);
  if (menor < MIN_LADO) return null;
  const R = FRACCION_BUSQUEDA * menor;
  const rectas = q.map((p, i) => bordeLado(g, ancho, alto, p, q[(i + 1) % 4], centro, R));
  if (rectas.some((r) => !r)) return null;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = interseccion(rectas[(i + 3) % 4], rectas[i]);
    if (!p || Math.hypot(p[0] - q[i][0], p[1] - q[i][1]) > 2.2 * R) return null;
    out.push(p);
  }
  return out;
}
