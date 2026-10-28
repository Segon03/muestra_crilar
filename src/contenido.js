// Normaliza el contenido de un área (contenido/contenidos.json) a una forma fija para dibujarlo.
// Formato de cada área (todo opcional salvo `titulo`):
//   titulo: texto
//   texto: párrafos separados por una línea en blanco
//   imagenes: lista de rutas, o de objetos {archivo, pie, creditos, ampliable}
//   video: ruta, o {archivo, poster, creditos}
//   creditos: texto general (fotografías, fuentes)
export const SIN_CONTENIDO = 'Contenido próximamente.';

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

export function normalizar(id, area) {
  const a = area || {};
  const titulo = texto(a.titulo) || id.replace(/^\d+_/, '').replace(/_/g, ' ');
  const parrafos = texto(a.texto).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const imagenes = (Array.isArray(a.imagenes) ? a.imagenes : [])
    .map((i) => (typeof i === 'string' ? { archivo: i } : i))
    .filter((i) => i && texto(i.archivo))
    .map((i) => ({ archivo: texto(i.archivo), pie: texto(i.pie), creditos: texto(i.creditos), ampliable: i.ampliable !== false }));
  const v = typeof a.video === 'string' ? { archivo: a.video } : a.video;
  const video = v && texto(v.archivo) ? { archivo: texto(v.archivo), poster: texto(v.poster), creditos: texto(v.creditos) } : null;
  const creditos = texto(a.creditos);
  // "Contenido próximamente." solo se muestra cuando el área no tiene nada más que ese texto
  const soloProvisorio = parrafos.length === 1 && parrafos[0] === SIN_CONTENIDO;
  const hay = (parrafos.length > 0 && !soloProvisorio) || imagenes.length > 0 || video !== null;
  return { titulo, parrafos: hay ? parrafos.filter((p) => p !== SIN_CONTENIDO) : [SIN_CONTENIDO], imagenes, video, creditos, vacio: !hay };
}
