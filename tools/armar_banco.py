"""Arma el banco de referencias con varias vistas (Fase 1).

Parte de la foto base y registra por homografía, de forma encadenada, las tres
fotos de ángulo y cuadros de `video_muestra.mp4` (nunca de video_muestra2.mp4,
que se reserva para evaluar). Cada plano (A: caja, B: base) se registra por
separado. Para registrar se usa SIFT, que es lento pero preciso: es una
herramienta offline y no afecta al detector que corre en la app.

Salida: referencias/banco/*.jpg y referencias/banco/banco.json, con las
homografías base -> imagen de cada plano visible.

Uso: python3 tools/armar_banco.py [--n 18] [--paso 6]
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import nucleo as n

SALIDA = os.path.join(n.REF, "banco")
MIN_INL_REG = 30        # inliers para aceptar un registro
ANCHO_FEAT = 960        # ancho máximo para calcular puntos
VIDEO = os.path.join(n.REF, "pruebas", "video_muestra.mp4")
FOTOS = [os.path.join(n.REF, "pruebas", f"foto_angulo_0{i}.jpg") for i in (1, 2, 3)] + \
    [os.path.join(n.REF, "pruebas", f"foto{i}.jpeg") for i in (4, 5, 6, 7)]
FORZAR = {"foto4.jpeg", "foto5.jpeg", "foto6.jpeg", "foto7.jpeg"}  # fotos tomadas con el celular en la sala: siempre entran al banco
ANOTACIONES = os.path.join(os.path.dirname(__file__), "anotaciones_banco.json")


def feats(img, mask_quad=None, ancho=ANCHO_FEAT):
    """SIFT en coordenadas nativas de img. mask_quad: cuadrilátero nativo."""
    h, w = img.shape[:2]
    s = min(1.0, ancho / w)
    g = n.a_gris(cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else img)
    mask = None
    if mask_quad is not None:
        mask = np.zeros(g.shape, np.uint8)
        cv2.fillConvexPoly(mask, np.int32(mask_quad * s), 255)
    kp, d = cv2.SIFT_create(nfeatures=2500).detectAndCompute(g, mask)
    if d is None:
        return np.zeros((0, 2), np.float32), None
    return np.float32([k.pt for k in kp]) / s, d


def nitidez(img):
    return cv2.Laplacian(n.a_gris(img), cv2.CV_64F).var()


def registrar(pts_a, d_a, pts_b, d_b):
    """Homografía a->b (coordenadas nativas) e inliers."""
    if d_a is None or d_b is None or len(d_a) < 10 or len(d_b) < 10:
        return None, 0
    m = cv2.BFMatcher().knnMatch(d_a, d_b, k=2)
    ok = [x[0] for x in m if len(x) == 2 and x[0].distance < 0.75 * x[1].distance]
    if len(ok) < 10:
        return None, 0
    src = pts_a[[g.queryIdx for g in ok]]
    dst = pts_b[[g.trainIdx for g in ok]]
    H, mk = cv2.findHomography(src, dst, cv2.USAC_MAGSAC, 3.0, maxIters=3000, confidence=0.999)
    return (None, 0) if H is None else (H, int(mk.sum()))


def quad_en(H, poli):
    return cv2.perspectiveTransform(poli.reshape(-1, 1, 2), H).reshape(-1, 2)


def plausible(H, poli, tam):
    q = quad_en(H, poli)
    if not n.cuadrilatero_valido(q, tam):
        return False
    # al menos un tercio del plano debe caer dentro del cuadro
    return n.fraccion_visible(q, tam) > 0.33


class Anclas:
    """Imágenes ya registradas con sus puntos por plano."""

    def __init__(self):
        self.lista = []

    def agregar(self, nombre, img, HA, HB):
        e = {"nombre": nombre, "img": img, "H": {"A": HA, "B": HB}, "f": {}}
        for pl, poli in (("A", n.POLI_A), ("B", n.POLI_B)):
            H = e["H"][pl]
            if H is None:
                continue
            q = quad_en(H, poli)
            e["f"][pl] = feats(img, q)
        self.lista.append(e)
        return e

    def registrar_candidato(self, img):
        """Intenta registrar img contra las anclas. Devuelve {plano: (H_base_a_img, inliers, ancla)}."""
        pts, d = feats(img)
        tam = (img.shape[1], img.shape[0])
        mejor = {}
        for e in self.lista:
            for pl, poli in (("A", n.POLI_A), ("B", n.POLI_B)):
                if pl not in e["f"]:
                    continue
                pa, da = e["f"][pl]
                H, ni = registrar(pa, da, pts, d)
                if H is None or ni < MIN_INL_REG:
                    continue
                Hb = H @ e["H"][pl]
                if not plausible(Hb, poli, tam):
                    continue
                if pl not in mejor or mejor[pl][1] < ni:
                    mejor[pl] = (Hb, ni, e["nombre"])
        return mejor


def firma(H, poli, tam):
    q = quad_en(H, poli)
    return (q / np.float32([tam[0], tam[1]])).reshape(-1)


def elegir(regs, pl, k):
    """Muestreo del más lejano sobre la forma proyectada del plano."""
    cand = [r for r in regs if pl in r["res"]]
    if not cand:
        return []
    poli = n.POLI_A if pl == "A" else n.POLI_B
    F = np.array([firma(r["res"][pl][0], poli, r["tam"]) for r in cand])
    sel = [int(np.argmax([r["res"][pl][1] for r in cand]))]
    while len(sel) < min(k, len(cand)):
        d = np.min(np.linalg.norm(F[:, None] - F[sel][None], axis=2), axis=1)
        d[sel] = -1
        sel.append(int(np.argmax(d)))
    return [cand[i] for i in sel]


def homografia_manual(plano_anotado):
    """Homografía base -> imagen a partir de las esquinas de paneles medidas a mano."""
    with open(os.path.join(n.REF, "areas_poligonos.json"), encoding="utf-8") as f:
        pol = json.load(f)["poligonos"]
    src, dst = [], []
    for area, esquinas in plano_anotado.items():
        src += pol[area]
        dst += esquinas
    H, mk = cv2.findHomography(np.float32(src), np.float32(dst), cv2.RANSAC, 4.0)
    proy = cv2.perspectiveTransform(np.float32(src).reshape(-1, 1, 2), H).reshape(-1, 2)
    err = float(np.linalg.norm(proy - np.float32(dst), axis=1).mean())
    return H, int(mk.sum()), err


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=18, help="vistas por plano (además de la base)")
    ap.add_argument("--paso", type=int, default=6, help="un cuadro de cada N del video")
    ap.add_argument("--nitidez", type=float, default=40.0)
    args = ap.parse_args()

    base = cv2.imread(os.path.join(n.REF, "vitrina_base.jpg"))
    I = np.eye(3)
    anclas = Anclas()
    anclas.agregar("base", base, I, I)

    cands = [(os.path.basename(f), cv2.imread(f)) for f in FOTOS]
    cap = cv2.VideoCapture(VIDEO)
    i = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i % args.paso == 0 and nitidez(f) > args.nitidez:
            cands.append((f"v1_{i:04d}", f))
        i += 1
    print(f"{len(cands)} candidatos")

    regs = {}
    pendientes = list(range(len(cands)))
    for ronda in range(4):
        nuevos = 0
        for ci in list(pendientes):
            nom, img = cands[ci]
            res = anclas.registrar_candidato(img)
            if not res:
                continue
            regs[ci] = {"nombre": nom, "img": img, "res": res, "tam": (img.shape[1], img.shape[0])}
            pendientes.remove(ci)
            nuevos += 1
            # sólo se usan como ancla las vistas registradas con buena evidencia
            anclas.agregar(nom, img, res.get("A", (None,))[0], res.get("B", (None,))[0])
            print(f"  ronda {ronda} {nom}: " + ", ".join(f"{p}={v[1]} ({v[2]})" for p, v in res.items()), flush=True)
        print(f"ronda {ronda}: {nuevos} nuevos, quedan {len(pendientes)}")
        if nuevos == 0:
            break

    # registros manuales: reemplazan (o agregan) el plano indicado
    with open(ANOTACIONES, encoding="utf-8") as f:
        manuales = json.load(f)["fotos"]
    for ci, (nom, img) in enumerate(cands):
        for pl, anot in manuales.get(nom, {}).items():
            H, ni, err = homografia_manual(anot)
            print(f"  manual {nom} plano {pl}: {ni} puntos de {sum(len(v) for v in anot.values())}, error medio {err:.1f} px")
            r = regs.setdefault(ci, {"nombre": nom, "img": img, "res": {}, "tam": (img.shape[1], img.shape[0])})
            r["res"][pl] = (H, 999, "manual")
            if ci in pendientes:
                pendientes.remove(ci)

    print("no registrados:", [cands[c][0] for c in pendientes])
    lista = list(regs.values())
    elegidas = {}
    for pl in ("A", "B"):
        for r in elegir(lista, pl, args.n):
            elegidas.setdefault(r["nombre"], r)
    for r in lista:
        if r["nombre"] in FORZAR:
            elegidas.setdefault(r["nombre"], r)
    os.makedirs(SALIDA, exist_ok=True)
    for f in os.listdir(SALIDA):
        os.remove(os.path.join(SALIDA, f))
    cv2.imwrite(os.path.join(SALIDA, "base.jpg"), base, [cv2.IMWRITE_JPEG_QUALITY, 90])
    entradas = [{"nombre": "base", "archivo": "base.jpg", "HA": I.tolist(), "HB": I.tolist()}]
    for nom, r in elegidas.items():
        arch = nom.replace(".jpg", "") + ".jpg"
        cv2.imwrite(os.path.join(SALIDA, arch), r["img"], [cv2.IMWRITE_JPEG_QUALITY, 90])
        e = {"nombre": nom, "archivo": arch, "inliers": {p: v[1] for p, v in r["res"].items()}}
        for pl in ("A", "B"):
            e["H" + pl] = r["res"][pl][0].tolist() if pl in r["res"] else None
        entradas.append(e)
    with open(os.path.join(SALIDA, "banco.json"), "w", encoding="utf-8") as fh:
        json.dump({"referencia": "vitrina_base.jpg", "entradas": entradas}, fh, indent=1)
    print(f"banco: {len(entradas)} entradas en {SALIDA}")


if __name__ == "__main__":
    main()
