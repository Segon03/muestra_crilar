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

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import nucleo as n
import comparar

MAX_PUNTOS = 800
# Versiones reducidas de la foto base: sirven para reconocer la vitrina cuando se ve chica (de lejos)
ANCHOS_BASE_EXTRA = (640, 420)
SALIDA = os.path.join(n.RAIZ, "datos")


def exportar_base_gris():
    """Foto base en gris, reducida a 400x300: la app la usa para comprobar que la base está bien alineada."""
    base = cv2.imread(os.path.join(n.REF, "vitrina_base.jpg"), cv2.IMREAD_GRAYSCALE)
    chica = cv2.resize(base, (400, 300), interpolation=cv2.INTER_AREA)
    with open(os.path.join(SALIDA, "base_gris.bin"), "wb") as f:
        f.write(chica.tobytes())


def main():
    n.MAX_PUNTOS = MAX_PUNTOS
    banco = comparar.cargar_banco("akaze", True)
    base = cv2.imread(os.path.join(n.REF, "vitrina_base.jpg"))
    for ancho in ANCHOS_BASE_EXTRA:
        banco.append(n.Referencia(f"base{ancho}", base, "akaze", np.eye(3), np.eye(3), ancho=ancho))
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
    exportar_base_gris()
    print(len(planos), "planos,", off // 1024, "KB")


if __name__ == "__main__":
    main()
