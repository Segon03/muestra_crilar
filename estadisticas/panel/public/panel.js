// Página del panel: pide las visitas al Worker, las calcula con calculos.js y dibuja los gráficos.
import * as C from './calculos.js';

const $ = (id) => document.getElementById(id);
const REFRESCO_MS = 30000;
let actual = { nombre: 'evento', ...C.EVENTO };
let datos = null;

function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmtN(n) { return n.toLocaleString('es-AR'); }
function fmtPct(x) { return Math.round(x * 100) + ' %'; }

function aviso(texto) { const m = $('mensaje'); m.hidden = !texto; m.textContent = texto || ''; }

async function cargar() {
  const ahora = Math.floor(Date.now() / 1000);
  try {
    const r = await fetch(`/api/visitas?desde=${actual.desde}&hasta=${actual.hasta}`, { cache: 'no-store', credentials: 'same-origin' });
    if (r.status === 403) { aviso('Sin acceso: tu sesión venció o tu correo no está autorizado. Recargá la página para volver a ingresar.'); return; }
    if (!r.ok) { aviso('No se pudieron cargar los datos. Probá de nuevo en un momento.'); return; }
    datos = await r.json();
    datos.recibido = ahora;
    aviso(datos.truncado ? 'Hay más visitas que las que se pueden mostrar juntas: se muestran las primeras 100.000. Acotá el período.' : '');
    pintar();
  } catch {
    aviso('No se pudieron cargar los datos. Revisá la conexión.');
  }
}

function barrasVerticales(el, items) {
  const max = Math.max(1, ...items.map((i) => i.n));
  el.innerHTML = items.map((i) => {
    const alto = Math.round((i.n / max) * 100);
    return `<div class="col" title="${esc(i.titulo || i.etiqueta)}: ${fmtN(i.n)}"><div class="barra-caja"><span class="valor">${i.n || ''}</span><div class="barra ${i.n ? '' : 'cero'}" style="height:${i.n ? Math.max(alto, 3) : 2}%"></div></div><span class="eti">${esc(i.etiqueta)}</span></div>`;
  }).join('');
}

function barrasHorizontales(el, items, vacio = 'Sin datos en este período.') {
  if (!items.length || !items.some((i) => i.n)) { el.innerHTML = `<p class="vacio">${vacio}</p>`; return; }
  const max = Math.max(1, ...items.map((i) => i.n));
  el.innerHTML = items.map((i) => `<div class="fila"><span class="nombre" title="${esc(i.etiqueta)}">${esc(i.etiqueta)}</span><span class="pista"><i style="width:${(i.n / max) * 100}%"></i></span><span class="n">${fmtN(i.n)}</span></div>`).join('');
}

function mapaCalor(el, grilla) {
  const max = Math.max(1, ...grilla.flat());
  const orden = [1, 2, 3, 4, 5, 6, 0]; // lunes a domingo
  let html = '<span></span>' + Array.from({ length: 24 }, (_, h) => `<span class="h">${h % 3 === 0 ? h : ''}</span>`).join('');
  for (const d of orden) {
    html += `<span class="dia">${C.DIAS[d].slice(0, 3)}</span>`;
    html += grilla[d].map((n, h) => `<span class="c" title="${C.DIAS[d]} ${h}:00 · ${n} ingresos" style="${n ? `background:color-mix(in srgb, var(--acento) ${Math.max(18, Math.round((n / max) * 100))}%, var(--vacio))` : ''}"></span>`).join('');
  }
  el.innerHTML = html;
}

function pintar() {
  const filas = datos.filas;
  $('rango-texto').textContent = `${C.textoAR(datos.desde)} a ${C.textoAR(datos.hasta)} (hora de Argentina)`;
  const r = C.resumen(filas);
  $('k-ingresos').textContent = fmtN(r.ingresos);
  $('k-unicos').textContent = fmtN(r.unicos);
  $('k-recurrentes').textContent = r.recurrentes ? `${fmtN(r.recurrentes)} volvieron más de una vez` : 'aproximado';
  $('k-mediana').textContent = r.ingresos ? C.formatoDuracion(r.medianaS) : '–';
  $('k-promedio').textContent = r.ingresos ? `promedio ${C.formatoDuracion(r.promedioS)}` : 'promedio –';
  $('k-mas1').textContent = r.ingresos ? fmtPct(r.masDeUnMin) : '–';
  const pico = C.horaPico(filas);
  $('k-pico').textContent = pico ? `${String(pico.hora).padStart(2, '0')}:00` : '–';
  $('k-pico-n').textContent = pico ? `${fmtN(pico.n)} ingresos` : 'ingresos';

  barrasVerticales($('g-hora'), C.porHora(filas).map((n, h) => ({ n, etiqueta: h % 3 === 0 ? String(h) : '', titulo: `${String(h).padStart(2, '0')}:00 a ${String(h).padStart(2, '0')}:59` })));
  const dias = C.porDia(filas);
  $('t-dia').hidden = dias.length < 2;
  barrasVerticales($('g-dia'), dias.map((d) => ({ n: d.n, etiqueta: d.fecha.slice(8) + '/' + d.fecha.slice(5, 7), titulo: d.fecha })));
  barrasHorizontales($('g-tramo'), C.porTramo(filas));
  barrasHorizontales($('g-prov'), C.porProvincia(filas));
  barrasHorizontales($('g-pais'), C.porPais(filas));
  mapaCalor($('g-calor'), C.mapaCalor(filas));

  const vivo = C.enVivo(filas, datos.recibido);
  const enCurso = datos.hasta > datos.recibido && datos.desde <= datos.recibido;
  $('vivo').hidden = !enCurso;
  $('vivo-n').textContent = String(vivo);
}

function elegir(nombre) {
  const ahora = Math.floor(Date.now() / 1000);
  const rg = C.rango(nombre, ahora);
  if (!rg) return;
  actual = { nombre, ...rg };
  document.querySelectorAll('[data-rango]').forEach((b) => b.classList.toggle('activo', b.dataset.rango === nombre));
  $('desde').value = ''; $('hasta').value = '';
  cargar();
}

function aplicarFechas() {
  const d = C.epochDesdeAR($('desde').value), h = C.epochDesdeAR($('hasta').value);
  if (!Number.isFinite(d) || !Number.isFinite(h) || d >= h) { aviso('Revisá las fechas: "desde" tiene que ser anterior a "hasta".'); return; }
  actual = { nombre: 'libre', desde: d, hasta: h };
  document.querySelectorAll('[data-rango]').forEach((b) => b.classList.remove('activo'));
  cargar();
}

function descargarCSV() {
  if (!datos) return;
  const blob = new Blob([C.aCSV(datos.filas)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `estadisticas_${C.partesAR(datos.desde).fecha}_a_${C.partesAR(datos.hasta - 1).fecha}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.querySelectorAll('[data-rango]').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.rango)));
$('aplicar').addEventListener('click', aplicarFechas);
$('csv').addEventListener('click', descargarCSV);
$('imprimir').addEventListener('click', () => window.print());
setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, REFRESCO_MS);
// antes del evento se muestra "hoy" (para ver las pruebas) y desde su inicio, la noche completa
elegir(Date.now() / 1000 >= C.EVENTO.desde ? 'evento' : 'hoy');
