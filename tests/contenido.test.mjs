// Pruebas de la normalización del contenido. Uso: node tests/contenido.test.mjs
import assert from 'node:assert/strict';
import { normalizar, SIN_CONTENIDO } from '../src/contenido.js';

let c = normalizar('03_dipteros', { titulo: 'Dípteros', texto: 'Contenido próximamente.', imagenes: [], video: null, creditos: '' });
assert.equal(c.vacio, true);
assert.deepEqual(c.parrafos, [SIN_CONTENIDO]);

c = normalizar('04_x', undefined);
assert.equal(c.titulo, 'x'); assert.equal(c.vacio, true);

c = normalizar('11_rama', {
  titulo: ' Oncideres ', texto: 'Uno.\n\n  Dos.\n\n\nTres.',
  imagenes: ['a.jpg', { archivo: 'b.jpg', pie: 'pie', creditos: 'cred', ampliable: false }, { pie: 'sin archivo' }, null],
  video: 'v.mp4', creditos: 'Fotos: X',
});
assert.equal(c.titulo, 'Oncideres');
assert.deepEqual(c.parrafos, ['Uno.', 'Dos.', 'Tres.']);
assert.equal(c.imagenes.length, 2);
assert.deepEqual(c.imagenes[0], { archivo: 'a.jpg', pie: '', creditos: '', ampliable: true });
assert.equal(c.imagenes[1].ampliable, false);
assert.deepEqual(c.video, { archivo: 'v.mp4', poster: '', creditos: '' });
assert.equal(c.vacio, false);

// un área con imágenes pero con el texto provisorio no muestra "próximamente"
c = normalizar('02_x', { titulo: 'L', texto: SIN_CONTENIDO, imagenes: ['a.jpg'] });
assert.deepEqual(c.parrafos, []);
assert.equal(c.vacio, false);
console.log('contenido: ok');
