// Worker público de recepción: solo escribe. Recibe los avisos de la app y los guarda sin IP ni ciudad.
import { leerPedido, origenPermitido, esBot, geoDe, MAX_CUERPO } from '../../compartido/validacion.js';
import { registrar } from './registro.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/e') return new Response('No encontrado', { status: 404 });

    const cors = {
      'Access-Control-Allow-Origin': env.ORIGEN_PERMITIDO || '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const origenOk = origenPermitido(request.headers.get('Origin'), env.ORIGEN_PERMITIDO);

    if (request.method === 'OPTIONS') return new Response(null, { status: origenOk ? 204 : 403, headers: origenOk ? cors : {} });
    if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });
    if (!origenOk) return new Response('Origen no permitido', { status: 403 });
    if (esBot(request.headers.get('User-Agent'))) return new Response(null, { status: 204, headers: cors });
    if (Number(request.headers.get('Content-Length') || 0) > MAX_CUERPO) return new Response('Muy grande', { status: 413, headers: cors });

    const pedido = leerPedido(await request.text());
    if (!pedido) return new Response('Pedido inválido', { status: 400, headers: cors });

    try {
      await registrar(env.DB, pedido, Math.floor(Date.now() / 1000), geoDe(request.cf));
    } catch (e) {
      console.error('registrar', e && e.message); // la app no debe notar un fallo de estadísticas
    }
    return new Response(null, { status: 204, headers: cors });
  },
};
