"""Revisa contenido/contenidos.json: áreas válidas, archivos existentes, tamaños y créditos.

Uso: python3 tools/validar_contenido.py      (sale con código 1 si hay errores)
"""
import json
import os
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAX_VIDEO = 10 * 1024 * 1024
MAX_IMAGEN = 1024 * 1024


def main():
    ids = [a["id"] for a in json.load(open(os.path.join(RAIZ, "referencias/areas.json"), encoding="utf-8"))["areas"]]
    areas = json.load(open(os.path.join(RAIZ, "contenido/contenidos.json"), encoding="utf-8"))["areas"]
    errores, avisos = [], []

    def archivo(area, ruta, tope, tipo):
        p = os.path.join(RAIZ, ruta)
        if not os.path.isfile(p):
            errores.append(f"{area}: no existe {ruta}")
        elif os.path.getsize(p) > tope:
            avisos.append(f"{area}: {ruta} pesa {os.path.getsize(p) // 1024} KB (recomendado: menos de {tope // 1024} KB para {tipo})")

    for i in ids:
        if i not in areas:
            errores.append(f"falta el área {i}")
    for i, a in areas.items():
        if i not in ids:
            errores.append(f"{i}: no está en referencias/areas.json")
        if not str(a.get("titulo", "")).strip():
            errores.append(f"{i}: falta el título")
        for img in a.get("imagenes", []):
            ruta = img if isinstance(img, str) else img.get("archivo", "")
            archivo(i, ruta, MAX_IMAGEN, "imágenes")
            if not (isinstance(img, dict) and img.get("creditos")) and not a.get("creditos"):
                avisos.append(f"{i}: la imagen {ruta} no tiene créditos (ni el área)")
        v = a.get("video")
        if v:
            archivo(i, v if isinstance(v, str) else v.get("archivo", ""), MAX_VIDEO, "videos")
            if isinstance(v, dict) and v.get("poster"):
                archivo(i, v["poster"], MAX_IMAGEN, "imágenes")
    con = sum(1 for a in areas.values() if a.get("imagenes") or a.get("video") or (a.get("texto") and "próximamente" not in a["texto"].lower()))
    print(f"{len(areas)} áreas, {con} con contenido, {len(areas) - con} 'Contenido próximamente'")
    for m in avisos:
        print("AVISO:", m)
    for m in errores:
        print("ERROR:", m)
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
