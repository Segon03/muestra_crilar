-- Una fila por visita (una pestaña abierta). No se guarda la IP ni la ciudad.
CREATE TABLE IF NOT EXISTS visitas (
  id        TEXT PRIMARY KEY,      -- identificador anónimo de la visita
  visitante TEXT NOT NULL,         -- identificador anónimo del celular
  inicio    INTEGER NOT NULL,      -- segundos desde 1970 (hora del servidor)
  ultimo    INTEGER NOT NULL,      -- segundos desde 1970 del último aviso
  pais      TEXT,                  -- código de 2 letras, por ejemplo AR
  provincia TEXT                   -- por ejemplo La Rioja
);
CREATE INDEX IF NOT EXISTS visitas_inicio ON visitas (inicio);
