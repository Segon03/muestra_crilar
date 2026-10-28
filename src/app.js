// Pantalla principal: cámara, bucle de reconocimiento, recuadros sobre el video y ventana emergente.
import { cargarOpenCV, cargarBanco, Reconocedor, MIN_DEBIL } from './vision.js';
import { Seguidor, Rastreo } from './seguimiento.js';
import { abrirVentana, ventanaAbierta } from './ventana.js';
import { iniciarFondo, detenerFondo } from './fondo.js';
import { ajustarCuadrilatero } from './ajuste.js';
import { cargarVerificador } from './verificacion.js';
import { cajaACuadrilatero, proyectarCuadrilatero, cuadrilateroValido, areaPoligono, contiene, planoDe } from './geometria.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const DEBUG = params.has('debug');
const PERDIDA_MS = 500; // se ocultan los recuadros de un plano si se pierde por más de esto
const ANCHO_TRABAJO = Number(params.get('ancho')) || 640; // ancho del cuadro sobre el que se detecta y se sigue
const SUAVIZADO = 0.55; // peso del valor nuevo en el suavizado de esquinas (1 = sin suavizar)

const $ = (id) => document.getElementById(id);
const video = $('video'), imagen = $('imagen'), canvas = $('overlay'), ctx = canvas.getContext('2d');
const estado = { reconocedor: null, worker: null, rastreo: null, seguidor: null, areas: [], contenidos: {}, fuente: null,
  suave: {}, puntos: null, enVuelo: false, idEnvio: 0, grisEnviado: null, prevGris: null, anchoCuadro: ANCHO_TRABAJO,
  stats: { ms: 0, det: 0, fps: 0, n: 0, modo: '-' } };
window.__app = estado; // para pruebas

// ---------- carga ----------
async function iniciar() {
  iniciarFondo($('fondo'));
  if (DEMO) $('demo').hidden = false;
  if (DEBUG) $('debug').hidden = false;
  try {
    const [areas, poligonos, contenidos] = await Promise.all([
      fetch('referencias/areas.json').then((r) => r.json()),
      fetch('referencias/areas_poligonos.json').then((r) => r.json()).catch(() => ({ poligonos: {} })), // si falta, se usan los rectángulos
      fetch('contenido/contenidos.json').then((r) => r.json()).catch(() => ({ areas: {} })),
    ]);
    estado.areas = areas.areas.map((a) => ({ id: a.id, plano: planoDe(a.id), quad: poligonos.poligonos[a.id] || cajaACuadrilatero(a.bbox_px) }));
    estado.contenidos = contenidos.areas || {};
    $('estado').textContent = 'Cargando visión por computadora…';
    const cv = await esperarOpenCV();
    estado.seguidor = new Seguidor(cv);
    estado.rastreo = new Rastreo(estado.seguidor, ANCHO_TRABAJO);
    await iniciarDetector(cv);
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

// La detección corre en un worker; si el navegador no lo permite, se hace en el hilo principal.
const urlDatos = (ruta) => new URL(ruta, location.href).href;

async function iniciarDetector(cv) {
  const banco = new URL('datos/banco_akaze', location.href).href;
  try {
    if (params.has('sinworker')) throw new Error('sin worker (forzado)');
    const w = new Worker('src/detector.worker.js');
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('el worker no respondió')), 60000);
      w.onmessage = (e) => {
        if (e.data.tipo === 'listo') { clearTimeout(t); resolve(); }
        else if (e.data.tipo === 'error') { clearTimeout(t); reject(new Error(e.data.mensaje)); }
      };
      w.onerror = (e) => { clearTimeout(t); reject(new Error(e.message || 'error en el worker')); };
      w.postMessage({ tipo: 'init', banco, baseGris: urlDatos('datos/base_gris.bin'), poligonos: urlDatos('referencias/areas_poligonos.json') });
    });
    w.onmessage = alResultado;
    w.onerror = (e) => console.error('worker', e.message);
    estado.worker = w;
    estado.stats.modo = 'worker';
  } catch (e) {
    console.warn('Detección en el hilo principal:', e.message);
    estado.reconocedor = new Reconocedor(cv, await cargarBanco(banco));
    estado.reconocedor.verificador = await cargarVerificador(cv, urlDatos('datos/base_gris.bin'), urlDatos('referencias/areas_poligonos.json'));
    estado.stats.modo = 'principal';
  }
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
  detenerFondo($('fondo'));
  $('mensaje').hidden = false;
  ajustarCanvas();
  if (!estado.bucle) { estado.bucle = true; requestAnimationFrame(cuadro); }
}

const medidas = (el) => (el === video ? [video.videoWidth, video.videoHeight] : [imagen.naturalWidth, imagen.naturalHeight]);

// ---------- bucle principal: seguimiento en cada cuadro, detección en segundo plano ----------
const fuera = document.createElement('canvas');
const fctx = fuera.getContext('2d', { willReadFrequently: true });
let ultimoCuadro = 0;

function cuadro(ahora) {
  requestAnimationFrame(cuadro);
  const el = estado.fuente;
  const [vw, vh] = medidas(el);
  if (!vw || ahora - ultimoCuadro < 30) { return; } // como mucho ~30 cuadros por segundo
  if (ventanaAbierta()) { estado.pausado = true; return; } // con la ventana abierta no se detecta ni se sigue (ahorra batería)
  if (estado.pausado) { // al cerrar la ventana el cuadro anterior quedó viejo: se empieza de cero
    estado.pausado = false;
    estado.rastreo.planos = { A: null, B: null };
    estado.suave = {};
    estado.prevGris?.delete(); estado.prevGris = null;
  }
  try {
    fuera.width = ANCHO_TRABAJO;
    fuera.height = Math.round((vh * ANCHO_TRABAJO) / vw);
    fctx.drawImage(el, 0, 0, fuera.width, fuera.height);
    const img = fctx.getImageData(0, 0, fuera.width, fuera.height);
    const gris = estado.seguidor.gris(img);
    estado.anchoCuadro = fuera.width;
    if (estado.prevGris) estado.rastreo.avanzar(estado.prevGris, gris, ahora);

    if (estado.worker) {
      if (!estado.enVuelo) {
        estado.enVuelo = true;
        estado.grisEnviado?.delete();
        estado.grisEnviado = gris.clone();
        const copia = img.data.buffer.slice(0);
        estado.worker.postMessage({ tipo: 'cuadro', id: ++estado.idEnvio, ancho: img.width, alto: img.height, buf: copia }, [copia]);
      }
    } else if (estado.reconocedor) { // sin worker: la detección bloquea este cuadro
      const t0 = performance.now();
      const r = estado.reconocedor.detectar(img);
      estado.stats.det = performance.now() - t0;
      estado.puntos = r.puntos; estado.stats.n = r.n;
      estado.stats.ncc = r.B ? r.B.ncc : undefined; estado.stats.rechazo = r.Brechazada || null;
      estado.rastreo.recibir(r, gris, gris, ahora);
    }
    estado.prevGris?.delete();
    estado.prevGris = gris;
    estado.stats.fps = 1000 / (ahora - (ultimoCuadro || ahora - 33));
    ultimoCuadro = ahora;
    // la caja (plano A) se ajusta a su borde real; se necesita el cuadro suavizado
    estado.ajusteMat?.delete(); estado.ajusteMat = null;
    if (estado.rastreo.planos.A?.confirmado && !params.has('sinajuste')) {
      estado.ajusteMat = new estado.seguidor.cv.Mat();
      estado.seguidor.cv.GaussianBlur(gris, estado.ajusteMat, estado.seguidor.k3, 0, 0);
    }
    actualizarQuads(ahora);
    dibujar(ahora);
  } catch (e) {
    console.error(e);
    $('mensaje').hidden = false;
    $('mensaje').textContent = 'Error de reconocimiento: ' + e.message;
  }
}

function alResultado(e) {
  const m = e.data;
  if (m.tipo === 'error') { console.error('worker:', m.mensaje); estado.enVuelo = false; return; }
  if (m.tipo !== 'resultado') return;
  estado.enVuelo = false;
  if (estado.pausado || ventanaAbierta()) return; // resultado de antes de abrir la ventana
  estado.puntos = m.puntos; estado.stats.n = m.n; estado.stats.det = m.ms;
  estado.stats.ncc = m.B ? m.B.ncc : undefined; estado.stats.rechazo = m.Brechazada || null;
  if (estado.grisEnviado && estado.prevGris) estado.rastreo.recibir(m, estado.grisEnviado, estado.prevGris, performance.now());
}

// Recuadros de cada área según las homografías vigentes, con las esquinas suavizadas.
function actualizarQuads(ahora) {
  estado.stats.ajuste = '-';
  const H = estado.rastreo.vigentes(ahora, PERDIDA_MS);
  const salto = 0.1 * estado.anchoCuadro;
  for (const a of estado.areas) {
    const h = H[a.plano];
    if (!h) { delete estado.suave[a.id]; continue; }
    let q = proyectarCuadrilatero(h, a.quad);
    if (a.plano === 'A' && estado.ajusteMat) {
      const aj = ajustarCuadrilatero(estado.ajusteMat.data, estado.ajusteMat.cols, estado.ajusteMat.rows, q);
      estado.stats.ajuste = aj ? 'ok' : 'sin borde';
      if (aj) q = aj;
    }
    if (!cuadrilateroValido(q, estado.anchoCuadro, estado.anchoCuadro * 2)) { delete estado.suave[a.id]; continue; }
    const prev = estado.suave[a.id];
    const lejos = prev && q.some(([x, y], i) => Math.hypot(x - prev[i][0], y - prev[i][1]) > salto);
    estado.suave[a.id] = !prev || lejos ? q : q.map(([x, y], i) => [prev[i][0] + SUAVIZADO * (x - prev[i][0]), prev[i][1] + SUAVIZADO * (y - prev[i][1])]);
  }
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
  const k = (esc * vw) / estado.anchoCuadro;
  const ox = (innerWidth - vw * esc) / 2, oy = (innerHeight - vh * esc) / 2;
  return ([x, y]) => [x * k + ox, y * k + oy];
}

const titulo = (id) => estado.contenidos[id]?.titulo || id.replace(/^\d+_/, '').replace(/_/g, ' ');

function dibujar() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const pant = aPantalla();
  estado.pantalla = estado.areas.filter((a) => estado.suave[a.id]).map((a) => ({ id: a.id, poli: estado.suave[a.id].map(pant) }));
  $('mensaje').hidden = estado.pantalla.length > 0;
  if (!estado.pantalla.length) $('mensaje').textContent = 'Apuntá la cámara a la vitrina';
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
  if (DEBUG) {
    if (estado.puntos) {
      ctx.fillStyle = '#ff4d4d';
      for (let i = 0; i < estado.puntos.length; i += 2) {
        const [x, y] = pant([estado.puntos[i], estado.puntos[i + 1]]);
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    const s = estado.stats, p = estado.rastreo.planos;
    const fila = (pl) => (p[pl] ? `${p[pl].confirmado ? 'ok' : 'tentativo'}, ${p[pl].inliers} inliers, ${p[pl].pts.length / 2} seguidos (${p[pl].ref})` : '-');
    $('debug').textContent = `${s.modo}  ancho ${ANCHO_TRABAJO}  ${s.fps.toFixed(0)} cuadros/s\n` +
      `detección: ${s.det.toFixed(0)} ms   puntos: ${s.n}   ajuste de borde: ${s.ajuste || '-'}\nplano A: ${fila('A')}\nplano B: ${fila('B')}\n` +
      `base: parecido de bordes ${s.ncc == null ? '-' : s.ncc.toFixed(2)}${s.rechazo ? `  (última rechazada: ${s.rechazo.inliers} inliers, parecido ${s.rechazo.ncc.toFixed(2)})` : ''}`;
  }
}

// ---------- toque ----------
canvas.addEventListener('pointerdown', (ev) => {
  if (!estado.pantalla) return;
  const dentro = estado.pantalla.filter((v) => contiene(v.poli, ev.clientX, ev.clientY));
  if (!dentro.length) return;
  dentro.sort((a, b) => areaPoligono(a.poli) - areaPoligono(b.poli)); // el más chico gana
  abrirModal(dentro[0].id);
});

function abrirModal(id) { abrirVentana(id, estado.contenidos[id]); }

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
