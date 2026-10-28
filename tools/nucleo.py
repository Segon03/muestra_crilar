"""Núcleo del prototipo de reconocimiento (Fase 1).

Reconoce la vitrina en una imagen comparando puntos característicos contra un
banco de referencias y proyecta los recuadros de `referencias/areas.json`.

Dos planos, cada uno con su homografía:
  - plano A: la caja que cuelga de la pared (área 01)
  - plano B: la base de la vitrina (áreas 02 a 11)
"""
import json
import os

import cv2
import numpy as np

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REF = os.path.join(RAIZ, "referencias")

ANCHO_TRABAJO = 480        # ancho al que se reducen los cuadros antes de detectar
ANCHO_REF = 960            # ancho de la referencia al calcular sus puntos
MIN_INLIERS = 15           # criterio del plan para dar un plano por reconocido
UMBRAL_RANSAC = 4.0        # px, en la escala de trabajo
MAX_PUNTOS = None          # si se fija, se conservan sólo los de mayor respuesta (referencia y cuadro)
MAX_PUNTOS_CUADRO = None   # tope propio para el cuadro; si es None se usa MAX_PUNTOS

# Polígonos de cada plano sobre vitrina_base.jpg (px de la foto de 1600x1200)
POLI_A = np.float32([[352, 25], [1040, 25], [1040, 502], [352, 502]])
POLI_B = np.float32([[200, 640], [1380, 640], [1380, 1165], [195, 1165]])


def cargar_areas():
    with open(os.path.join(REF, "areas.json"), encoding="utf-8") as f:
        return json.load(f)["areas"]


def caja_a_quad(b):
    return np.float32([[b["x1"], b["y1"]], [b["x2"], b["y1"]],
                       [b["x2"], b["y2"]], [b["x1"], b["y2"]]])


def plano_de(area_id):
    return "A" if area_id.startswith("01_") else "B"


def crear_detector(nombre):
    if nombre == "orb":
        return cv2.ORB_create(nfeatures=1500, scaleFactor=1.2, nlevels=8,
                              fastThreshold=10)
    if nombre == "akaze":
        return cv2.AKAZE_create(threshold=0.0005)
    if nombre == "sift":  # solo como referencia: no viene en OpenCV.js estándar
        return cv2.SIFT_create(nfeatures=1500)
    raise ValueError(nombre)


def norma(nombre):
    return cv2.NORM_L2 if nombre == "sift" else cv2.NORM_HAMMING


def a_gris(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    return g


def reducir(img, ancho=None):
    ancho = ancho or ANCHO_TRABAJO
    h, w = img.shape[:2]
    if w == ancho:
        return img, 1.0
    s = ancho / w
    return cv2.resize(img, (ancho, int(round(h * s))), interpolation=cv2.INTER_AREA), s


def escala_h(s):
    return np.diag([s, s, 1.0])


def top_puntos(kp, desc, maximo):
    if maximo and desc is not None and len(kp) > maximo:
        idx = np.argsort([-k.response for k in kp])[:maximo]
        kp = [kp[i] for i in idx]
        desc = desc[idx]
    return kp, desc


class Plano:
    """Puntos de un plano dentro de una imagen de referencia."""

    def __init__(self, kp, desc, H_base_a_img):
        self.pts = np.float32([k.pt for k in kp]).reshape(-1, 2)
        self.desc = desc
        self.H = H_base_a_img  # coordenadas de vitrina_base -> coordenadas de esta referencia


class Referencia:
    def __init__(self, nombre, img, detector, HA=None, HB=None, ancho=ANCHO_REF):
        """HA/HB llevan coordenadas de vitrina_base.jpg (1600x1200) a la imagen
        original de la referencia. None = ese plano no se ve."""
        self.nombre = nombre
        self.planos = {}
        small, s = reducir(img, min(ancho, img.shape[1]))
        gris = a_gris(small)
        det = crear_detector(detector)
        for pl, H, poli in (("A", HA, POLI_A), ("B", HB, POLI_B)):
            if H is None:
                continue
            Hs = escala_h(s) @ H
            quad = cv2.perspectiveTransform(poli.reshape(-1, 1, 2), Hs).reshape(-1, 2)
            mask = np.zeros(gris.shape, np.uint8)
            cv2.fillConvexPoly(mask, np.int32(quad), 255)
            kp, desc = det.detectAndCompute(gris, mask)
            kp, desc = top_puntos(kp, desc, MAX_PUNTOS)
            if desc is None or len(kp) < 8:
                continue
            self.planos[pl] = Plano(kp, desc, Hs)


class Reconocedor:
    def __init__(self, detector, banco, ratio=0.8):
        """banco: lista de Referencia ya calculadas con el mismo detector."""
        self.nombre_det = detector
        self.det = crear_detector(detector)
        self.matcher = cv2.BFMatcher(norma(detector))
        self.banco = banco
        self.ratio = ratio

    def describir(self, img):
        """Devuelve (kp_pts, desc, escala) del cuadro reducido."""
        small, s = reducir(img)
        kp, desc = self.det.detectAndCompute(a_gris(small), None)
        kp, desc = top_puntos(kp, desc, MAX_PUNTOS_CUADRO or MAX_PUNTOS)
        pts = np.float32([k.pt for k in kp]).reshape(-1, 2) if kp else np.zeros((0, 2), np.float32)
        return pts, desc, s

    def _homografia(self, pl, pts, desc):
        if desc is None or len(desc) < 8:
            return None, 0, 0
        m = self.matcher.knnMatch(pl.desc, desc, k=2)
        buenos = [a for a, b in (x for x in m if len(x) == 2) if a.distance < self.ratio * b.distance]
        if len(buenos) < 8:
            return None, 0, len(buenos)
        src = pl.pts[[g.queryIdx for g in buenos]]
        dst = pts[[g.trainIdx for g in buenos]]
        H, mask = cv2.findHomography(src, dst, cv2.USAC_MAGSAC, UMBRAL_RANSAC,
                                     maxIters=2000, confidence=0.995)
        if H is None:
            return None, 0, len(buenos)
        return H, int(mask.sum()), len(buenos)

    def reconocer(self, img):
        """Devuelve {plano: dict(H_base_a_cuadro, inliers, ref)} en coordenadas
        del cuadro original (no reducido)."""
        pts, desc, s = self.describir(img)
        res = {}
        for ref in self.banco:
            for pl_id, pl in ref.planos.items():
                H, ni, _ = self._homografia(pl, pts, desc)
                if H is None:
                    continue
                if pl_id in res and res[pl_id]["inliers"] >= ni:
                    continue
                # base -> ref -> cuadro reducido -> cuadro original
                Hf = np.linalg.inv(escala_h(s)) @ H @ pl.H
                res[pl_id] = {"H": Hf, "inliers": ni, "ref": ref.nombre}
        return res


def proyectar(areas, res, tam):
    """Proyecta los recuadros de las áreas reconocidas. tam=(ancho, alto) del cuadro.
    Devuelve {area_id: quad 4x2} sólo con homografías plausibles."""
    out = {}
    for a in areas:
        pl = plano_de(a["id"])
        r = res.get(pl)
        if r is None or r["inliers"] < MIN_INLIERS:
            continue
        q = cv2.perspectiveTransform(caja_a_quad(a["bbox_px"]).reshape(-1, 1, 2), r["H"]).reshape(-1, 2)
        if not cuadrilatero_valido(q, tam):
            continue
        out[a["id"]] = q
    return out


def cuadrilatero_valido(q, tam):
    """Convexo, orientado igual que el original y de tamaño razonable."""
    if not np.isfinite(q).all():
        return False
    cruz = []
    for i in range(4):
        a, b, c = q[i], q[(i + 1) % 4], q[(i + 2) % 4]
        cruz.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    if not (all(c > 0 for c in cruz) or all(c < 0 for c in cruz)):
        return False
    area = abs(cv2.contourArea(q.astype(np.float32)))
    return 0.0005 * tam[0] * tam[1] < area < 20 * tam[0] * tam[1]


def iou_quads(q1, q2, tam=None):
    """IoU de dos cuadriláteros convexos; si hay tam=(w,h) se recortan al cuadro."""
    q1 = np.float32(q1)
    q2 = np.float32(q2)
    if tam is not None:
        w, h = tam
        marco = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        q1 = _interseccion(q1, marco)
        q2 = _interseccion(q2, marco)
        if q1 is None or q2 is None:
            return 0.0
    inter = _interseccion(q1, q2)
    if inter is None:
        return 0.0
    ai = cv2.contourArea(inter)
    au = cv2.contourArea(q1) + cv2.contourArea(q2) - ai
    return float(ai / au) if au > 0 else 0.0


def _orientar(q):
    q = np.float32(q)
    return q if cv2.contourArea(q, True) >= 0 else q[::-1].copy()


def _interseccion(q1, q2):
    ret, inter = cv2.intersectConvexConvex(_orientar(q1), _orientar(q2))
    if ret <= 0 or inter is None:
        return None
    return inter.reshape(-1, 2)


def fraccion_visible(q, tam):
    w, h = tam
    marco = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    inter = _interseccion(q, marco)
    a = abs(cv2.contourArea(np.float32(q)))
    return 0.0 if inter is None or a == 0 else float(cv2.contourArea(inter) / a)


def dibujar(img, quads, areas=None):
    out = img.copy()
    for aid, q in quads.items():
        c = (0, 255, 0) if aid.startswith("01") else (0, 200, 255)
        cv2.polylines(out, [np.int32(q)], True, c, 2)
        cv2.putText(out, aid[:2], tuple(int(v) for v in q[0] + [3, 14]), 0, 0.5, c, 1, cv2.LINE_AA)
    return out
