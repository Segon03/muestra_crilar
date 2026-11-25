// Validaciones puras que usa el Worker de recepción. Sin dependencias, para poder probarlas en Node.

export const TOPE_PERMANENCIA_S = 3600; // una visita no cuenta más de una hora
export const MIN_ENTRE_AVISOS_S = 5; // avisos de "sigue acá" más seguidos que esto se ignoran
export const MAX_CUERPO = 512; // bytes

const RE_ID = /^[0-9a-zA-Z-]{16,40}$/;

export function idValido(x) {
  return typeof x === 'string' && RE_ID.test(x);
}

export function esBot(ua) {
  return !ua || /bot|crawl|spider|headless|lighthouse/i.test(ua);
}

export function origenPermitido(origen, permitido) {
  return typeof permitido === 'string' && permitido !== '' && origen === permitido;
}

// Devuelve { t, s, v } o null si el pedido no es válido.
export function leerPedido(texto) {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > MAX_CUERPO) return null;
  let o;
  try { o = JSON.parse(texto); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  if (o.t !== 'i' && o.t !== 'l') return null;
  if (!idValido(o.s) || !idValido(o.v)) return null;
  return { t: o.t, s: o.s, v: o.v };
}

export function limpiarTexto(x, max = 60) {
  if (typeof x !== 'string') return null;
  const t = x.replace(/[\u0000-\u001f<>"'`]/g, '').trim().slice(0, max);
  return t || null;
}

// País y provincia a partir de lo que Cloudflare agrega a la conexión (request.cf). No se guarda nada más.
export function geoDe(cf) {
  const pais = limpiarTexto(cf && cf.country, 2);
  return { pais: pais ? pais.toUpperCase() : null, provincia: limpiarTexto(cf && cf.region) };
}
