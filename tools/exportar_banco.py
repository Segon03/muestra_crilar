"""Exporta el banco de referencias a un formato que la app lee sin recalcular.

Calcula con AKAZE los puntos y descriptores de cada plano de cada vista del banco
(mismos parámetros que la evaluación de `comparar.py`) y los guarda en:
  datos/banco_akaze.json   homografías y offsets
  datos/banco_akaze.bin    por plano: N puntos float32 (x,y) + N descriptores de 64 bytes
                           (los 61 de AKAZE-MLDB rellenados con ceros; no cambia la distancia de Hamming)
Los puntos se guardan ordenados por respuesta (de mayor a menor).

Uso: python3 tools/exportar_banco.py
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import nucleo as n
import comparar

MAX_PUNTOS = 800
SALIDA = os.path.join(n.RAIZ, "datos")


def main():
    n.MAX_PUNTOS = MAX_PUNTOS
    banco = comparar.cargar_banco("akaze", True)
    os.makedirs(SALIDA, exist_ok=True)
    planos, bloques, off = [], [], 0
    for ref in banco:
        for pl, p in ref.planos.items():
            pts = p.pts.astype("<f4")
            d = np.zeros((len(pts), 64), np.uint8)
            d[:, : p.desc.shape[1]] = p.desc
            blob = pts.tobytes() + d.tobytes()
            planos.append({"ref": ref.nombre, "plano": pl, "n": int(len(pts)),
                           "offset": off, "H": [float(v) for v in p.H.reshape(-1)]})
            bloques.append(blob)
            off += len(blob)
    with open(os.path.join(SALIDA, "banco_akaze.bin"), "wb") as f:
        f.write(b"".join(bloques))
    with open(os.path.join(SALIDA, "banco_akaze.json"), "w", encoding="utf-8") as f:
        json.dump({"detector": "akaze", "ancho_trabajo": n.ANCHO_TRABAJO, "max_puntos": MAX_PUNTOS,
                   "bytes_descriptor": 64, "planos": planos}, f)
    print(len(planos), "planos,", off // 1024, "KB")


if __name__ == "__main__":
    main()
