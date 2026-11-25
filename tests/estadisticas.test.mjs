// Pruebas de la recepción de estadísticas y de la verificación de Access. Uso: node tests/estadisticas.test.mjs
import assert from 'node:assert/strict';
import { idValido, leerPedido, esBot, origenPermitido, geoDe, limpiarTexto, MAX_CUERPO } from '../estadisticas/compartido/validacion.js';
import { verificarJWT, verificarAccess } from '../estadisticas/compartido/access.js';
import { registrar } from '../estadisticas/recepcion/src/registro.js';
import recepcion from '../estadisticas/recepcion/src/index.js';
import panel, { visitas } from '../estadisticas/panel/src/index.js';

const UUID1 = '3f2b8c1e-9d4a-4e7b-8a10-5c6d7e8f9a0b', UUID2 = 'a1b2c3d4-e5f6-4789-9abc-def012345678';

// ---------- validación ----------
assert.equal(idValido(UUID1), true);
assert.equal(idValido('corto'), false);
assert.equal(idValido("x'; DROP TABLE visitas;--0000"), false);
assert.equal(idValido(123), false);
assert.deepEqual(leerPedido(JSON.stringify({ t: 'i', s: UUID1, v: UUID2 })), { t: 'i', s: UUID1, v: UUID2 });
assert.equal(leerPedido(JSON.stringify({ t: 'x', s: UUID1, v: UUID2 })), null);
assert.equal(leerPedido(JSON.stringify({ t: 'l', s: 'malo', v: UUID2 })), null);
assert.equal(leerPedido('no es json'), null);
assert.equal(leerPedido(''), null);
assert.equal(leerPedido('[]'), null);
assert.equal(leerPedido('x'.repeat(MAX_CUERPO + 1)), null);
assert.equal(esBot(''), true);
assert.equal(esBot('Googlebot/2.1'), true);
assert.equal(esBot('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36'), false);
assert.equal(origenPermitido('https://segon03.github.io', 'https://segon03.github.io'), true);
assert.equal(origenPermitido('https://otro.com', 'https://segon03.github.io'), false);
assert.equal(origenPermitido(null, 'https://segon03.github.io'), false);
assert.equal(origenPermitido('https://segon03.github.io', ''), false); // sin configurar no deja pasar
assert.deepEqual(geoDe({ country: 'ar', region: 'La Rioja', city: 'La Rioja', postalCode: '5300' }), { pais: 'AR', provincia: 'La Rioja' });
assert.deepEqual(geoDe(undefined), { pais: null, provincia: null });
assert.equal(limpiarTexto('<b>Córdoba</b>'), 'bCórdoba/b'); // quita < y >
assert.equal(limpiarTexto('x'.repeat(200)).length, 60);

// ---------- registro (con una base falsa) ----------
function baseFalsa() {
  const llamadas = [];
  return { llamadas, prepare(sql) { return { bind(...args) { return { run: async () => { llamadas.push({ sql, args }); } }; } }; } };
}
let db = baseFalsa();
await registrar(db, { t: 'i', s: UUID1, v: UUID2 }, 1000, { pais: 'AR', provincia: 'La Rioja' });
assert.match(db.llamadas[0].sql, /INSERT OR IGNORE/);
assert.deepEqual(db.llamadas[0].args, [UUID1, UUID2, 1000, 'AR', 'La Rioja']);
db = baseFalsa();
await registrar(db, { t: 'l', s: UUID1, v: UUID2 }, 1015, { pais: null, provincia: null });
assert.match(db.llamadas[0].sql, /ON CONFLICT\(id\) DO UPDATE SET ultimo/);
assert.equal(db.llamadas[0].args.at(-1), 5);

// ---------- Worker de recepción ----------
const ORIGEN = 'https://segon03.github.io';
const UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36';
function pedido({ metodo = 'POST', origen = ORIGEN, ua = UA, cuerpo = JSON.stringify({ t: 'i', s: UUID1, v: UUID2 }), ruta = '/api/e' } = {}) {
  const h = {}; if (origen) h.Origin = origen; if (ua) h['User-Agent'] = ua; h['Content-Type'] = 'text/plain';
  const r = new Request('https://recepcion.ejemplo.workers.dev' + ruta, { method: metodo, headers: h, body: metodo === 'POST' ? cuerpo : undefined });
  Object.defineProperty(r, 'cf', { value: { country: 'AR', region: 'La Rioja' } });
  return r;
}
let env = { DB: baseFalsa(), ORIGEN_PERMITIDO: ORIGEN };
let r = await recepcion.fetch(pedido(), env);
assert.equal(r.status, 204); assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEN);
assert.equal(env.DB.llamadas.length, 1);
assert.deepEqual(env.DB.llamadas[0].args, [UUID1, UUID2, env.DB.llamadas[0].args[2], 'AR', 'La Rioja']);
env = { DB: baseFalsa(), ORIGEN_PERMITIDO: ORIGEN };
assert.equal((await recepcion.fetch(pedido({ origen: 'https://malo.com' }), env)).status, 403);
assert.equal((await recepcion.fetch(pedido({ origen: null }), env)).status, 403);
assert.equal((await recepcion.fetch(pedido({ cuerpo: 'basura' }), env)).status, 400);
assert.equal((await recepcion.fetch(pedido({ ruta: '/otra' }), env)).status, 404);
assert.equal((await recepcion.fetch(pedido({ metodo: 'OPTIONS' }), env)).status, 204);
assert.equal((await recepcion.fetch(pedido({ ua: 'Googlebot/2.1' }), env)).status, 204);
assert.equal(env.DB.llamadas.length, 0, 'ningún pedido inválido o de bot toca la base');
// un fallo de la base no se le nota a la app
env = { DB: { prepare() { throw new Error('caída'); } }, ORIGEN_PERMITIDO: ORIGEN };
assert.equal((await recepcion.fetch(pedido(), env)).status, 204);

// ---------- Access ----------
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const jwks = { keys: [jwk] };
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function firmar(datos, { kid = 'k1', clave = par.privateKey } = {}) {
  const cab = b64({ alg: 'RS256', kid, typ: 'JWT' }), cuerpo = b64(datos);
  const f = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(cab + '.' + cuerpo));
  return `${cab}.${cuerpo}.${Buffer.from(f).toString('base64url')}`;
}
const EQUIPO = 'crilar.cloudflareaccess.com', AUD = 'aud-123', AHORA = 2_000_000_000;
const base = { iss: `https://${EQUIPO}`, aud: [AUD], exp: AHORA + 600, email: 'segundo.nc@conicet.gov.ar' };
const opt = { equipo: EQUIPO, aud: AUD, jwks, ahora: AHORA };
assert.deepEqual(await verificarJWT(await firmar(base), opt), { ok: true, email: 'segundo.nc@conicet.gov.ar' });
assert.equal((await verificarJWT(await firmar({ ...base, exp: AHORA - 1 }), opt)).motivo, 'vencido');
assert.equal((await verificarJWT(await firmar({ ...base, aud: ['otra'] }), opt)).motivo, 'audiencia');
assert.equal((await verificarJWT(await firmar({ ...base, iss: 'https://otro.cloudflareaccess.com' }), opt)).motivo, 'emisor');
assert.equal((await verificarJWT(await firmar(base, { kid: 'desconocida' }), opt)).motivo, 'clave');
const otra = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
assert.equal((await verificarJWT(await firmar(base, { clave: otra.privateKey }), opt)).motivo, 'firma', 'firmado con otra clave');
assert.equal((await verificarJWT('a.b', opt)).ok, false);
assert.equal((await verificarJWT('', opt)).ok, false);

const buscar = async () => ({ ok: true, json: async () => jwks });
const conToken = async (t) => new Request('https://panel.ejemplo.workers.dev/api/yo', { headers: t ? { 'Cf-Access-Jwt-Assertion': t } : {} });
const sinCfg = await verificarAccess(await conToken(await firmar({ ...base, exp: Math.floor(Date.now() / 1000) + 600 })), {}, { buscar });
assert.equal(sinCfg.motivo, 'sin-configurar', 'sin configuración no deja pasar a nadie');
const envPanel = { ACCESS_TEAM_DOMAIN: EQUIPO, ACCESS_AUD: AUD };
assert.equal((await verificarAccess(await conToken(null), envPanel, { buscar })).motivo, 'sin-token');
const valido = await firmar({ ...base, exp: Math.floor(Date.now() / 1000) + 600 });
assert.equal((await verificarAccess(await conToken(valido), envPanel, { buscar })).ok, true);

// ---------- Worker del panel ----------
const filas = [{ v: UUID2, i: 1000, u: 1100, p: 'AR', r: 'La Rioja' }];
const envP = { ...envPanel, ASSETS: { fetch: async () => new Response('<html></html>') },
  DB: { prepare() { return { bind() { return { all: async () => ({ results: filas }) }; } }; } } };
r = await panel.fetch(await conToken(null), envP);
assert.equal(r.status, 403, 'sin sesión de Access no se entrega nada');
r = await visitas(new URL('https://x/api/visitas?desde=0&hasta=2000'), envP, 1500);
assert.equal(r.status, 200); assert.deepEqual((await r.json()).filas, filas);
assert.equal((await visitas(new URL('https://x/api/visitas?desde=10&hasta=5'), envP)).status, 400);
assert.equal((await visitas(new URL('https://x/api/visitas?desde=0&hasta=999999999'), envP)).status, 400);

console.log('estadisticas: todas las pruebas pasaron');
