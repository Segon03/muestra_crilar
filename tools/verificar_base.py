"""Comprobación de la alineación de la base (plano B) por parecido de bordes.

Misma idea que src/verificacion.js: se lleva el cuadro al espacio de la foto base con la homografía y se
compara el borde dentro de las tarjetas (áreas 02 a 07). Sirve para descartar registros equivocados
al armar el banco y para medir.
"""
import os

import cv2
import numpy as np

import nucleo as n

ESCALA = 0.25
ANCHO, ALTO = 400, 300
_base = cv2.imread(os.path.join(n.REF, "vitrina_base.jpg"), cv2.IMREAD_GRAYSCALE)


def _bordes(g):
    g = cv2.GaussianBlur(g, (0, 0), 1.2).astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
    return cv2.GaussianBlur(np.sqrt(gx * gx + gy * gy), (0, 0), 1.0)


_Eb = _bordes(cv2.resize(_base, (ANCHO, ALTO), interpolation=cv2.INTER_AREA))
_mascara = np.zeros((ALTO, ANCHO), np.uint8)
for _a in n.cargar_areas():
    if _a["id"][:2] in ("02", "03", "04", "05", "06", "07"):
        cv2.fillConvexPoly(_mascara, np.int32(_a["quad"] * ESCALA), 255)
_mascara = _mascara > 0


def puntaje(gris, H):
    """Parecido de bordes (-1 a 1) entre el cuadro llevado a la base y la foto base; None si casi no se ve."""
    M = H @ np.diag([1 / ESCALA, 1 / ESCALA, 1.0])
    w = cv2.warpPerspective(gris, M, (ANCHO, ALTO), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=0)
    v = cv2.warpPerspective(np.full(gris.shape, 255, np.uint8), M, (ANCHO, ALTO),
                            flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP, borderValue=0) > 0
    m = _mascara & v
    if m.sum() < 0.2 * _mascara.sum():
        return None
    x = _bordes(w)[m]
    y = _Eb[m]
    x = x - x.mean()
    y = y - y.mean()
    d = np.sqrt((x * x).sum() * (y * y).sum())
    return float((x * y).sum() / d) if d > 0 else 0.0
