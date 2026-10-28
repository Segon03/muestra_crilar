# Resultados de la Fase 1: comparación de detectores

Reproducir: `python3 tools/armar_banco.py` (banco) y `python3 tools/comparar.py` (estas tablas).
OpenCV para Python 4.10, cuadros reducidos a 480 px de ancho, homografía con MAGSAC (umbral 4 px),
"reconocido" = al menos 15 inliers (criterio del plan) y cuadrilátero proyectado plausible.
SIFT va sólo como referencia: no viene en el OpenCV.js estándar.

## Evaluación en `video_muestra2.mp4` (no usado para armar el banco)

50 cuadros (1 por segundo) para el porcentaje de reconocimiento; 16 cuadros anotados a mano
(63 cajas, `tests/gt_video_muestra2.json`) para el IoU. La anotación es a ojo, con unos 5-10 px
de error: sirve para comparar detectores, no como medida absoluta.

| Detector | Referencias | Cuadros con plano A | Cuadros con plano B | Cajas con proyección | IoU medio (todas las cajas) | IoU medio (sólo proyectadas) | Cajas con IoU ≥ 0,5 | ms/cuadro (PC) |
|---|---|---|---|---|---|---|---|---|
| ORB | foto base | 46 % | 14 % | 24 % | 0,17 | 0,72 | 21 % | 30 |
| ORB | banco (32) | 60 % | 52 % | 56 % | 0,36 | 0,66 | 43 % | 369 |
| AKAZE | foto base | 44 % | 12 % | 22 % | 0,18 | 0,79 | 21 % | 58 |
| AKAZE | banco (32) | 56 % | 38 % | 48 % | 0,34 | 0,72 | 40 % | 143 |
| SIFT (ref.) | foto base | 30 % | 16 % | 19 % | 0,15 | 0,81 | 19 % | 100 |
| SIFT (ref.) | banco (32) | 58 % | 36 % | 51 % | 0,37 | 0,73 | 46 % | 209 |

Proyecciones equivocadas (IoU entre 0 y 0,3): ORB con banco 6,3 %; el resto, 0 %.

## Evaluación sintética (foto base aumentada, 12 imágenes por tipo, 480×640)

Porcentaje de cajas con IoU ≥ 0,5 / IoU medio.

| Detector | Referencias | Frontal+luz | Rotación | Perspectiva | Escala | Desenfoque | Reflejos | Combinado |
|---|---|---|---|---|---|---|---|---|
| ORB | base | 100/0,98 | 100/0,98 | 100/0,98 | 44/0,39 | 52/0,49 | 11/0,11 | 22/0,21 |
| AKAZE | base | 100/0,99 | 100/0,99 | 100/0,98 | 63/0,61 | 74/0,70 | 42/0,40 | 21/0,20 |
| SIFT | base | 100/0,98 | 100/0,98 | 100/0,98 | 59/0,57 | 52/0,51 | 51/0,49 | 21/0,20 |

(Con banco el resultado sintético casi no cambia, como es esperable: las deformaciones salen de la misma foto.)

## Por cuadro anotado (IoU medio de las cajas del cuadro, banco)

| Segundo | 2 | 5 | 8 | 11 | 14 | 17 | 20 | 23 | 26 | 29 | 32 | 35 | 38 | 41 | 44 | 47 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ORB | 0,75 | 0,21 | 0,00 | 0,76 | 0,60 | 0,33 | 0,63 | 0,85 | 0,44 | 0,97 | 0,84 | 0,13 | 0,15 | 0,17 | 0,24 | 0,12 |
| AKAZE | 0,63 | 0,20 | 0,00 | 0,82 | 0,45 | 0,37 | 0,63 | 0,85 | 0,45 | 0,93 | 0,85 | 0,13 | 0,15 | 0,17 | 0,25 | 0,00 |
| SIFT | 0,73 | 0,20 | 0,00 | 0,78 | 0,55 | 0,61 | 0,67 | 0,85 | 0,46 | 0,93 | 0,84 | 0,13 | 0,15 | 0,17 | 0,25 | 0,06 |

## Lectura

- Una sola foto base no alcanza (confirma la prueba previa del plan). El banco de 32 vistas duplica o triplica los cuadros reconocidos y el IoU medio, pero en el video de evaluación sólo el 40-56 % de las cajas llegan a tener proyección.
- Cuando hay proyección, el IoU es bueno (0,66-0,81). El problema es cuántas veces se reconoce, no la precisión.
- Falla sistemática: segundos 35 a 47 (vitrina completa a media distancia, con vidrio y reflejos) y el segundo 8 (primer plano a través del vidrio con mucho reflejo). Ahí la caja (plano A) se reconoce, pero las áreas chicas de la base no.
- Con el banco, ORB reconoce más cuadros pero es el único con proyecciones falsas y 3-6 veces más lento por cuadro que AKAZE en esta prueba (se evalúa contra 32 vistas por cuadro; en la app habría que acotar esa búsqueda).
