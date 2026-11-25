// Estadísticas de uso anónimas: cuántas visitas, cuánto tiempo se queda cada una y cuándo. Ver PLAN_ESTADISTICAS.md.
// No guarda datos personales: usa dos identificadores al azar guardados en el propio celular y nunca envía imágenes de la cámara.
// Cualquier fallo se ignora: las estadísticas no pueden afectar a la app.
import { ENDPOINT_ESTADISTICAS } from './estadisticas-config.js';

const INTERVALO_MS = 15000; // aviso de "sigue acá" mientras la página está visible
const INACTIVIDAD_MS = 30 * 60 * 1000; // pasado este tiempo sin avisos, se considera una visita nueva

function azar() {
  try { return crypto.randomUUID(); } catch { /* navegador viejo */ }
  return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('-');
}
function leer(almacen, clave) { try { return almacen.getItem(clave); } catch { return null; } }
function guardar(almacen, clave, valor) { try { almacen.setItem(clave, valor); } catch { /* modo privado */ } }

// ¿Corresponde contar esta visita?
export function debeContar({ endpoint, demo, debug, host, marcaExcluir }) {
  if (!endpoint) return false;
  if (demo || debug) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false;
  if (marcaExcluir === '1') return false;
  return true;
}

// Identificador de la visita: se mantiene en la pestaña y se renueva si pasó mucho tiempo sin actividad.
export function idDeVisita(almacen, ahora) {
  const sid = leer(almacen, 'crilar_sid'), ultimo = Number(leer(almacen, 'crilar_t'));
  if (sid && ahora - ultimo < INACTIVIDAD_MS) return sid;
  const nuevo = azar();
  guardar(almacen, 'crilar_sid', nuevo);
  return nuevo;
}

export function iniciarEstadisticas({ demo = false, debug = false, endpoint = ENDPOINT_ESTADISTICAS, win = window } = {}) {
  try {
    const local = (() => { try { return win.localStorage; } catch { return null; } })() || { getItem: () => null, setItem() {} };
    const sesion = (() => { try { return win.sessionStorage; } catch { return null; } })() || { getItem: () => null, setItem() {} };
    const params = new URLSearchParams(win.location.search);
    // ?sinstats=1 marca este equipo para no contarlo nunca (pruebas del equipo); ?sinstats=0 lo desmarca
    if (params.has('sinstats')) guardar(local, 'crilar_sinstats', params.get('sinstats') === '0' ? '0' : '1');
    if (!debeContar({ endpoint, demo, debug, host: win.location.hostname, marcaExcluir: leer(local, 'crilar_sinstats') })) return false;

    let vid = leer(local, 'crilar_vid');
    if (!vid) { vid = azar(); guardar(local, 'crilar_vid', vid); }
    let sid = idDeVisita(sesion, Date.now());

    const enviar = (t, beacon = false) => {
      try {
        guardar(sesion, 'crilar_t', String(Date.now()));
        const cuerpo = JSON.stringify({ t, s: sid, v: vid });
        if (beacon && win.navigator && win.navigator.sendBeacon) {
          win.navigator.sendBeacon(endpoint, new win.Blob([cuerpo], { type: 'text/plain' }));
        } else {
          win.fetch(endpoint, { method: 'POST', body: cuerpo, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors', credentials: 'omit' }).catch(() => {});
        }
      } catch { /* se ignora */ }
    };
    const latido = () => {
      const actual = idDeVisita(sesion, Date.now());
      if (actual !== sid) { sid = actual; enviar('i'); } else enviar('l');
    };

    const doc = win.document;
    enviar('i');
    win.setInterval(() => { if (doc.visibilityState === 'visible') latido(); }, INTERVALO_MS);
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') latido(); else enviar('l', true); });
    win.addEventListener('pagehide', () => enviar('l', true));

    const aviso = doc.getElementById('aviso-estadisticas');
    if (aviso) aviso.hidden = false;
    return true;
  } catch {
    return false;
  }
}
