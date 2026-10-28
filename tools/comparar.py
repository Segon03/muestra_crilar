"""Compara detectores (ORB, AKAZE y SIFT como referencia) y bancos de referencias.

Dos evaluaciones:
  --video   sobre video_muestra2.mp4 (nunca usado para armar el banco), contra las
            cajas anotadas a mano en tests/gt_video_muestra2.json, más el
            porcentaje de cuadros reconocidos (1 por segundo, 50 cuadros).
  --sintetico   sobre versiones aumentadas de la foto base (rotación, perspectiva,
            escala, brillo, desenfoque, reflejos), con la verdad exacta.

Uso: python3 tools/comparar.py [--video] [--sintetico] [--salida tests/resultados]
"""
import argparse
import json
import os
import sys
import time
import zlib

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import nucleo as n

VIDEO2 = os.path.join(n.REF, "pruebas", "video_muestra2.mp4")
GT = os.path.join(n.RAIZ, "tests", "gt_video_muestra2.json")
DETECTORES = ["orb", "akaze", "sift"]


def cargar_banco(detector, usar_banco):
    base = cv2.imread(os.path.join(n.REF, "vitrina_base.jpg"))
    I = np.eye(3)
    if not usar_banco:
        return [n.Referencia("base", base, detector, I, I)]
    with open(os.path.join(n.REF, "banco", "banco.json"), encoding="utf-8") as f:
        entradas = json.load(f)["entradas"]
    out = []
    for e in entradas:
        img = cv2.imread(os.path.join(n.REF, "banco", e["archivo"]))
        HA = np.array(e["HA"]) if e.get("HA") else None
        HB = np.array(e["HB"]) if e.get("HB") else None
        out.append(n.Referencia(e["nombre"], img, detector, HA, HB))
    return out


def bbox_recortada(q, tam):
    x1, y1 = np.clip(q.min(0), 0, [tam[0], tam[1]])
    x2, y2 = np.clip(q.max(0), 0, [tam[0], tam[1]])
    return [float(x1), float(y1), float(x2), float(y2)]


def iou_cajas(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    i = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0.0


def leer_cuadros(indices):
    cap = cv2.VideoCapture(VIDEO2)
    out = {}
    for i in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, f = cap.read()
        if ok:
            out[i] = f
    return out


def evaluar_video(detector, usar_banco, areas):
    gt = json.load(open(GT, encoding="utf-8"))
    cuadros = leer_cuadros(range(0, 1496, 30))
    t0 = time.time()
    rec = n.Reconocedor(detector, cargar_banco(detector, usar_banco))
    t_banco = time.time() - t0
    reconocidos = {"A": 0, "B": 0}
    gt_frames = {c["frame"]: c for c in gt["cuadros"]}
    ious, t_det, por_cuadro = [], [], {}
    for fi, img in cuadros.items():
        tam = (img.shape[1], img.shape[0])
        t0 = time.time()
        res = rec.reconocer(img)
        t_det.append(time.time() - t0)
        quads = n.proyectar(areas, res, tam)
        for pl in "AB":
            if any(n.plano_de(a) == pl for a in quads):
                reconocidos[pl] += 1
        if fi in gt_frames:
            v = []
            for aid, caja in gt_frames[fi]["cajas"].items():
                q = quads.get(aid)
                v.append(0.0 if q is None else iou_cajas(bbox_recortada(q, tam), caja))
            ious += v
            por_cuadro[gt_frames[fi]["t"]] = [round(float(np.mean(v)), 2), len(v)]
    ious = np.array(ious)
    detectadas = ious > 0
    return {
        "detector": detector, "banco": len(rec.banco),
        "cuadros": len(cuadros),
        "pct_reconocido_A": 100 * reconocidos["A"] / len(cuadros),
        "pct_reconocido_B": 100 * reconocidos["B"] / len(cuadros),
        "cajas_gt": len(ious),
        "pct_cajas_con_proyeccion": 100 * detectadas.mean(),
        "iou_medio_todas": float(ious.mean()),
        "iou_medio_detectadas": float(ious[detectadas].mean()) if detectadas.any() else 0.0,
        "pct_iou_ge_50": 100 * float((ious >= 0.5).mean()),
        "pct_iou_ge_30_falso": 100 * float(((ious > 0) & (ious < 0.3)).mean()),
        "iou_por_segundo_gt": por_cuadro,
        "ms_por_cuadro": 1000 * float(np.mean(t_det)),
        "s_preparar_banco": t_banco,
    }


# ---------- evaluación sintética ----------

def aumentar(base, rng, tipo):
    """Devuelve (imagen, H base->imagen) con una deformación de dificultad `tipo`."""
    h, w = base.shape[:2]
    H = np.eye(3)
    s = 1.0
    if "escala" in tipo:
        s = rng.uniform(0.35, 0.8)
    ang = rng.uniform(-20, 20) if "rot" in tipo else 0
    sal = h * 0.0 if "persp" not in tipo else rng.uniform(0.04, 0.12)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = src + rng.uniform(-sal, sal, src.shape).astype(np.float32) * [w, h] if sal else src.copy()
    Hp = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    R = cv2.getRotationMatrix2D((w / 2, h / 2), ang, s)
    Hr = np.vstack([R, [0, 0, 1]])
    H = Hr @ Hp
    ow, oh = 480, 640
    # centrar la vitrina en una salida de 480x640 (vertical, como el celular)
    c = rng.uniform(0.35, 0.65, 2)
    T = np.array([[ow / w * 1.0, 0, 0], [0, ow / w * 1.0, 0], [0, 0, 1]])
    H = T @ H
    H[0, 2] += (c[0] - 0.5) * 60
    H[1, 2] += (oh - h * ow / w) / 2 + (c[1] - 0.5) * 60
    img = cv2.warpPerspective(base, H, (ow, oh), borderMode=cv2.BORDER_REFLECT)
    if "luz" in tipo:
        img = np.clip(img.astype(np.float32) * rng.uniform(0.55, 1.4) + rng.uniform(-25, 25), 0, 255).astype(np.uint8)
    if "blur" in tipo:
        k = int(rng.choice([3, 5, 7]))
        img = cv2.GaussianBlur(img, (k, k), 0)
    if "reflejo" in tipo:
        ref = np.zeros((oh, ow), np.float32)
        for _ in range(int(rng.integers(1, 4))):
            p = rng.uniform(0, 1, (4, 2)) * [ow, oh]
            cv2.fillConvexPoly(ref, np.int32(cv2.convexHull(p.astype(np.float32))), float(rng.uniform(0.3, 0.7)))
        ref = cv2.GaussianBlur(ref, (0, 0), 15)
        img = np.clip(img * (1 - ref[..., None]) + 255 * ref[..., None], 0, 255).astype(np.uint8)
    return img, H


TIPOS = {
    "frontal+luz": ["luz"],
    "rotacion": ["rot", "luz"],
    "perspectiva": ["persp", "luz"],
    "escala": ["escala", "luz"],
    "blur": ["escala", "blur"],
    "reflejos": ["reflejo", "escala"],
    "combinado": ["rot", "persp", "escala", "luz", "blur", "reflejo"],
}


def evaluar_sintetico(detector, usar_banco, areas, por_tipo=12):
    base = cv2.imread(os.path.join(n.REF, "vitrina_base.jpg"))
    rec = n.Reconocedor(detector, cargar_banco(detector, usar_banco))
    out = {}
    for tipo, mods in TIPOS.items():
        rng = np.random.default_rng(zlib.crc32(tipo.encode()) % 1000)
        ious, ok_cuadros = [], 0
        for _ in range(por_tipo):
            img, H = aumentar(base, rng, mods)
            tam = (img.shape[1], img.shape[0])
            quads = n.proyectar(areas, rec.reconocer(img), tam)
            ok_cuadros += bool(quads)
            for a in areas:
                gtq = cv2.perspectiveTransform(n.caja_a_quad(a["bbox_px"]).reshape(-1, 1, 2), H).reshape(-1, 2)
                if n.fraccion_visible(gtq, tam) < 0.5:
                    continue
                q = quads.get(a["id"])
                ious.append(0.0 if q is None else n.iou_quads(q, gtq, tam))
        ious = np.array(ious)
        out[tipo] = {"pct_cuadros_con_reconocimiento": 100 * ok_cuadros / por_tipo,
                     "iou_medio": float(ious.mean()) if len(ious) else 0.0,
                     "pct_iou_ge_50": 100 * float((ious >= 0.5).mean()) if len(ious) else 0.0}
    return {"detector": detector, "banco": len(rec.banco), "tipos": out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", action="store_true")
    ap.add_argument("--sintetico", action="store_true")
    ap.add_argument("--detectores", default=",".join(DETECTORES))
    ap.add_argument("--salida", default=os.path.join(n.RAIZ, "tests", "resultados"))
    args = ap.parse_args()
    if not (args.video or args.sintetico):
        args.video = args.sintetico = True
    os.makedirs(args.salida, exist_ok=True)
    areas = n.cargar_areas()
    for nombre, fn in (("video", evaluar_video), ("sintetico", evaluar_sintetico)):
        if not getattr(args, nombre):
            continue
        res = []
        for det in args.detectores.split(","):
            for banco in (False, True):
                r = fn(det, banco, areas)
                r["usa_banco"] = banco
                res.append(r)
                print(json.dumps(r, ensure_ascii=False), flush=True)
        with open(os.path.join(args.salida, f"{nombre}.json"), "w", encoding="utf-8") as f:
            json.dump(res, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
