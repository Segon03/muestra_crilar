// Prueba de punta a punta en un navegador sin cámara: carga la app en modo demo con la foto base y
// comprueba que se marcan las áreas y que el toque abre la ventana correcta.
// Uso (con el sitio servido, p. ej. python3 -m http.server 8765): NODE_PATH=$(npm root -g) node tests/e2e_demo.cjs [URL]
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0,200)));
  await p.goto((process.argv[2] || 'http://localhost:8765/') + '?demo=1&debug=1');
  await p.waitForFunction(() => document.getElementById('estado').textContent === 'Listo', null, {timeout: 60000});
  await p.setInputFiles('#archivo', require('path').join(__dirname, '..', 'referencias', 'vitrina_base.jpg'));
  await p.waitForFunction(() => (window.__app.pantalla||[]).length >= 11, null, {timeout: 30000});
  await p.waitForTimeout(500);
  
  const centro = (id) => p.evaluate((id) => { const v = window.__app.pantalla.find((x) => x.id === id); return v ? [v.poli.reduce((a, c) => a + c[0], 0) / 4, v.poli.reduce((a, c) => a + c[1], 0) / 4] : null; }, id);
  for (const id of ['04_himenopteros', '01_caja_entomologica_superior', '10_nidos_barro_avispas', '11_rama_oncideres']) {
    // al cerrar una ventana la detección arranca de cero: esperar a que vuelvan los recuadros
    await p.waitForFunction((id) => (window.__app.pantalla || []).some((v) => v.id === id), id, { timeout: 30000 });
    const [x, y] = await centro(id); await p.mouse.click(x, y); await p.waitForTimeout(150);
    console.log(id, '->', await p.textContent('#modal-titulo'), '| visible', !(await p.$eval('#modal', e => e.hidden)));
    await p.click('#cerrar');
    await p.waitForTimeout(1500); // la detección se reinicia al cerrar la ventana
  }
  // toque fuera de todo recuadro: no abre nada
  await p.mouse.click(5, 770); await p.waitForTimeout(100);
  console.log('toque fuera -> modal oculto:', await p.$eval('#modal', e=>e.hidden));
  await b.close();
})().catch(e => { console.log('ERR', String(e).slice(0,400)); process.exit(1); });
