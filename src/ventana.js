// Ventana emergente de cada área: título, texto, galería de imágenes, video y créditos.
import { normalizar } from './contenido.js';

const $ = (id) => document.getElementById(id);

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto) e.textContent = texto;
  return e;
}

export function abrirVentana(id, area) {
  const c = normalizar(id, area);
  $('modal-titulo').textContent = c.titulo;
  const cuerpo = $('modal-cuerpo');
  cuerpo.replaceChildren();

  for (const p of c.parrafos) cuerpo.append(el('p', c.vacio ? 'vacio' : '', p));

  if (c.imagenes.length) {
    const gal = el('div', 'galeria' + (c.imagenes.length === 1 ? ' una' : ''));
    for (const i of c.imagenes) {
      const fig = el('figure');
      const img = el('img');
      img.src = i.archivo; img.alt = i.pie || c.titulo; img.loading = 'lazy'; img.decoding = 'async';
      if (i.ampliable) img.addEventListener('click', () => ampliar(i.archivo, img.alt));
      fig.append(img);
      if (i.pie || i.creditos) {
        const cap = el('figcaption', '', i.pie);
        if (i.creditos) cap.append(el('span', 'cred', i.creditos));
        fig.append(cap);
      }
      gal.append(fig);
    }
    cuerpo.append(gal);
  }

  if (c.video) {
    const v = el('video');
    v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.src = c.video.archivo;
    if (c.video.poster) v.poster = c.video.poster;
    cuerpo.append(v);
    if (c.video.creditos) cuerpo.append(el('div', 'creditos', c.video.creditos));
  }

  if (c.creditos) cuerpo.append(el('div', 'creditos', c.creditos));
  $('modal').hidden = false;
  $('modal').querySelector('.tarjeta').scrollTop = 0;
}

export function cerrarVentana() {
  cerrarAmpliada();
  $('modal-cuerpo').querySelectorAll('video').forEach((v) => v.pause());
  $('modal').hidden = true;
  $('modal-cuerpo').replaceChildren(); // libera imágenes y video
}

export const ventanaAbierta = () => !$('modal').hidden;

function ampliar(src, alt) {
  const a = $('ampliada');
  $('ampliada-img').src = src; $('ampliada-img').alt = alt;
  a.classList.remove('zoom');
  a.hidden = false;
}
function cerrarAmpliada() { $('ampliada').hidden = true; $('ampliada-img').removeAttribute('src'); }

$('cerrar').addEventListener('click', cerrarVentana);
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) cerrarVentana(); });
$('cerrar-ampliada').addEventListener('click', cerrarAmpliada);
$('ampliada-img').addEventListener('click', () => $('ampliada').classList.toggle('zoom')); // un toque alterna el zoom
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('ampliada').hidden) cerrarAmpliada(); else if (ventanaAbierta()) cerrarVentana();
});
