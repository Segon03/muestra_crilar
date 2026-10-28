// Pantalla principal: cámara, bucle de reconocimiento, recuadros sobre el video y ventana emergente.
import { cargarOpenCV, cargarBanco, Reconocedor, ANCHO_TRABAJO, MIN_INLIERS } from './vision.js';
import { cajaACuadrilatero, proyectarCuadrilatero, cuadrilateroValido, areaPoligono, contiene, planoDe } from './geometria.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const DEBUG = params.has('debug');
const PERDIDA_MS = 500; // se ocultan los recuadros de un plano si se pierde por más de esto

const $ = (id) => document.getElementById(id);
const video = $('video'), imagen = $('imagen'), canvas = $('overlay'), ctx = canvas.getContext('2d');
const estado = { reconocedor: null, areas: [], contenidos: {}, fuente: null, visto: { A: 0, B: 0 }, quads: {},
  puntos: null, stats: { ms: 0, fps: 0, inl: { A: 0, B: 0 }, ref: { A: '-', B: '-' }, n: 0 }, ultimaDeteccion: 0 };
window.__app = estado; // para pruebas

// ---------- carga ----------
async function iniciar() {
  if (DEMO) $('demo').hidden = false;
  if (DEBUG) $('debug').hidden = false;
  try {
    const [areas, contenidos] = await Promise.all([
      fetch('referencias/areas.json').then((r) => r.json()),
      fetch('contenido/contenidos.json').then((r) => r.json()).catch(() => ({ areas: {} })),
    ]);
    estado.areas = areas.areas.map((a) => ({ id: a.id, plano: planoDe(a.id), quad: cajaACuadrilatero(a.bbox_px) }));
    estado.contenidos = contenidos.areas || {};
    $('estado').textContent = 'Cargando visión por computadora…';
    const [cv, banco] = await Promise.all([esperarOpenCV(), cargarBanco()]);
    estado.reconocedor = new Reconocedor(cv, banco);
    $('estado').textContent = 'Listo';
    $('abrir').disabled = false;
  } catch (e) {
    console.error(e);
    $('estado').textContent = 'No se pudo cargar: ' + e.message;
  }
}

function esperarOpenCV() {
  return new Promise((resolve, reject) => {
    const probar = () => {
      if (window.cv) cargarOpenCV().then(resolve, reject);
      else setTimeout(probar, 100);
    };
    probar();
  });
}

// ---------- fuentes de imagen ----------
async function abrirCamara() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara');
  const flujo = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
  video.srcObject = flujo;
  await video.play();
  empezar(video);
}

function abrirArchivo(url, esVideo) {
  if (esVideo) {
    imagen.hidden = true; video.hidden = false;
    video.srcObject = null; video.src = url; video.loop = true; video.muted = true;
    video.onloadeddata = () => { video.play(); empezar(video); };
  } else {
    video.hidden = true; imagen.hidden = false;
    imagen.onload = () => empezar(imagen);
    imagen.src = url;
  }
}

function empezar(el) {
  estado.fuente = el;
  $('inicio').hidden = true;
  $('mensaje').hidden = false;
  ajustarCanvas();
  if (!estado.bucle) { estado.bucle = true; setTimeout(ciclo, 0); requestAnimationFrame(dibujar); }
}

const medidas = (el) => (el === video ? [video.videoWidth, video.videoHeight] : [imagen.naturalWidth, imagen.naturalHeight]);

// ---------- bucle de detección ----------
const fuera = document.createElement('canvas');
const fctx = fuera.getContext('2d', { willReadFrequently: true });

function ciclo() {
  const el = estado.fuente;
  const [vw, vh] = medidas(el);
  if (el && vw) {
    fuera.width = ANCHO_TRABAJO;
    fuera.height = Math.round((vh * ANCHO_TRABAJO) / vw);
    fctx.drawImage(el, 0, 0, fuera.width, fuera.height);
    const t0 = performance.now();
    try {
      const r = estado.reconocedor.detectar(fctx.getImageData(0, 0, fuera.width, fuera.height));
      const ahora = performance.now();
      actualizar(r, ahora, fuera.width, fuera.height);
      estado.stats.ms = ahora - t0;
      estado.stats.fps = 1000 / (ahora - (estado.ultimaDeteccion || t0 - 1));
      estado.ultimaDeteccion = ahora;
    } catch (e) {
      console.error(e);
      $('mensaje').textContent = 'Error de reconocimiento: ' + e.message;
      return;
    }
  }
  setTimeout(ciclo, 0);
}

function actualizar(r, ahora, ancho, alto) {
  estado.puntos = r.puntos;
  estado.stats.n = r.n;
  for (const pl of ['A', 'B']) {
    const res = r[pl];
    estado.stats.inl[pl] = res ? res.inliers : 0;
    estado.stats.ref[pl] = res ? res.ref : '-';
    if (!res || res.inliers < MIN_INLIERS) continue;
    let alguna = false;
    for (const a of estado.areas) {
      if (a.plano !== pl) continue;
      const q = proyectarCuadrilatero(res.H, a.quad);
      if (cuadrilateroValido(q, ancho, alto)) { estado.quads[a.id] = { q, t: ahora }; alguna = true; }
    }
    if (alguna) estado.visto[pl] = ahora;
  }
  estado.anchoCuadro = ancho;
}

// ---------- dibujo ----------
function ajustarCanvas() {
  const d = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * d);
  canvas.height = Math.round(innerHeight * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', ajustarCanvas);

// Pasa coordenadas del cuadro de trabajo a pantalla (el video se ve con object-fit: cover).
function aPantalla() {
  const [vw, vh] = medidas(estado.fuente);
  const esc = Math.max(innerWidth / vw, innerHeight / vh);
  const k = (esc * vw) / (estado.anchoCuadro || ANCHO_TRABAJO);
  const ox = (innerWidth - vw * esc) / 2, oy = (innerHeight - vh * esc) / 2;
  return ([x, y]) => [x * k + ox, y * k + oy];
}

function visibles(ahora) {
  const out = [];
  for (const a of estado.areas) {
    const e = estado.quads[a.id];
    if (e && ahora - estado.visto[a.plano] < PERDIDA_MS) out.push({ id: a.id, plano: a.plano, q: e.q });
  }
  return out;
}

const titulo = (id) => estado.contenidos[id]?.titulo || id.replace(/^\d+_/, '').replace(/_/g, ' ');

function dibujar() {
  const ahora = performance.now();
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (estado.fuente && estado.anchoCuadro) {
    const pant = aPantalla();
    const lista = visibles(ahora);
    $('mensaje').hidden = lista.length > 0;
    estado.pantalla = lista.map((v) => ({ id: v.id, poli: v.q.map(pant) }));
    for (const v of estado.pantalla) {
      const color = planoDe(v.id) === 'A' ? '#7bd88f' : '#ffc857';
      ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.fillStyle = color + '22';
      ctx.beginPath();
      v.poli.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = '600 13px system-ui, sans-serif';
      const [x, y] = v.poli[0], t = titulo(v.id), w = ctx.measureText(t).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x, y - 20, w, 20);
      ctx.fillStyle = color; ctx.fillText(t, x + 5, y - 5);
    }
    if (DEBUG && estado.puntos) {
      ctx.fillStyle = '#ff4d4d';
      for (let i = 0; i < estado.puntos.length; i += 2) {
        const [x, y] = pant([estado.puntos[i], estado.puntos[i + 1]]);
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      const s = estado.stats;
      $('debug').textContent = `puntos: ${s.n}   detección: ${s.ms.toFixed(0)} ms (${s.fps.toFixed(1)} /s)\n` +
        `plano A: ${s.inl.A} inliers  (${s.ref.A})\nplano B: ${s.inl.B} inliers  (${s.ref.B})`;
    }
  }
  requestAnimationFrame(dibujar);
}

// ---------- toque ----------
canvas.addEventListener('pointerdown', (ev) => {
  if (!estado.pantalla) return;
  const dentro = estado.pantalla.filter((v) => contiene(v.poli, ev.clientX, ev.clientY));
  if (!dentro.length) return;
  dentro.sort((a, b) => areaPoligono(a.poli) - areaPoligono(b.poli)); // el más chico gana
  abrirModal(dentro[0].id);
});

function abrirModal(id) {
  const c = estado.contenidos[id];
  $('modal-titulo').textContent = titulo(id);
  $('modal-texto').textContent = c?.texto || 'Contenido próximamente.';
  $('modal').hidden = false;
}
const cerrarModal = () => { $('modal').hidden = true; };
$('cerrar').addEventListener('click', cerrarModal);
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) cerrarModal(); });

// ---------- botones ----------
$('abrir').addEventListener('click', async () => {
  $('abrir').disabled = true;
  try { await abrirCamara(); } catch (e) {
    $('estado').textContent = e.name === 'NotAllowedError' ? 'Necesitamos permiso para usar la cámara.' : 'No se pudo abrir la cámara: ' + e.message;
    $('abrir').disabled = false;
  }
});
$('archivo').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) abrirArchivo(URL.createObjectURL(f), f.type.startsWith('video'));
});
$('demo-video').addEventListener('click', () => abrirArchivo('referencias/pruebas/video_muestra.mp4', true));
$('demo-foto').addEventListener('click', () => abrirArchivo('referencias/pruebas/foto_angulo_02.jpg', false));

iniciar();
