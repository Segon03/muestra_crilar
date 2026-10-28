# Muestra interactiva de la vitrina entomológica (CRILAR)

Web app de realidad aumentada para la Noche de los Museos. El visitante escanea un QR, apunta la cámara del celular a la vitrina y la app marca cada área sobre el video en vivo. Al tocar una marca se abre una ventana con información.

Estado: en preparación. El plan de trabajo está en [PLAN_TAREAS.md](PLAN_TAREAS.md).

## Carpetas

- `referencias/`: foto base de la vitrina, recortes por área, `areas.json` con los recuadros y material de prueba (fotos y videos).
- `contenido/`: textos, imágenes y videos de las ventanas emergentes (`contenidos.json`).
- `src/`: código de la app.
- `vendor/`: librerías de terceros con versión fija (OpenCV.js).
- `tools/`: scripts de apoyo y prototipos.
- `tests/`: pruebas de reconocimiento.
- `qr/`: código QR para imprimir.

## Cómo probar en local

Sitio estático: `python3 -m http.server 8000` en la raíz y abrir `http://localhost:8000/` (la cámara anda en localhost). Con `?demo=1` se puede probar sin cámara (video o foto) y con `?debug=1` se ven los puntos detectados, los inliers y el tiempo por detección.

El banco de referencias que usa la app (`datos/`) se regenera con `python3 tools/armar_banco.py` y `python3 tools/exportar_banco.py`.

## Publicación

GitHub Pages desde la rama `main`. URL prevista: https://segon03.github.io/muestra_crilar/

Material de referencia y fotos de insectos: ver créditos en `contenido/` cuando se carguen.
