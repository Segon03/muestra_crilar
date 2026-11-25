import { MIN_ENTRE_AVISOS_S } from '../../compartido/validacion.js';

// "i" crea la visita si no existe. "l" (sigue acá) la crea si no existe o extiende su último aviso.
export async function registrar(db, { t, s, v }, ahora, { pais, provincia }) {
  if (t === 'i') {
    await db
      .prepare('INSERT OR IGNORE INTO visitas (id, visitante, inicio, ultimo, pais, provincia) VALUES (?1, ?2, ?3, ?3, ?4, ?5)')
      .bind(s, v, ahora, pais, provincia)
      .run();
    return;
  }
  await db
    .prepare(
      'INSERT INTO visitas (id, visitante, inicio, ultimo, pais, provincia) VALUES (?1, ?2, ?3, ?3, ?4, ?5) ' +
      'ON CONFLICT(id) DO UPDATE SET ultimo = excluded.ultimo WHERE excluded.ultimo - visitas.ultimo >= ?6'
    )
    .bind(s, v, ahora, pais, provincia, MIN_ENTRE_AVISOS_S)
    .run();
}
