// Verifica el token que Cloudflare Access agrega a cada pedido (encabezado Cf-Access-Jwt-Assertion).
// Falla cerrado: si falta la configuración o algo no coincide, no deja pasar.

const decodificador = new TextDecoder();

function b64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function json(s) { return JSON.parse(decodificador.decode(b64url(s))); }

export async function verificarJWT(token, { equipo, aud, jwks, ahora = Math.floor(Date.now() / 1000) }) {
  try {
    const partes = String(token).split('.');
    if (partes.length !== 3) return { ok: false, motivo: 'formato' };
    const cabecera = json(partes[0]);
    const datos = json(partes[1]);
    if (cabecera.alg !== 'RS256') return { ok: false, motivo: 'algoritmo' };
    const jwk = (jwks && jwks.keys || []).find((k) => k.kid === cabecera.kid);
    if (!jwk) return { ok: false, motivo: 'clave' };
    const clave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const firmaOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, b64url(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
    if (!firmaOk) return { ok: false, motivo: 'firma' };
    if (datos.iss !== `https://${equipo}`) return { ok: false, motivo: 'emisor' };
    const audiencias = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
    if (!audiencias.includes(aud)) return { ok: false, motivo: 'audiencia' };
    if (typeof datos.exp !== 'number' || datos.exp <= ahora) return { ok: false, motivo: 'vencido' };
    if (typeof datos.nbf === 'number' && datos.nbf > ahora + 60) return { ok: false, motivo: 'todavia-no' };
    return { ok: true, email: typeof datos.email === 'string' ? datos.email : null };
  } catch {
    return { ok: false, motivo: 'error' };
  }
}

let cache = { equipo: null, jwks: null, hasta: 0 };

async function obtenerJwks(equipo, buscar) {
  const ahora = Date.now();
  if (cache.equipo === equipo && cache.jwks && cache.hasta > ahora) return cache.jwks;
  const r = await buscar(`https://${equipo}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs ' + r.status);
  const jwks = await r.json();
  cache = { equipo, jwks, hasta: ahora + 60 * 60 * 1000 };
  return jwks;
}

export async function verificarAccess(request, env, { buscar = fetch } = {}) {
  const equipo = env && env.ACCESS_TEAM_DOMAIN, aud = env && env.ACCESS_AUD;
  if (!equipo || !aud) return { ok: false, motivo: 'sin-configurar' };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, motivo: 'sin-token' };
  try {
    return await verificarJWT(token, { equipo, aud, jwks: await obtenerJwks(equipo, buscar) });
  } catch {
    return { ok: false, motivo: 'jwks' };
  }
}
