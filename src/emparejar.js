// Emparejamiento de descriptores binarios (AKAZE-MLDB, 64 bytes con relleno) por fuerza bruta
// con prueba de razón de Lowe. Va en JS puro para no depender de la API de BFMatcher de OpenCV.js.

const PALABRAS = 16; // 64 bytes = 16 palabras de 32 bits

function popcount(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// a, b: Uint32Array con n*16 palabras. Para cada descriptor de `a` busca los dos más cercanos
// en `b`. Devuelve {qi, ti} con los pares que pasan la prueba de razón.
export function emparejar(a, na, b, nb, razon = 0.8) {
  const qi = [], ti = [];
  if (na === 0 || nb < 2) return { qi, ti };
  for (let i = 0; i < na; i++) {
    const oa = i * PALABRAS;
    let mejor = 1e9, segundo = 1e9, jm = -1;
    for (let j = 0; j < nb; j++) {
      const ob = j * PALABRAS;
      let d = 0;
      for (let k = 0; k < PALABRAS; k++) d += popcount(a[oa + k] ^ b[ob + k]);
      if (d < mejor) { segundo = mejor; mejor = d; jm = j; }
      else if (d < segundo) segundo = d;
    }
    if (mejor < razon * segundo) { qi.push(i); ti.push(jm); }
  }
  return { qi, ti };
}

export function contarBuenos(a, na, b, nb, razon = 0.8) {
  return emparejar(a, na, b, nb, razon).qi.length;
}
