// Simula la app (detección con latencia + seguimiento) en Node sobre video_muestra2.mp4 y mide el IoU
// contra las cajas anotadas en los cuadros anotados. Necesita ffmpeg. Uso: node tests/seguimiento_node.cjs [fps] [cada] [latencia]
//   fps: cuadros por segundo simulados (15), cada: una detección cada N cuadros (4), latencia: cuadros que tarda en llegar (2)
global.self = global;
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const raiz = path.join(__dirname, '..');
const cv = require(path.join(raiz, 'vendor/opencv/opencv.js'));
const FPS = Number(process.argv[2] || 15), CADA = Number(process.argv[3] || 4), LAT = Number(process.argv[4] || 2);
const W = 480, H = 854, TAM = W * H * 4;

(async () => {
  const { Reconocedor, umbralFuerte } = await import(path.join(raiz, 'src/vision.js'));
  const { Seguidor, Rastreo } = await import(path.join(raiz, 'src/seguimiento.js'));
  const { proyectarCuadrilatero, cuadrilateroValido } = await import(path.join(raiz, 'src/geometria.js'));
  await new Promise((r) => { if (cv.Mat) r(); else cv.onRuntimeInitialized = r; });
  cv.then = undefined;
  const meta = JSON.parse(fs.readFileSync(path.join(raiz, 'datos/banco_akaze.json')));
  const b = fs.readFileSync(path.join(raiz, 'datos/banco_akaze.bin'));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  const planos = meta.planos.map((p) => ({ ref: p.ref, plano: p.plano, n: p.n, H: p.H, pts: new Float32Array(buf, p.offset, p.n * 2), desc: new Uint32Array(buf, p.offset + p.n * 8, p.n * 16) }));
  const rec = new Reconocedor(cv, { planos });
  const { Verificador } = await import(path.join(raiz, 'src/verificacion.js'));
  if (!process.env.SIN_VERIFICACION) rec.verificador = new Verificador(cv, new Uint8Array(fs.readFileSync(path.join(raiz, 'datos/base_gris.bin'))), JSON.parse(fs.readFileSync(path.join(raiz, 'referencias/areas_poligonos.json'))).poligonos);
  const seg = new Seguidor(cv), ras = new Rastreo(seg, W);
  const { armarAreas } = await import(path.join(raiz, 'src/areas.js'));
  const polis = JSON.parse(fs.readFileSync(path.join(raiz, 'referencias/areas_poligonos.json')));
  const bancoC = meta.planos.some((p) => p.plano === 'C' && p.ref === 'foto7.jpeg');
  const areas = armarAreas(JSON.parse(fs.readFileSync(path.join(raiz, 'referencias/areas.json'))), polis, bancoC);
  const gt = JSON.parse(fs.readFileSync(path.join(raiz, 'tests/gt_video_muestra2.json')));
  const gtPorCuadro = new Map(gt.cuadros.map((c) => [Math.round((c.frame / 30) * FPS), c]));
  const iou = (a, b2) => { const ix = Math.max(0, Math.min(a[2], b2[2]) - Math.max(a[0], b2[0])), iy = Math.max(0, Math.min(a[3], b2[3]) - Math.max(a[1], b2[1])); const i = ix * iy; const u = (a[2] - a[0]) * (a[3] - a[1]) + (b2[2] - b2[0]) * (b2[3] - b2[1]) - i; return u > 0 ? i / u : 0; };

  const ff = spawn('ffmpeg', ['-v', 'error', '-i', path.join(raiz, 'referencias/pruebas/video_muestra2.mp4'), '-vf', `fps=${FPS}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
  let resto = Buffer.alloc(0), i = 0, prev = null, pendientes = [];
  const res = { seg: [], sin: [] };
  const medir = (c, homografias, destino) => {
    for (const a of areas) {
      const g = c.cajas[a.id]; if (!g) continue;
      let Hh = homografias[a.plano], base = a.quad;
      if (!Hh && a.plano === 'C' && homografias.B) { Hh = homografias.B; base = a.quadAprox; } // como la app: mesa sin reconocer -> base
      let v = 0, proy = 0;
      if (Hh && base) { const q = proyectarCuadrilatero(Hh, base); if (cuadrilateroValido(q, W, H)) { proy = 1; const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); v = iou([Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(W, Math.max(...xs)), Math.min(H, Math.max(...ys))], g); } }
      destino.push({ v, proy, id: a.id });
    }
  };
  let tTrack = 0, nTrack = 0, tDet = 0, nDet = 0;
  const procesar = (frame) => {
    const ahora = (i / FPS) * 1000;
    const img = { data: new Uint8ClampedArray(frame.buffer.slice(frame.byteOffset, frame.byteOffset + TAM)), width: W, height: H };
    const gris = seg.gris(img);
    let t0 = Date.now();
    if (prev) ras.avanzar(prev, gris, ahora);
    tTrack += Date.now() - t0; nTrack++;
    // detección: empieza en este cuadro y llega LAT cuadros después
    if (i % CADA === 0) { t0 = Date.now(); const det = rec.detectar(img); tDet += Date.now() - t0; nDet++; pendientes.push({ llega: i + LAT, det, gris: gris.clone() }); }
    for (const p of pendientes.filter((p) => p.llega <= i)) { ras.recibir(p.det, p.gris, gris, ahora); p.gris.delete(); }
    pendientes = pendientes.filter((p) => p.llega > i);
    const c = gtPorCuadro.get(i);
    if (c) {
      medir(c, ras.vigentes(ahora, 500), res.seg);
      // referencia: detección directa sobre este cuadro, sin seguimiento (como la Fase 2)
      rec.ultimo = { A: null, B: null };
      const d = rec.detectar(img);
      medir(c, { A: d.A && d.A.inliers >= umbralFuerte('A') ? d.A.H : null, B: d.B && d.B.inliers >= umbralFuerte('B') ? d.B.H : null, C: d.C && d.C.inliers >= umbralFuerte('C') ? d.C.H : null }, res.sin);
    }
    if (prev) prev.delete();
    prev = gris; i++;
  };
  ff.stdout.on('data', (d) => {
    resto = Buffer.concat([resto, d]);
    while (resto.length >= TAM) { procesar(resto.subarray(0, TAM)); resto = resto.subarray(TAM); }
  });
  ff.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((r) => ff.on('close', r));
  const resumen = (v) => `proyectadas ${(100 * v.filter((x) => x.proy).length / v.length).toFixed(1)}%  IoU medio ${(v.reduce((s, x) => s + x.v, 0) / v.length).toFixed(2)}  IoU>=0.5 ${(100 * v.filter((x) => x.v >= 0.5).length / v.length).toFixed(1)}%  (${v.length} cajas)`;
  { const por = {}; for (const x of res.seg) (por[x.id] = por[x.id] || []).push(x); const f = Object.keys(por).sort().map((id) => { const pr = por[id].filter((x) => x.proy); return `${id.slice(0, 2)}:${pr.length ? (pr.reduce((a, x) => a + x.v, 0) / pr.length).toFixed(2) : '-'}`; }); console.log('IoU medio por área (cuando se proyecta):', f.join('  ')); }
  console.log(`cuadros: ${i}  fps simulados: ${FPS}  detección cada ${CADA}, latencia ${LAT}`);
  console.log('con seguimiento :', resumen(res.seg));
  console.log('detección sola  :', resumen(res.sin));
  console.log(`seguimiento: ${(tTrack / nTrack).toFixed(1)} ms por cuadro   detección: ${(tDet / nDet).toFixed(0)} ms`);
  process.exit(0);
})().catch((e) => { console.log('ERR', String((e && e.stack) || e).slice(0, 600)); process.exit(1); });
