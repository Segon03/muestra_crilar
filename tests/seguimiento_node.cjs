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
  const { calcularQuads } = await import(path.join(raiz, 'src/areas.js'));
  const { interseccionConvexa, areaPoligono } = await import(path.join(raiz, 'src/geometria.js'));
  const medir = (c, hom, destino) => {
    const homografias = hom;
    const { quads } = calcularQuads(areas, homografias, W, H * 1);
    for (const a of areas) {
      const g = c.cajas[a.id]; if (!g) continue;
      const r = quads[a.id]; let v = 0, proy = 0;
      if (r) { proy = 1; const xs = r.q.map((p) => p[0]), ys = r.q.map((p) => p[1]); v = iou([Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(W, Math.max(...xs)), Math.min(H, Math.max(...ys))], g); }
      destino.push({ v, proy, id: a.id });
    }
  };
  // coherencia visual en TODOS los cuadros: cuánto se superponen las áreas de la mesa con las tarjetas
  const vis = { cuadros: 0, conMesa: 0, solapeMedio: 0, aprox: 0, mesa: 0, areaRama: [], descartes: 0 };
  const disc = [];
  const medirVisual = (hom) => {
    if (hom.B && hom.C) {
      const card = areas.find((a) => a.id.startsWith('04')); const qc = proyectarCuadrilatero(hom.B, card.quad); const esc = Math.sqrt(areaPoligono(qc));
      for (const a of areas) { if (a.plano !== 'C' || !a.quadAprox) continue; const qb = proyectarCuadrilatero(hom.B, a.quadAprox), qq = proyectarCuadrilatero(hom.C, a.quad); const cen = (q) => [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4]; const [xb, yb] = cen(qb), [xq, yq] = cen(qq); disc.push({ id: a.id.slice(0, 2), d: Math.sqrt(areaPoligono(qq)) / esc }); }
    }
    const { quads, descartarC } = calcularQuads(areas, hom, W, H);
    if (descartarC) vis.descartes++;
    const tarjetas = areas.filter((a) => a.plano === 'B' && quads[a.id]).map((a) => quads[a.id].q);
    for (const a of areas) {
      if (a.plano !== 'C' || !quads[a.id]) continue;
      vis.mesa++; if (quads[a.id].aprox) vis.aprox++;
      const q = quads[a.id].q; const ar = areaPoligono(q);
      let t = 0; for (const b2 of tarjetas) t += areaPoligono(interseccionConvexa(q, b2));
      vis.conMesa++; vis.solapeMedio += t / ar;
      if (a.id.startsWith('11')) vis.areaRama.push(ar / (W * H));
    }
    vis.cuadros++;
  };
  const rechazos = {}; const calRech = [], calAcep = []; let nC = 0, calMin = 9;
  let tTrack = 0, nTrack = 0, tDet = 0, nDet = 0;
  const procesar = (frame) => {
    const ahora = (i / FPS) * 1000;
    const img = { data: new Uint8ClampedArray(frame.buffer.slice(frame.byteOffset, frame.byteOffset + TAM)), width: W, height: H };
    const gris = seg.gris(img);
    let t0 = Date.now();
    if (prev) ras.avanzar(prev, gris, ahora);
    if (i % 5 === 0) medirVisual(ras.vigentes(ahora, 500));
    tTrack += Date.now() - t0; nTrack++;
    // detección: empieza en este cuadro y llega LAT cuadros después
    if (i % CADA === 0) { t0 = Date.now(); const det = rec.detectar(img); if (det.rechazadas) for (const k of Object.keys(det.rechazadas)) { rechazos[k] = (rechazos[k] || 0) + 1; if (k === 'C') calRech.push(+det.rechazadas.C.ncc.toFixed(3)); } if (det.C) { nC++; if (det.C.calidez != null) { calMin = Math.min(calMin, det.C.calidez); calAcep.push(+det.C.calidez.toFixed(3)); } } tDet += Date.now() - t0; nDet++; pendientes.push({ llega: i + LAT, det, gris: gris.clone() }); }
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
  { const por = {}; for (const x of res.seg) (por[x.id] = por[x.id] || []).push(x); const f = Object.keys(por).sort().map((id) => { const pr = por[id].filter((x) => x.proy); return `${id.slice(0, 2)}:${pr.length ? (pr.reduce((a, x) => a + x.v, 0) / pr.length).toFixed(2) : '-'}(${pr.length}/${por[id].length})`; }); console.log('IoU medio por área (cuando se proyecta):', f.join('  ')); }
  { const ar = vis.areaRama.sort((x, y) => x - y); console.log(`mesa dibujada ${vis.mesa} veces (${vis.aprox} punteadas, ${vis.descartes} cuadros con la mesa descartada); superposición media con tarjetas ${(100 * vis.solapeMedio / Math.max(1, vis.conMesa)).toFixed(1)} %; recuadro de la rama: mediana ${(100 * ar[ar.length >> 1]).toFixed(1)} % del cuadro, p90 ${(100 * ar[Math.floor(ar.length * 0.9)]).toFixed(1)} %`); }
  { const por = {}; for (const x of disc) (por[x.id] = por[x.id] || []).push(x.d); for (const id of Object.keys(por)) { const v = por[id].sort((a, b) => a - b); console.log(`tamaño del recuadro de la mesa / tamaño de una tarjeta, área ${id}: n=${v.length} mediana ${v[v.length >> 1].toFixed(2)} p90 ${v[Math.floor(v.length * 0.9)].toFixed(2)} máx ${v[v.length - 1].toFixed(2)}`); } }
  console.log('calidez rechazadas:', calRech.sort((a, b) => a - b).join(' '), '\ncalidez aceptadas (menores):', calAcep.sort((a, b) => a - b).slice(0, 12).join(' '));
  console.log(`detecciones rechazadas por verificación: ${JSON.stringify(rechazos)}; mesa aceptada ${nC} veces, calidez mínima aceptada ${calMin.toFixed(3)}`);
  console.log(`cuadros: ${i}  fps simulados: ${FPS}  detección cada ${CADA}, latencia ${LAT}`);
  console.log('con seguimiento :', resumen(res.seg));
  console.log('detección sola  :', resumen(res.sin));
  console.log(`seguimiento: ${(tTrack / nTrack).toFixed(1)} ms por cuadro   detección: ${(tDet / nDet).toFixed(0)} ms`);
  process.exit(0);
})().catch((e) => { console.log('ERR', String((e && e.stack) || e).slice(0, 600)); process.exit(1); });
