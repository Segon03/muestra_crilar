# Cómo cargar el contenido de las ventanas

Todo el contenido está en `contenido/contenidos.json`; no hace falta tocar el código. Cada área (las claves coinciden con `referencias/areas.json`) admite:

```json
"11_rama_oncideres": {
  "titulo": "Oncideres, el corta palos",
  "texto": "Primer párrafo.\n\nSegundo párrafo (los párrafos se separan con una línea en blanco).",
  "imagenes": [
    {"archivo": "contenido/imagenes/oncideres_infografia.jpg", "pie": "Ciclo de vida", "creditos": "Infografía: autoría", "ampliable": true},
    "contenido/imagenes/hembra_oncideres.jpg"
  ],
  "video": {"archivo": "contenido/videos/oncideres.mp4", "poster": "contenido/imagenes/oncideres_poster.jpg", "creditos": "Video: autoría"},
  "creditos": "Fotografías: ..."
}
```

- Todo es opcional salvo `titulo`. Si un área no tiene `texto`, imágenes ni video, muestra "Contenido próximamente."
- Las imágenes pueden ser una ruta sola o un objeto con `pie` y `creditos` (se muestran debajo de cada foto). Al tocar una imagen se abre ampliada, y un toque más alterna el zoom.
- `creditos` general va al final de la ventana. Las fotos de insectos traen sus créditos en `fotos_insectos/creditos.md`: copiarlos en `creditos` de la imagen.

## Preparar los archivos

Las imágenes y los videos originales **no se suben tal cual** (los videos pesan 37 a 55 MB):

```bash
python3 tools/preparar_imagen.py ORIGEN.jpg contenido/imagenes/NOMBRE.jpg      # máx. 1600 px de lado, JPEG
tools/comprimir_video.sh ORIGEN.mp4 contenido/videos/NOMBRE.mp4                 # H.264, 720 px de alto, menos de 10 MB
python3 tools/validar_contenido.py                                              # revisa rutas, tamaños y créditos
```

La infografía en PDF conviene exportarla a imagen (`@2x.png`) y pasarla por `preparar_imagen.py`, con un lado máximo mayor si hace falta leerla (`--max 2400`).
