// Worker clásico: carga su propia copia de OpenCV.js y hace la detección (AKAZE + banco + homografía)
// fuera del hilo principal, que queda libre para seguir el video a cuadro completo.
// Mensajes: {tipo:'init', banco: URL sin extensión} -> {tipo:'listo'}
//           {tipo:'cuadro', id, ancho, alto, buf} -> {tipo:'resultado', id, A, B, puntos, ms}
importScripts('../vendor/opencv/opencv.js');

let reconocedor = null;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tipo === 'init') {
      const { cargarOpenCV, cargarBanco, Reconocedor } = await import('./vision.js');
      const [cv, banco] = await Promise.all([cargarOpenCV(), cargarBanco(m.banco)]);
      reconocedor = new Reconocedor(cv, banco);
      self.postMessage({ tipo: 'listo' });
    } else if (m.tipo === 'cuadro' && reconocedor) {
      const t0 = performance.now();
      const img = new ImageData(new Uint8ClampedArray(m.buf), m.ancho, m.alto);
      const r = reconocedor.detectar(img);
      const salida = { tipo: 'resultado', id: m.id, A: r.A, B: r.B, puntos: r.puntos, n: r.n, ms: performance.now() - t0 };
      self.postMessage(salida, [r.puntos.buffer]);
    }
  } catch (err) {
    self.postMessage({ tipo: 'error', mensaje: String((err && err.message) || err) });
  }
};
