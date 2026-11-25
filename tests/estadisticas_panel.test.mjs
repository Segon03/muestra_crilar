// Pruebas de los cálculos del panel de estadísticas. Uso: node tests/estadisticas_panel.test.mjs
import assert from 'node:assert/strict';
import * as C from '../estadisticas/panel/public/calculos.js';

const E0 = C.EVENTO.desde; // 27/11/2026 00:00 hora de Argentina
const fila = (seg, dur, v, p = 'AR', r = 'La Rioja') => ({ v, i: E0 + seg, u: E0 + seg + dur, p, r });

// ---------- horas de Argentina ----------
assert.deepEqual(C.partesAR(E0), { fecha: '2026-11-27', hora: 0, minuto: 0, dia: 5 }); // viernes
assert.deepEqual(C.partesAR(E0 - 1), { fecha: '2026-11-26', hora: 23, minuto: 59, dia: 4 });
assert.equal(C.epochDesdeAR('2026-11-27T00:00'), E0);
assert.equal(C.epochDesdeAR('2026-11-27'), E0);
assert.equal(C.epochDesdeAR('2026-11-28T06:00'), C.EVENTO.hasta);
assert.ok(Number.isNaN(C.epochDesdeAR('mañana')));
assert.equal(C.textoAR(E0 + 21 * 3600 + 5 * 60), '27/11/2026 21:05');
assert.equal(C.formatoDuracion(45), '45 s'); assert.equal(C.formatoDuracion(60), '1 min'); assert.equal(C.formatoDuracion(125), '2 min 5 s');

// ---------- duración y resumen ----------
assert.equal(C.duracion({ i: 10, u: 100 }), 90);
assert.equal(C.duracion({ i: 10, u: 10 + 99999 }), 3600, 'tope de una hora');
assert.equal(C.duracion({ i: 100, u: 50 }), 0, 'nunca negativa');
assert.equal(C.mediana([]), 0); assert.equal(C.mediana([5, 1, 3]), 3); assert.equal(C.mediana([1, 2, 3, 4]), 2.5);
const filas = [fila(60, 0, 'a'), fila(120, 30, 'b'), fila(3 * 3600, 90, 'a'), fila(21 * 3600, 600, 'c', 'AR', 'Córdoba'), fila(22 * 3600, 400, 'd', 'CL', null), fila(23 * 3600, 5, 'e', null, null)];
const r = C.resumen(filas);
assert.equal(r.ingresos, 6); assert.equal(r.unicos, 5); assert.equal(r.recurrentes, 1);
assert.equal(r.medianaS, 60); // [0, 5, 30, 90, 400, 600]
assert.equal(Math.round(r.promedioS), 188);
assert.equal(r.masDeUnMin, 3 / 6);
assert.deepEqual(C.resumen([]), { ingresos: 0, unicos: 0, recurrentes: 0, medianaS: 0, promedioS: 0, masDeUnMin: 0 });

// ---------- horarios ----------
const h = C.porHora(filas);
assert.equal(h.length, 24); assert.equal(h[0], 2); assert.equal(h[3], 1); assert.equal(h[21], 1); assert.equal(h.reduce((a, b) => a + b), 6);
assert.deepEqual(C.horaPico(filas), { hora: 0, n: 2 }); assert.equal(C.horaPico([]), null);
assert.deepEqual(C.porDia([...filas, fila(86400 + 10, 5, 'z')]), [{ fecha: '2026-11-27', n: 6 }, { fecha: '2026-11-28', n: 1 }]);
assert.equal(C.mapaCalor(filas)[5][0], 2); assert.equal(C.mapaCalor(filas).length, 7);
assert.deepEqual(C.porTramo(filas).map((t) => t.n), [2, 1, 1, 1, 1]); // <30 (0 y 5 s), 30-60 (30 s), 1-3 min (90 s), 3-10 min (400 s), >10 min (600 s)

// ---------- ubicación ----------
assert.deepEqual(C.porProvincia(filas).map((x) => [x.clave, x.n]), [['La Rioja', 3], ['Córdoba', 1], ['Otros países', 1], ['Sin dato', 1]]);
const paises = C.porPais(filas);
assert.deepEqual(paises.map((x) => [x.clave, x.n]), [['AR', 4], ['', 1], ['CL', 1]]);
assert.equal(paises[1].etiqueta, 'Sin dato');
assert.match(paises[0].etiqueta, /Argentina/);

// ---------- en vivo ----------
assert.equal(C.enVivo([fila(0, 30, 'a'), fila(0, 200, 'b'), fila(0, 200, 'b')], E0 + 220), 1, 'cuenta visitantes, no visitas');

// ---------- CSV ----------
const csv = C.aCSV([fila(21 * 3600, 90, '3f2b8c1e-9d4a', 'AR', 'La "Rioja"')]);
assert.ok(csv.startsWith('﻿"Fecha y hora (Argentina)";"Duración (segundos)"'));
assert.ok(csv.includes('"27/11/2026 21:00";"90";"AR";"La ""Rioja""";"3f2b8c1e"'), csv);
assert.ok(!csv.includes('9d4a'), 'el identificador se acorta');

// ---------- rangos ----------
const ahora = E0 + 15 * 3600 + 1234; // 27/11 15:20
assert.deepEqual(C.rango('hoy', ahora), { desde: E0, hasta: E0 + 86400 });
assert.deepEqual(C.rango('7d', ahora), { desde: E0 - 6 * 86400, hasta: E0 + 86400 });
assert.deepEqual(C.rango('evento', ahora), C.EVENTO);
const todo = C.rango('todo', ahora); assert.ok(todo.hasta - todo.desde <= 400 * 86400);
assert.equal(C.rango('otro', ahora), null);

console.log('estadisticas (panel): todas las pruebas pasaron');
