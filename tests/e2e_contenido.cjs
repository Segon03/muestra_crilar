// Prueba en navegador de la ventana emergente con contenido de ejemplo (no toca el contenido real).
// Uso (sitio servido en el puerto 8765): NODE_PATH=$(npm root -g) node tests/e2e_contenido.cjs [URL]
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const URL_BASE = process.argv[2] || 'http://localhost:8765/';
const ejemplo = {
  version: 2,
  areas: {
    '04_himenopteros': {
      titulo: 'Himenópteros de ejemplo', texto: 'Primer párrafo.\n\nSegundo párrafo.',
      imagenes: [{ archivo: 'referencias/areas/04_himenopteros.jpg', pie: 'Panel de himenópteros', creditos: 'Foto: ejemplo' }, 'referencias/areas/03_dipteros.jpg'],
      video: { archivo: 'referencias/pruebas/video_muestra.mp4', creditos: 'Video: ejemplo' }, creditos: 'Créditos generales de ejemplo',
    },
    '03_dipteros': { titulo: 'Dípteros', texto: 'Contenido próximamente.', imagenes: [], video: null, creditos: '' },
  },
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true });
  p.on('pageerror', (e) => { console.log('pageerror:', String(e).slice(0, 200)); process.exitCode = 1; });
  await p.route('**/contenido/contenidos.json', (r) => r.fulfill({ json: ejemplo }));
  await p.goto(URL_BASE + '?demo=1');
  await p.waitForFunction(() => document.getElementById('estado').textContent === 'Listo', null, { timeout: 90000 });
  await p.setInputFiles('#archivo', path.join(__dirname, '..', 'referencias', 'vitrina_base.jpg'));
  await p.waitForFunction(() => (window.__app.pantalla || []).length >= 11, null, { timeout: 30000 });
  const centro = (id) => p.evaluate((id) => { const v = window.__app.pantalla.find((x) => x.id === id); return [v.poli.reduce((a, c) => a + c[0], 0) / 4, v.poli.reduce((a, c) => a + c[1], 0) / 4]; }, id);

  let [x, y] = await centro('04_himenopteros');
  await p.mouse.click(x, y);
  assert.equal(await p.textContent('#modal-titulo'), 'Himenópteros de ejemplo');
  assert.equal(await p.locator('#modal-cuerpo p').count(), 2);
  assert.equal(await p.locator('.galeria figure').count(), 2);
  assert.match(await p.textContent('.galeria figcaption'), /Foto: ejemplo/);
  assert.equal(await p.locator('#modal-cuerpo video').count(), 1);
  assert.match(await p.textContent('#modal-cuerpo'), /Créditos generales de ejemplo/);
  await p.waitForFunction(() => [...document.querySelectorAll('.galeria img')].every((i) => i.complete && i.naturalWidth > 0));
  // ampliar imagen y alternar zoom
  await p.click('.galeria img');
  assert.equal(await p.$eval('#ampliada', (e) => e.hidden), false);
  await p.click('#ampliada-img'); assert.ok(await p.$eval('#ampliada', (e) => e.classList.contains('zoom')));
  await p.click('#cerrar-ampliada'); assert.equal(await p.$eval('#ampliada', (e) => e.hidden), true);
  assert.equal(await p.$eval('#modal', (e) => e.hidden), false, 'cerrar la imagen no cierra la ventana');
  await p.click('#cerrar');
  assert.equal(await p.$eval('#modal', (e) => e.hidden), true);
  assert.equal(await p.locator('#modal-cuerpo *').count(), 0, 'al cerrar se libera el contenido');

  // área vacía: "Contenido próximamente."
  await p.waitForFunction(() => (window.__app.pantalla || []).length >= 11);
  [x, y] = await centro('03_dipteros');
  await p.mouse.click(x, y);
  assert.equal(await p.textContent('#modal-cuerpo'), 'Contenido próximamente.');
  assert.equal(await p.locator('.galeria, #modal-cuerpo video').count(), 0);
  await p.keyboard.press('Escape');
  assert.equal(await p.$eval('#modal', (e) => e.hidden), true);
  console.log('ventana con contenido: ok');
  await b.close();
})().catch((e) => { console.log('ERR', String(e).slice(0, 500)); process.exit(1); });
