// Pruebas del script de estadísticas de la app (con un navegador falso). Uso: node tests/estadisticas_cliente.test.mjs
import assert from 'node:assert/strict';
import { debeContar, idDeVisita, iniciarEstadisticas } from '../src/estadisticas.js';

const EP = 'https://recepcion.ejemplo.workers.dev/api/e';

function almacen(inicial = {}) {
  const d = { ...inicial };
  return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } };
}
function navegador({ busqueda = '', host = 'segon03.github.io', local = almacen(), sesion = almacen(), visible = true, sinBeacon = false } = {}) {
  const enviados = [], escuchas = {}, docEscuchas = {}, temporizadores = [];
  const doc = { visibilityState: visible ? 'visible' : 'hidden', getElementById: () => doc.aviso, aviso: { hidden: true },
    addEventListener: (n, f) => { docEscuchas[n] = f; } };
  const win = { location: { search: busqueda, hostname: host }, localStorage: local, sessionStorage: sesion, document: doc,
    Blob: class { constructor(p) { this.texto = p.join(''); } },
    navigator: sinBeacon ? {} : { sendBeacon: (u, b) => { enviados.push({ via: 'beacon', u, c: JSON.parse(b.texto) }); return true; } },
    fetch: (u, o) => { enviados.push({ via: 'fetch', u, c: JSON.parse(o.body), o }); return Promise.resolve({}); },
    setInterval: (f, ms) => { temporizadores.push({ f, ms }); }, addEventListener: (n, f) => { escuchas[n] = f; } };
  return { win, enviados, escuchas, docEscuchas, doc, temporizadores, local, sesion };
}

// ---------- cuándo se cuenta ----------
const ok = { endpoint: EP, demo: false, debug: false, host: 'segon03.github.io', marcaExcluir: null };
assert.equal(debeContar(ok), true);
assert.equal(debeContar({ ...ok, endpoint: '' }), false, 'sin dirección las estadísticas están apagadas');
assert.equal(debeContar({ ...ok, demo: true }), false);
assert.equal(debeContar({ ...ok, debug: true }), false);
assert.equal(debeContar({ ...ok, host: 'localhost' }), false);
assert.equal(debeContar({ ...ok, host: '127.0.0.1' }), false);
assert.equal(debeContar({ ...ok, marcaExcluir: '1' }), false);

// ---------- identificador de visita ----------
const s = almacen();
const a = idDeVisita(s, 1_000_000);
s.setItem('crilar_t', '1000000');
assert.equal(idDeVisita(s, 1_000_000 + 60_000), a, 'misma visita si hubo actividad reciente');
assert.notEqual(idDeVisita(s, 1_000_000 + 31 * 60_000), a, 'visita nueva tras 30 minutos sin actividad');

// ---------- uso normal ----------
let n = navegador();
assert.equal(iniciarEstadisticas({ endpoint: EP, win: n.win }), true);
assert.equal(n.enviados.length, 1);
assert.equal(n.enviados[0].c.t, 'i'); assert.equal(n.enviados[0].u, EP);
assert.equal(n.enviados[0].o.credentials, 'omit'); assert.equal(n.enviados[0].o.keepalive, true);
assert.match(n.enviados[0].c.s, /^[0-9a-f-]{20,40}$/); assert.match(n.enviados[0].c.v, /^[0-9a-f-]{20,40}$/);
assert.equal(Object.keys(n.enviados[0].c).sort().join(), 's,t,v', 'solo se envía tipo y los dos identificadores');
assert.equal(n.doc.aviso.hidden, false, 'se muestra el aviso de estadísticas');
assert.equal(n.temporizadores[0].ms, 15000);
n.temporizadores[0].f();
assert.equal(n.enviados[1].c.t, 'l'); assert.equal(n.enviados[1].c.s, n.enviados[0].c.s);
n.doc.visibilityState = 'hidden'; n.temporizadores[0].f();
assert.equal(n.enviados.length, 2, 'con la página oculta no hay latido');
n.docEscuchas.visibilitychange();
assert.equal(n.enviados[2].via, 'beacon', 'al ocultarse envía un último aviso con sendBeacon');
n.escuchas.pagehide();
assert.equal(n.enviados[3].via, 'beacon');
n.doc.visibilityState = 'visible'; n.docEscuchas.visibilitychange();
assert.equal(n.enviados[4].c.t, 'l');

// el visitante se recuerda entre visitas; la visita nueva tiene otro identificador
const m = navegador({ local: n.local });
iniciarEstadisticas({ endpoint: EP, win: m.win });
assert.equal(m.enviados[0].c.v, n.enviados[0].c.v);
assert.notEqual(m.enviados[0].c.s, n.enviados[0].c.s);

// ---------- exclusiones ----------
n = navegador({ busqueda: '?demo=1' }); assert.equal(iniciarEstadisticas({ demo: true, endpoint: EP, win: n.win }), false); assert.equal(n.enviados.length, 0);
n = navegador({ host: 'localhost' }); assert.equal(iniciarEstadisticas({ endpoint: EP, win: n.win }), false); assert.equal(n.enviados.length, 0);
n = navegador({ busqueda: '?sinstats=1' }); assert.equal(iniciarEstadisticas({ endpoint: EP, win: n.win }), false);
assert.equal(n.local.d.crilar_sinstats, '1');
const luego = navegador({ local: n.local }); assert.equal(iniciarEstadisticas({ endpoint: EP, win: luego.win }), false, 'el equipo queda excluido en visitas siguientes');
const quitar = navegador({ busqueda: '?sinstats=0', local: n.local }); assert.equal(iniciarEstadisticas({ endpoint: EP, win: quitar.win }), true);
n = navegador(); assert.equal(iniciarEstadisticas({ endpoint: '', win: n.win }), false); assert.equal(n.doc.aviso.hidden, true, 'apagadas: no se muestra el aviso');

// ---------- robustez ----------
const roto = { get localStorage() { throw new Error('bloqueado'); }, get sessionStorage() { throw new Error('bloqueado'); },
  location: { search: '', hostname: 'segon03.github.io' }, document: { visibilityState: 'visible', getElementById: () => null, addEventListener() {} },
  Blob: class {}, navigator: {}, fetch: () => Promise.reject(new Error('sin red')), setInterval() {}, addEventListener() {} };
assert.equal(iniciarEstadisticas({ endpoint: EP, win: roto }), true, 'sin almacenamiento sigue funcionando');
assert.equal(iniciarEstadisticas({ endpoint: EP, win: {} }), false, 'un entorno inesperado no lanza errores');

console.log('estadisticas (cliente): todas las pruebas pasaron');
