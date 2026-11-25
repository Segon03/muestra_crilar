// Prueba de punta a punta de las estadísticas en un navegador: la app, servida como si fuera https://segon03.github.io,
// envía el aviso de ingreso y el último aviso al ocultarse, muestra el aviso de privacidad y no cuenta el modo demo.
// Uso: NODE_PATH=$(npm root -g) node tests/e2e_estadisticas.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const BASE = 'https://segon03.github.io/muestra_crilar/';
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.bin': 'application/octet-stream', '.mp4': 'video/mp4', '.wasm': 'application/wasm' };

async function preparar(b, { conEndpoint }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 } });
  const avisos = [];
  await ctx.route('https://recepcion.test/**', (r) => {
    const q = r.request();
    if (q.method() === 'POST') avisos.push({ cuerpo: JSON.parse(q.postData()), origen: q.headers()['origin'] });
    r.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } });
  });
  await ctx.route(BASE + '**', (r) => {
    const rel = new URL(r.request().url()).pathname.replace('/muestra_crilar/', '') || 'index.html';
    if (rel === 'src/estadisticas-config.js') return r.fulfill({ contentType: 'text/javascript', body: `export const ENDPOINT_ESTADISTICAS = '${conEndpoint ? 'https://recepcion.test/api/e' : ''}';` });
    const f = path.join(RAIZ, rel === '' ? 'index.html' : rel);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ contentType: TIPOS[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  return { ctx, avisos };
}

(async () => {
  const b = await chromium.launch(); let fallos = 0;
  const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALLA'), m); if (!c) fallos++; };

  // 1) con la dirección configurada: cuenta
  let { ctx, avisos } = await preparar(b, { conEndpoint: true });
  let p = await ctx.newPage(); const errores = []; p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(BASE); await p.waitForFunction(() => document.getElementById('estado').textContent === 'Listo', null, { timeout: 60000 });
  await p.waitForFunction(() => !document.getElementById('aviso-estadisticas').hidden, null, { timeout: 5000 });
  ok(avisos.length === 1 && avisos[0].cuerpo.t === 'i', 'al abrir envía un aviso de ingreso (t=i)');
  ok(avisos[0] && avisos[0].origen === 'https://segon03.github.io', 'el aviso sale con el origen de la página');
  ok(avisos[0] && Object.keys(avisos[0].cuerpo).sort().join() === 's,t,v', 'solo viaja tipo y dos identificadores');
  ok(await p.evaluate(() => !document.getElementById('aviso-estadisticas').hidden), 'se muestra el aviso de estadísticas anónimas');
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(500);
  ok(avisos.length === 2 && avisos[1].cuerpo.t === 'l' && avisos[1].cuerpo.s === avisos[0].cuerpo.s, 'al ocultarse envía el último aviso de la misma visita');
  ok(errores.length === 0, 'la app arranca sin errores' + (errores.length ? ': ' + errores[0] : ''));
  await p.reload(); await p.waitForFunction(() => document.getElementById('estado').textContent === 'Listo', null, { timeout: 60000 });
  await p.waitForTimeout(500);
  const ult = avisos.filter((a) => a.cuerpo.t === 'i').at(-1);
  ok(ult.cuerpo.s === avisos[0].cuerpo.s, 'al recargar la misma pestaña sigue siendo la misma visita');
  await ctx.close();

  // 2) modo demo y diagnóstico: no cuentan
  for (const q of ['?demo=1', '?debug=1']) {
    ({ ctx, avisos } = await preparar(b, { conEndpoint: true }));
    p = await ctx.newPage(); await p.goto(BASE + q);
    await p.waitForFunction(() => document.getElementById('estado').textContent === 'Listo', null, { timeout: 60000 }); await p.waitForTimeout(500);
    ok(avisos.length === 0, `${q} no envía nada`);
    ok(await p.evaluate(() => document.getElementById('aviso-estadisticas').hidden), `${q} no muestra el aviso de estadísticas`);
    await ctx.close();
  }

  // 3) sin dirección (estado actual del repositorio): apagado y sin aviso
  ({ ctx, avisos } = await preparar(b, { conEndpoint: false }));
  p = await ctx.newPage(); await p.goto(BASE); await p.waitForFunction(() => document.getElementById('estado').textContent === 'Listo', null, { timeout: 60000 }); await p.waitForTimeout(500);
  ok(avisos.length === 0 && await p.evaluate(() => document.getElementById('aviso-estadisticas').hidden), 'sin dirección configurada está apagado');
  await ctx.close();

  // 4) si el Worker no responde, la app sigue andando
  ({ ctx, avisos } = await preparar(b, { conEndpoint: true }));
  await ctx.route('https://recepcion.test/**', (r) => r.abort());
  p = await ctx.newPage(); const err4 = []; p.on('pageerror', (e) => err4.push(String(e)));
  await p.goto(BASE); await p.waitForFunction(() => document.getElementById('estado').textContent === 'Listo', null, { timeout: 60000 });
  ok(err4.length === 0 && await p.evaluate(() => !document.getElementById('abrir').disabled), 'con la recepción caída la app queda lista igual');
  await ctx.close();

  await b.close(); console.log(fallos ? `${fallos} fallas` : 'estadisticas (navegador): todo ok'); process.exit(fallos ? 1 : 0);
})();
