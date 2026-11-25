// Worker del panel: solo lee. Todo pedido pasa primero por la verificación del token de Cloudflare Access.
import { verificarAccess } from '../../compartido/access.js';

const SIN_CACHE = { 'Cache-Control': 'no-store' };
const MAX_FILAS = 100000;
const MAX_RANGO_S = 400 * 86400;

function respuesta(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SIN_CACHE } });
}

export async function visitas(url, env, ahora = Math.floor(Date.now() / 1000)) {
  let hasta = parseInt(url.searchParams.get('hasta'), 10);
  let desde = parseInt(url.searchParams.get('desde'), 10);
  if (!Number.isFinite(hasta)) hasta = ahora + 1;
  if (!Number.isFinite(desde)) desde = hasta - 7 * 86400;
  if (desde >= hasta || hasta - desde > MAX_RANGO_S) return respuesta({ error: 'rango inválido' }, 400);
  const { results } = await env.DB
    .prepare('SELECT visitante AS v, inicio AS i, ultimo AS u, pais AS p, provincia AS r FROM visitas WHERE inicio >= ?1 AND inicio < ?2 ORDER BY inicio LIMIT ?3')
    .bind(desde, hasta, MAX_FILAS + 1)
    .all();
  const truncado = results.length > MAX_FILAS;
  return respuesta({ desde, hasta, ahora, truncado, filas: truncado ? results.slice(0, MAX_FILAS) : results });
}

export default {
  async fetch(request, env) {
    const acceso = await verificarAccess(request, env);
    if (!acceso.ok) return new Response('Acceso denegado', { status: 403, headers: SIN_CACHE });
    const url = new URL(request.url);
    if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: SIN_CACHE });
    if (url.pathname === '/api/visitas') return visitas(url, env);
    if (url.pathname === '/api/yo') return respuesta({ email: acceso.email });
    return env.ASSETS.fetch(request);
  },
};
