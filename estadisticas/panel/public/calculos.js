// Cálculos del panel. Funciones puras (sin tocar la página) para poder probarlas en Node.
// Una fila de visita es { v: visitante, i: inicio, u: último aviso, p: país, r: provincia }, con las horas en segundos desde 1970.
// Todas las horas del panel están en hora de Argentina (UTC-3, sin horario de verano).

export const TOPE_S = 3600; // una visita no cuenta más de una hora
export const OFFSET_AR_S = -3 * 3600;
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const TRAMOS = [
  { etiqueta: 'Menos de 30 s', hasta: 30 },
  { etiqueta: '30 s a 1 min', hasta: 60 },
  { etiqueta: '1 a 3 min', hasta: 180 },
  { etiqueta: '3 a 10 min', hasta: 600 },
  { etiqueta: 'Más de 10 min', hasta: Infinity },
];
// Noche de los Museos: del 27/11/2026 00:00 al 28/11/2026 06:00, hora de Argentina
export const EVENTO = { desde: 1795748400, hasta: 1795856400 };

const pad = (n) => String(n).padStart(2, '0');

export function duracion(f) { return Math.max(0, Math.min(f.u - f.i, TOPE_S)); }

export function mediana(xs) {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// Hora local de Argentina de un instante: { fecha: '2026-11-27', hora: 21, minuto: 5, dia: 0..6 (0 = domingo) }
export function partesAR(ts) {
  const d = new Date((ts + OFFSET_AR_S) * 1000);
  return { fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, hora: d.getUTCHours(), minuto: d.getUTCMinutes(), dia: d.getUTCDay() };
}

// '2026-11-27T21:30' (hora de Argentina) -> segundos desde 1970. Devuelve NaN si no se entiende.
export function epochDesdeAR(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(texto || ''));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 1000 - OFFSET_AR_S;
}

export function textoAR(ts) {
  const p = partesAR(ts), [a, mm, d] = p.fecha.split('-');
  return `${d}/${mm}/${a} ${pad(p.hora)}:${pad(p.minuto)}`;
}

export function formatoDuracion(s) {
  s = Math.round(s);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function resumen(filas) {
  const duraciones = filas.map(duracion);
  const porVisitante = new Map();
  for (const f of filas) porVisitante.set(f.v, (porVisitante.get(f.v) || 0) + 1);
  const suma = duraciones.reduce((a, b) => a + b, 0);
  return {
    ingresos: filas.length,
    unicos: porVisitante.size,
    recurrentes: [...porVisitante.values()].filter((n) => n > 1).length,
    medianaS: mediana(duraciones),
    promedioS: filas.length ? suma / filas.length : 0,
    masDeUnMin: filas.length ? duraciones.filter((d) => d > 60).length / filas.length : 0,
  };
}

export function porHora(filas) {
  const h = Array(24).fill(0);
  for (const f of filas) h[partesAR(f.i).hora]++;
  return h;
}

export function porDia(filas) {
  const m = new Map();
  for (const f of filas) { const k = partesAR(f.i).fecha; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([fecha, n]) => ({ fecha, n }));
}

export function porTramo(filas) {
  const n = TRAMOS.map(() => 0);
  for (const f of filas) { const d = duracion(f); n[TRAMOS.findIndex((t) => d < t.hasta)]++; }
  return TRAMOS.map((t, i) => ({ etiqueta: t.etiqueta, n: n[i] }));
}

// Mapa de calor: 7 días de la semana x 24 horas
export function mapaCalor(filas) {
  const g = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const f of filas) { const p = partesAR(f.i); g[p.dia][p.hora]++; }
  return g;
}

function contar(claves) {
  const m = new Map();
  for (const k of claves) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n || (a.clave < b.clave ? -1 : 1));
}

export function nombrePais(codigo) {
  if (!codigo) return 'Sin dato';
  try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(codigo) || codigo; } catch { return codigo; }
}

export function porPais(filas) {
  return contar(filas.map((f) => f.p || '')).map((x) => ({ clave: x.clave, etiqueta: nombrePais(x.clave), n: x.n }));
}

// Provincias de Argentina. Lo que llega de otros países se agrupa aparte como "Otros países" y lo que no tiene dato como "Sin dato".
export function porProvincia(filas) {
  return contar(filas.map((f) => (f.p === 'AR' ? f.r || 'Sin dato' : f.p ? 'Otros países' : 'Sin dato')))
    .map((x) => ({ clave: x.clave, etiqueta: x.clave, n: x.n }));
}

export function horaPico(filas) {
  const h = porHora(filas), max = Math.max(...h);
  return max > 0 ? { hora: h.indexOf(max), n: max } : null;
}

export function enVivo(filas, ahora, ventanaS = 60) {
  return new Set(filas.filter((f) => f.u >= ahora - ventanaS).map((f) => f.v)).size;
}

function celda(x) { return `"${String(x ?? '').replace(/"/g, '""')}"`; }

// CSV con punto y coma y BOM, para que Excel en español lo abra bien
export function aCSV(filas) {
  const cab = ['Fecha y hora (Argentina)', 'Duración (segundos)', 'País', 'Provincia', 'Visitante (anónimo)'];
  const lineas = filas.map((f) => [textoAR(f.i), duracion(f), f.p || '', f.r || '', String(f.v || '').slice(0, 8)].map(celda).join(';'));
  return '﻿' + [cab.map(celda).join(';'), ...lineas].join('\r\n') + '\r\n';
}

export function rango(nombre, ahora) {
  const hoy0 = epochDesdeAR(partesAR(ahora).fecha);
  if (nombre === 'hoy') return { desde: hoy0, hasta: Math.max(ahora + 1, hoy0 + 86400) };
  if (nombre === '7d') return { desde: hoy0 - 6 * 86400, hasta: hoy0 + 86400 };
  if (nombre === 'evento') return { ...EVENTO };
  if (nombre === 'todo') return { desde: hoy0 + 86400 - 399 * 86400, hasta: hoy0 + 86400 };
  return null;
}
