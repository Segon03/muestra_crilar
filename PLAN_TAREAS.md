# Plan de tareas: muestra interactiva de la vitrina del CRILAR

## Qué se va a construir

Una web app que el visitante abre escaneando un QR. Apunta la cámara del celular a la vitrina entomológica y, sobre el video en vivo, la app reconoce cada área de la muestra y la marca con un recuadro que sigue a la vitrina mientras el celular se mueve. Al tocar un recuadro se abre una ventana emergente con el contenido de esa área.

Es realidad aumentada en el navegador. No se instala nada y todo corre en el celular.

## Datos del proyecto

- **Directorio de trabajo:** la raíz de este repositorio. En una sesión en la nube es el clon del repo; en la computadora del usuario, `C:\Users\Equipo\OneDrive\Documentos\1 NOCHE DE LOS MUSEOS\muestra_crilar`.
- **Repositorio:** https://github.com/Segon03/muestra_crilar (rama `main`)
- **Publicación:** GitHub Pages, que da HTTPS y la cámara lo exige. URL esperada: https://segon03.github.io/muestra_crilar/
- **Idioma de la interfaz:** español.
- **Internet:** hay en el CRILAR, así que no hace falta que funcione sin conexión.

## Material de partida

Ya está dentro del repositorio, en `referencias/`:

- `referencias/vitrina_base.jpg`: foto limpia de la vitrina, 1600×1200 px.
- `referencias/areas.json`: las 11 áreas con su rectángulo en píxeles y normalizado (0 a 1) sobre `vitrina_base.jpg`.
- `referencias/areas/*.jpg`: un recorte por área.
- `referencias/verificacion_recuadros.jpg`: la foto con los recuadros dibujados.
- `referencias/pruebas/video_muestra.mp4`: video de 28 s (480×854, vertical) donde se recorre la vitrina desde varios ángulos, con acercamientos y reflejos del vidrio.
- `referencias/pruebas/video_muestra2.mp4`: video de 50 s con otro recorrido. Solo para evaluar.
- `referencias/pruebas/foto_angulo_01.jpg`, `02` y `03`: tres fotos desde otros ángulos (720×1280, verticales). La 02 es casi frontal; la 01 y la 03 son oblicuas.
- `contenido/contenidos.json`: plantilla con las 11 áreas y texto provisorio.

El contenido definitivo todavía no está en el repo y lo aporta el usuario desde su computadora (carpeta `1 NOCHE DE LOS MUSEOS`): `fotos_insectos/` con `creditos.md`, la infografía de Oncideres (`.pdf`, `@1x.png`, `@2x.png`), `hembra_oncideres.JPG` y los videos de divulgación. Los videos pesan entre 37 y 55 MB, así que hay que comprimirlos antes de subirlos.

Las 11 áreas son: `01_caja_entomologica_superior` (un solo recuadro para toda la caja, sin dividir por grupos), `02_lepidopteros`, `03_dipteros`, `04_himenopteros`, `05_ortopteros`, `06_coleopteros`, `07_hemipteros`, `08_nido_escarabajo_pelotero`, `09_panal_avispa`, `10_nidos_barro_avispas` y `11_rama_oncideres`.

## Reglas del comportamiento

1. El reconocimiento se hace sobre el video de la cámara en vivo. La foto y los recortes son solo referencia: se usan una vez, al arrancar, para aprender qué buscar.
2. Los recuadros no son fijos. Se calculan en cada cuadro según dónde esté la vitrina y se mueven con el celular.
3. Los carteles sin punto de referencia (el de "Los avisperos", el folleto del CRILAR, el de "¿Cuánto sabés?" y el de "Por favor no tocar") no se marcan ni responden al toque.
4. Los contenidos de las ventanas emergentes se cargan después. Mientras tanto, cada área muestra su nombre y un texto "Contenido próximamente".

## Enfoque técnico

- **Sitio estático** con HTML y JavaScript con módulos ES, sin paso de compilación. Así no hay `node_modules` dentro de OneDrive.
- **OpenCV.js** para la visión, copiado dentro del repo en `vendor/` con versión fija para no depender de un CDN.
- **Dos planos de referencia**, porque la caja cuelga de la pared y el resto está sobre la base de la vitrina. Cada plano tiene su propia homografía:
  - Plano A: la caja superior (área 01).
  - Plano B: la base de la vitrina (áreas 02 a 11).
- **Reconocimiento por puntos característicos** (ORB o AKAZE, lo que ande mejor en OpenCV.js) entre cada plano de referencia y el cuadro actual, con homografía robusta (RANSAC). Con la homografía se proyectan los rectángulos de `areas.json` al cuadro de video.
- **Banco de referencias con varias vistas.** Una sola foto frontal no alcanza: en una prueba rápida con el video de muestra, ese enfoque reconoció la vitrina en menos de la mitad de los cuadros (ver Fase 1). La referencia pasa a ser un conjunto: la foto base, las tres fotos de ángulo y cuadros elegidos del video, cada uno con sus recuadros anotados. Al recibir un cuadro de la cámara, se busca cuál referencia coincide mejor y desde esa se proyectan las áreas.
- **Seguimiento entre detecciones:** se detecta cada N cuadros sobre una versión reducida (unos 640 px de ancho) y en el medio se sigue con flujo óptico (Lucas-Kanade). La posición se suaviza para que los recuadros no tiemblen.
- **Plan B si las áreas chicas no se estabilizan** (nidos de barro, nido de escarabajo pelotero): afinar cada área con comparación de plantillas dentro de la zona proyectada.
- **Plan C si el banco de referencias no alcanza:** entrenar un detector liviano (por ejemplo, un YOLO pequeño exportado a un formato que corra en el navegador) que reconozca directamente cada área en el video. Como la vitrina es una sola y fija, sirve entrenar con cuadros del video propio, fotos de los tres ángulos y la foto base, aumentados con cambios de luz, desenfoque, rotación y reflejos simulados. Aceptar este camino implica más trabajo y un modelo de varios MB para descargar al abrir la app.

## Fases y tareas

### Fase 0: preparar el repositorio y el entorno
- [x] Repositorio preparado: `README.md`, `.gitignore`, `CLAUDE.md`, carpetas `src/`, `vendor/`, `tools/`, `tests/`, `qr/`, `referencias/` (con todo el material) y `contenido/` (con `contenidos.json`).
- [x] Crear `index.html` mínimo en la raíz.
- [x] Activar GitHub Pages y verificar que la URL cargue una página de prueba (activado por el usuario; hoy publica la rama `claude/serene-ptolemy-bmmjlh`).
- [ ] Si se trabaja en la computadora del usuario: OneDrive puede bloquear archivos de `.git` mientras sincroniza. Si da errores, pausar la sincronización mientras se trabaja.

### Fase 1: prototipo y elección del algoritmo (Python, fuera de la app)
- [ ] En `tools/`, un script con OpenCV para Python que reciba una imagen o un video y proyecte los 11 recuadros usando `vitrina_base.jpg` como referencia.
- [ ] Comparar ORB y AKAZE por separado para el plano A y el plano B. Guardar los resultados.
- [ ] Probar con imágenes aumentadas a partir de la foto: rotación, perspectiva, escala, brillo, desenfoque y reflejos simulados.
- [ ] Medir qué tan bien caen los recuadros proyectados sobre los esperados (IoU) y elegir el detector con mejores resultados.
- [ ] Reparto del material de prueba: `video_muestra.mp4` y las tres fotos de ángulo sirven para armar el banco de referencias (y, si hace falta, para entrenar). `video_muestra2.mp4` (50 s, grabado en otro recorrido) se reserva solo para evaluar y no se usa para armar ni entrenar nada.
- [ ] **Resultado de una prueba previa** (cuadros del video reducidos a 540 px, una sola foto frontal como referencia, sin seguimiento, y con al menos 15 puntos que coinciden entre la referencia y el cuadro como criterio de "reconocida"): la vitrina se reconoció en 7 a 14 de 29 cuadros en el primer video y en 6 a 21 de 50 cuadros en el segundo, según el detector y el plano. Funciona bien cerca de la vista frontal y falla con ángulos muy abiertos, acercamientos y reflejos. Es una prueba rápida y no define el resultado final, pero indica que hace falta más de una referencia.
- [ ] Armar el banco de referencias: tomar la foto base, las tres fotos de ángulo y entre 10 y 20 cuadros del video que cubran todas las vistas. Para cada uno, anotar los 11 recuadros. Conviene propagarlos automáticamente desde la foto base por homografía cuando haya suficientes coincidencias y corregir a mano los que no.
- [ ] Repetir la comparación de detectores con el banco de referencias y medir el porcentaje de cuadros del video con la vitrina reconocida y el IoU de los recuadros.
- [ ] Si con el banco de referencias el porcentaje de cuadros reconocidos sigue bajo, pasar al detector entrenado (ver plan B más abajo) usando los cuadros anotados como datos de entrenamiento.

### Fase 2: primera versión visible (hito para ver la app funcionando)
- [x] Pantalla de inicio con un botón "Abrir cámara" y el pedido de permiso. Cámara trasera, con `playsinline` para que ande en iPhone.
- [x] Cargar OpenCV.js y cargar los dos planos de referencia (los puntos se calculan con `tools/exportar_banco.py` y se leen de `datos/`, no se recalculan en el celular). una sola vez los puntos característicos de los dos planos de referencia.
- [x] Bucle de video: detección sobre cuadro reducido, homografía, proyección de los 11 recuadros dibujados sobre un canvas encima del video, con el nombre de cada área.
- [x] Mensaje cuando no se encuentra la vitrina ("Apuntá la cámara a la vitrina") y ocultar los recuadros si se pierde por más de medio segundo.
- [x] Detección al tocar: determinar si el toque cae dentro de un recuadro y abrir una ventana emergente con el título y "Contenido próximamente".
- [x] Modo demostración (`?demo=1`): permite probar sin cámara con un video subido o con la foto de referencia. Modo diagnóstico (`?debug=1`): muestra puntos detectados, inliers y cuadros por segundo.
- [x] Publicar en Pages y probar desde un celular real (probado por el usuario: anda bien, pero había que acercarse mucho).

### Fase 3: estabilidad
- [x] Agregar seguimiento con flujo óptico entre detecciones y suavizado de las esquinas (la detección corre en un worker; ver `src/seguimiento.js`).
- [ ] Ajustar la frecuencia de detección para llegar a unos 15 cuadros por segundo o más en un celular Android de gama media.
- [ ] Probar con reflejos del vidrio, poca luz y distintas distancias, y ajustar los umbrales.
- [ ] Si las áreas 08 y 10 no son estables, aplicar el plan B descrito arriba.

### Fase 4: contenido de las ventanas emergentes
- [x] Definir el formato en `contenido/contenidos.json`: por área, título, texto, imágenes, video y créditos. Se carga desde ahí para poder completarlo sin tocar el código.
- [x] Diseñar la ventana emergente para pantalla de celular: título, texto, galería de imágenes, video y botón de cierre.
- [ ] Cargar el contenido existente: infografía y fotos de Oncideres en el área 11, y las fotos de insectos por orden en las áreas que correspondan. Mostrar los créditos de cada imagen.
- [ ] Comprimir los videos a un tamaño razonable (idealmente menos de 10 MB cada uno) antes de subirlos al repo.
- [x] Dejar en "Contenido próximamente" las áreas sin material (hoy todas, hasta que se carguen los archivos).

### Fase 5: cierre para la Noche de los Museos
- [ ] Generar el código QR con la URL de Pages, en PNG y PDF listos para imprimir, en `qr/`.
- [ ] Pantalla de ayuda breve al abrir la app: cómo apuntar la cámara y cómo tocar un recuadro.
- [ ] Probar en al menos un Android y un iPhone, con Chrome y Safari.
- [ ] Revisar tiempos de carga con datos móviles y con el wifi del CRILAR.
- [ ] Completar el `README.md`: cómo publicar, cómo actualizar contenidos y cómo regenerar los recuadros desde `areas.json`.

## Criterios para dar cada fase por terminada

- **Fase 2:** al apuntar el celular a la vitrina, aparecen los 11 recuadros en su lugar y al tocar uno se abre la ventana emergente.
- **Fase 3:** los recuadros siguen a la vitrina al mover el celular, sin saltos visibles y sin que la app se trabe.
- **Fase 4:** cada área con material lo muestra, con sus créditos, y las demás indican que el contenido llega pronto.
- **Fase 5:** el QR lleva a la app publicada y funciona en los dos sistemas.

## Fuera de alcance por ahora

- Reconocer los carteles sin punto de referencia.
- Funcionar sin conexión.
- Reconocer especies individuales dentro de cada panel.
