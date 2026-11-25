# Plan de tareas: estadísticas de uso y panel privado

## Qué se va a construir

Un registro anónimo de cómo se usa la web app de la vitrina y un panel privado para consultarlo. Solo se mide esto:

- Cantidad de ingresos.
- Tiempo de permanencia.
- Horarios de uso.
- Ubicación aproximada: país y provincia.

No se registra qué áreas se tocan, qué dispositivo usa cada persona, ni nada que identifique a alguien.

## Cómo funciona

El sitio está en GitHub Pages, que es estático y no puede guardar datos. Por eso la app envía avisos a un servicio aparte en Cloudflare, que los guarda y sirve el panel.

1. Al abrir la página, la app avisa "ingresó alguien". Mientras la página está visible, avisa cada 15 segundos "sigue acá".
2. Un Cloudflare Worker de **recepción**, público, recibe los avisos y los guarda en una base de datos D1. El país y la provincia los toma de los datos que Cloudflare ya agrega a cada conexión. La IP no se guarda. Solo puede escribir.
3. Un segundo Worker, el **panel**, lee la base y muestra los resultados. Está detrás de un login de Cloudflare Access: solo entran los correos autorizados. Solo puede leer.

Son dos Workers y no uno porque el login de Access de un `workers.dev` protege el sitio entero y no permite dejar una ruta pública. Separarlos deja la recepción abierta y el panel cerrado, sin necesidad de un dominio propio.

## Decisiones ya tomadas

- **Servicio:** Cloudflare Workers + D1 + Access, plan gratuito. Alcanza de sobra para este volumen.
- **Una fila por visita:** los avisos de "sigue acá" no crean filas nuevas, solo actualizan la hora del último aviso de esa visita. La permanencia es la diferencia entre el último aviso y el inicio.
- **Reloj del servidor:** la hora la pone el Worker, no el celular. Los horarios se muestran en hora de Argentina.
- **Sin cookies:** la app guarda dos identificadores anónimos al azar en el propio celular (uno para el visitante y otro para la visita). No tienen relación con ninguna persona.

## Antes de empezar: la rama del código

El código de la app está en la rama `claude/serene-ptolemy-bmmjlh`, no en `main`. El sitio publicado parece salir de esa rama. Hay que confirmar desde Settings > Pages de GitHub cuál es la rama de publicación y, si conviene, pasar el código a `main` antes de conectar Cloudflare, para que todo siga una sola rama.

## Reglas

1. Nada de secretos en el repositorio: ni claves ni tokens. Los repos de GitHub Pages son públicos y el código del Worker también lo sería.
2. Los datos viven solo en D1 y se leen solo a través del panel protegido. El Worker del panel debe rechazar cualquier pedido que no traiga un token válido de Cloudflare Access, aunque Access esté mal configurado. Si falta la configuración, rechaza todo.
3. Si el servicio de estadísticas falla o no responde, la app sigue andando igual y sin avisar al visitante. Un error de estadísticas nunca puede romper la experiencia.
4. El video de la cámara no sale del celular, y eso no cambia.
5. Los accesos en modo demostración (`?demo=1`), diagnóstico (`?debug=1`) y desde `localhost` no se cuentan.
6. La carpeta `estadisticas/` es la excepción a la regla de "sin node_modules ni compilación" de `CLAUDE.md`. Se actualiza esa regla.

## Estructura prevista

```
estadisticas/
  schema.sql            tabla de visitas
  compartido/           validación de pedidos y verificación del token de Access
  recepcion/            Worker público (wrangler.jsonc y src/index.js)
  panel/                Worker del panel (wrangler.jsonc, src/index.js) y public/ con la página
  LEEME.md              pasos para publicar, con las pantallas de Cloudflare a seguir
src/estadisticas.js     script que se suma a la app
src/estadisticas-config.js   dirección de la recepción (vacía = estadísticas apagadas)
tests/estadisticas*.test.mjs
```

## Fases y tareas

### Fase 0: cuentas y decisiones (las hace el usuario)
- [ ] Crear una cuenta gratuita de Cloudflare. Al activar Access (Zero Trust) puede pedir una tarjeta para verificar el alta aunque el plan sea gratuito: confirmarlo al hacerlo.
- [x] Correo autorizado para el panel: `segundo.nc@conicet.gov.ar`. Se pueden sumar otros más adelante desde Cloudflare, sin tocar el código.
- [x] Fecha de la Noche de los Museos: 27 de noviembre de 2026. El filtro "evento" del panel cubre desde las 00:00 del 27 hasta las 06:00 del 28 (hora de Argentina), para incluir la madrugada.
- [ ] El evento es en dos días: priorizar recepción, script de la app y panel con indicadores. Los extras (mapa de calor, indicador en vivo) solo si queda tiempo.
- [ ] Plan B si no se quiere usar Access: contraseña única guardada como secreto del Worker. Es menos robusta y se decide solo si Access no es viable.

### Fase 1: servicio de recepción (Worker `recepcion` y base)
- [x] `schema.sql`: tabla `visitas` con `id` (de la visita), `visitante`, `inicio` y `ultimo` (hora en segundos), `pais` y `provincia`.
- [x] `POST /api/e`: recibe `{t: "i" | "l", s, v}`. En `"i"` crea la visita con el país y la provincia que da Cloudflare. En `"l"` actualiza `ultimo`, sin aceptar más de un aviso cada 5 segundos por visita.
- [x] Validar el formato de los identificadores, limitar el tamaño del pedido y aceptar solo pedidos que vengan de `https://segon03.github.io` (CORS y encabezado `Origin`).
- [x] No guardar la IP ni la ciudad. Guardar solo país y provincia.
- [x] Tope de permanencia por visita (60 minutos) para que un celular olvidado con la página abierta no distorsione los promedios.
- [x] Pruebas con Node en `tests/estadisticas.test.mjs` sobre las funciones puras: validación, tope de tiempo y agregaciones. Seguir el estilo de las pruebas que ya existen.

### Fase 2: script en la app
- [x] `src/estadisticas.js`: crear los dos identificadores al azar (visitante en `localStorage`, visita en `sessionStorage`), enviar el aviso de ingreso y el latido cada 15 s mientras la página esté visible, y un último aviso al ocultarse o cerrarse la página con `sendBeacon`.
- [x] Si `localStorage` no está disponible (modo privado), seguir funcionando con un identificador temporal.
- [x] Excluir `?demo`, `?debug`, `localhost` y un parámetro `?sinstats=1` que marque el equipo para no contarlo nunca (para las pruebas del equipo).
- [x] Llamarlo desde `src/app.js` sin que un error pueda detener la app.
- [x] Sumar a la pantalla de inicio una línea corta: "Guardamos estadísticas de uso anónimas. No registramos datos personales ni imágenes de la cámara."

### Fase 3: panel
- [x] El Worker del panel valida el token de Access en todos los pedidos y entrega la página y los datos (`/api/visitas`).
- [x] Indicadores arriba: ingresos totales, visitantes únicos aproximados, permanencia mediana y promedio, y porcentaje de visitas que duran más de un minuto.
- [x] Gráficos: ingresos por hora del día (hora de Argentina), por día y mapa de calor de día de la semana por hora. Distribución de permanencia por tramos (menos de 30 s, 30 a 60 s, 1 a 3 min, 3 a 10 min, más de 10 min). Ingresos por país y por provincia.
- [x] Selector de rango: hoy, últimos 7 días, el evento y fechas a elección.
- [x] Exportar a CSV las visitas del rango elegido.
- [x] Vista de informe imprimible para guardar como PDF desde el navegador.
- [x] Opcional: indicador de personas conectadas en este momento (visitas con último aviso de hace menos de un minuto), pensado para el día del evento.
- [x] Aclarar en el panel que la ubicación es aproximada y se ve afectada por VPN, datos móviles y el wifi del CRILAR.

### Fase 4: publicación y pruebas
- [x] Escribir `estadisticas/LEEME.md` con cada paso en Cloudflare: crear la base D1, correr `schema.sql`, conectar el repositorio para que el Worker se publique solo (el equipo no tiene Node instalado, por eso no se usa la línea de comandos de Cloudflare), crear la aplicación de Access y cargar los valores de configuración.
- [ ] Probar desde dos celulares, uno con datos móviles y otro con el wifi, y con una VPN. Comparar los números del panel con lo que se hizo a mano.
- [ ] Comprobar que la base no tiene ninguna IP y que un pedido directo a `/api/panel/...` sin sesión es rechazado.
- [ ] Probar que la app sigue funcionando si el Worker no responde.

### Fase 5: puesta en marcha para el evento
- [ ] Borrar los datos de prueba antes del evento. Dejar la consulta lista en `LEEME.md`.
- [ ] Definir cuánto tiempo se guardan los datos y dejar escrito cómo borrarlos.
- [ ] Dejar una exportación a CSV al terminar el evento como respaldo.

## Criterios para dar cada fase por terminada

- **Fase 1:** un pedido válido crea una visita y los avisos siguientes extienden su duración. Uno inválido o de otro origen se rechaza.
- **Fase 2:** al abrir la página desde un celular aparece una visita nueva, y las visitas en `?demo` o `?debug` no aparecen.
- **Fase 3:** los números del panel coinciden con las pruebas hechas a mano, y sin sesión no se puede leer nada.
- **Fase 4:** las pruebas con los dos celulares y la VPN dan resultados coherentes.
- **Fase 5:** el panel arranca en cero y hay un CSV de respaldo.

## Fuera de alcance

- Qué áreas se tocan, dispositivo, ciudad y cualquier dato personal.
- Cookies de terceros o herramientas de seguimiento de otras empresas.
- Seguimiento de personas entre dispositivos.
