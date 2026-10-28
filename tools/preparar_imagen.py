"""Reduce una imagen para la web: lado máximo y JPEG (o PNG si tiene transparencia).

Uso: python3 tools/preparar_imagen.py ENTRADA SALIDA [--max 1600] [--calidad 82]
"""
import argparse
import os

from PIL import Image, ImageOps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada")
    ap.add_argument("salida")
    ap.add_argument("--max", type=int, default=1600, help="lado máximo en px")
    ap.add_argument("--calidad", type=int, default=82)
    a = ap.parse_args()
    img = ImageOps.exif_transpose(Image.open(a.entrada))
    img.thumbnail((a.max, a.max), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    if a.salida.lower().endswith((".jpg", ".jpeg")):
        img.convert("RGB").save(a.salida, "JPEG", quality=a.calidad, optimize=True, progressive=True)
    else:
        img.save(a.salida, optimize=True)
    print(f"{a.salida}: {img.size[0]}x{img.size[1]}, {os.path.getsize(a.salida) // 1024} KB")


if __name__ == "__main__":
    main()
