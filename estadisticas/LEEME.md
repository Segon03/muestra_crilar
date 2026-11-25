# Estadísticas de uso: cómo publicarlas

Esta carpeta tiene lo necesario para registrar de forma anónima cuántas visitas tiene la app, cuánto tiempo se quedan, a qué hora entran y desde qué provincia y país. El detalle del diseño está en `PLAN_ESTADISTICAS.md`.

## Qué hay

- `recepcion/`: Worker público que recibe los avisos de la app y los guarda. Solo puede escribir.
- `panel/`: Worker del panel privado. Solo puede leer. Detrás de Cloudflare Access.
- `schema.sql`: la tabla de visitas.
- `compartido/`: validaciones y verificación del login, usadas por los dos Workers.

La app envía los avisos desde `src/estadisticas.js`. Mientras `src/estadisticas-config.js` tenga la dirección vacía, las estadísticas están apagadas y la app no envía nada ni muestra el aviso de privacidad.

## Qué se guarda y qué no

Cada visita es una fila con: un identificador anónimo de la visita, un identificador anónimo del celular, la hora de inicio, la hora del último aviso, el país y la provincia. No se guarda la IP, la ciudad, el dispositivo, el nombre ni nada que identifique a una persona, y el video de la cámara nunca sale del celular.

## Antes de empezar

Los pasos se hacen en el panel de Cloudflare, sin instalar nada en tu computadora. Los nombres de los botones pueden variar un poco según cuándo lo mires. Calculá unos 30 a 40 minutos.

El Worker se publica solo desde GitHub cada vez que se actualiza la rama que se elija. Conviene elegir la misma rama que publica el sitio en GitHub Pages.

## Parte A: recepción (lo mínimo para empezar a contar)

1. **Cuenta.** Creá una cuenta gratuita en cloudflare.com.
2. **Base de datos.** En el menú, entrá a *Storage & databases > D1 SQL database* y creá una base llamada `muestra-crilar-estadisticas`. Dentro de la base, abrí la pestaña *Console*, pegá el contenido de `estadisticas/schema.sql` y ejecutalo. Copiá el *Database ID* que figura en la base.
3. **ID de la base en el código.** En `estadisticas/recepcion/wrangler.jsonc` y en `estadisticas/panel/wrangler.jsonc`, reemplazá `REEMPLAZAR_POR_EL_ID_DE_LA_BASE` por ese ID. No es un secreto.
4. **Publicar la recepción.** En *Workers & Pages*, elegí *Create > Import a repository*, conectá GitHub, autorizá el repositorio `Segon03/muestra_crilar` y completá:
   - Nombre del proyecto: `muestra-crilar-recepcion` (tiene que coincidir con el `name` del `wrangler.jsonc`).
   - Rama: la que publica el sitio.
   - Directorio raíz: `estadisticas/recepcion`.
   - Comando de despliegue: el que viene por defecto (`npx wrangler deploy`).

   Cuando termine, copiá la dirección que termina en `.workers.dev`.
5. **Conectar la app.** En `src/estadisticas-config.js`, escribí esa dirección seguida de `/api/e`, por ejemplo `https://muestra-crilar-recepcion.TU-SUBDOMINIO.workers.dev/api/e`, y subí el cambio a la rama que publica el sitio. En cuanto se actualice la página, las estadísticas se encienden.
6. **Probar.** Abrí la página desde un celular, esperá unos segundos y en la consola de la base ejecutá:

   ```sql
   SELECT datetime(inicio, 'unixepoch', '-3 hours') AS entrada, ultimo - inicio AS segundos, pais, provincia FROM visitas ORDER BY inicio DESC LIMIT 5;
   ```

   Tiene que aparecer una fila nueva, con el país y la provincia (a veces la provincia queda vacía según la conexión).

## Parte B: panel privado

7. **Publicar el panel.** Igual que el paso 4, con estos datos:
   - Nombre del proyecto: `muestra-crilar-panel`.
   - Directorio raíz: `estadisticas/panel`.
8. **Activar el login.** En Cloudflare, abrí *Zero Trust* y creá el equipo con el plan gratuito. Puede pedir una tarjeta para verificar el alta aunque no cobre. Después, en *Workers & Pages > muestra-crilar-panel > Settings > Domains & Routes*, activá *Cloudflare Access* en la dirección `workers.dev`. Al activarlo, se muestran dos datos: el dominio del equipo (algo como `tuequipo.cloudflareaccess.com`) y el *AUD tag*. Copiá los dos.
9. **Quién puede entrar.** En *Zero Trust > Access > Applications*, abrí la aplicación que se creó, y en su política de tipo *Allow* dejá como único permitido el correo `segundo.nc@conicet.gov.ar`. No uses una regla por dominio (`@conicet.gov.ar`): dejaría entrar a cualquier persona con un correo del CONICET.
10. **Datos de Access en el código.** En `estadisticas/panel/wrangler.jsonc`, completá `ACCESS_TEAM_DOMAIN` con el dominio del equipo (sin `https://`) y `ACCESS_AUD` con el AUD tag. No son secretos. Al subir el cambio, el panel se vuelve a publicar solo. Hasta que se completen, el panel responde "Acceso denegado" a todos, a propósito.
11. **Probar.** Abrí la dirección del panel en una ventana privada. Tiene que pedirte el correo y mandarte un código. Con un correo no autorizado no tiene que dejarte entrar.

### Sumar más correos después

No hace falta tocar el código. En *Zero Trust > Access > Applications*, abrí la aplicación del panel, editá la política *Allow* y agregá los correos (uno por uno). Se aplican al instante.

## Antes del evento: borrar los datos de prueba

Las pruebas que hagas antes del evento cuentan como visitas. Para dejar el panel en cero, en la consola de la base ejecutá:

```sql
DELETE FROM visitas WHERE inicio < 1795748400;
```

`1795748400` es el 27 de noviembre de 2026 a las 00:00, hora de Argentina. Revisá antes con `SELECT COUNT(*) FROM visitas WHERE inicio < 1795748400;` cuántas filas va a borrar.

Para que tus propias pruebas no cuenten, abrí la página una vez en tu celular con `?sinstats=1` al final de la dirección. Ese equipo queda excluido. Con `?sinstats=0` se vuelve a contar.

## Usar el panel

- **Período:** Hoy, últimos 7 días, la noche del evento (27/11 00:00 a 28/11 06:00) o fechas a elección. Antes del evento abre en "Hoy" y desde su inicio abre en la noche completa.
- **Descargar CSV:** las visitas del período, con punto y coma y codificación que abre bien en Excel en español.
- **Informe (PDF):** abre el cuadro de impresión del navegador; elegí "Guardar como PDF".
- **Conectados ahora:** cuenta los visitantes con actividad en el último minuto. Se actualiza solo cada 30 segundos.

## Cómo leer los números

- Un **ingreso** es una pestaña abierta con la página. Recargar la misma pestaña no suma. Abrirla de nuevo, o volver después de media hora sin actividad, sí suma.
- Los **visitantes únicos** son aproximados: se cuentan por un identificador anónimo guardado en cada celular.
- La **permanencia** se mide desde el ingreso hasta el último aviso, solo mientras la página está visible, con un tope de una hora por visita. Puede errar por unos segundos en cada visita.
- La **ubicación** sale de la conexión y es aproximada. Con VPN, datos móviles o el wifi del instituto puede no coincidir con el lugar real.

## Límites que conviene conocer

- La recepción solo acepta avisos con el origen de la página (`https://segon03.github.io`), pero ese dato puede falsificarse fuera de un navegador. Alguien con conocimientos técnicos podría inflar los números. No expone datos de nadie. Si pasara, se puede agregar una regla de límite de pedidos en Cloudflare.
- Los datos se quedan guardados hasta que se borren. Para borrar lo anterior a una fecha, usá `DELETE FROM visitas WHERE inicio < <segundos>` en la consola de la base.
- Si se cambia la dirección del sitio (otro usuario u otro nombre en GitHub Pages), hay que actualizar `ORIGEN_PERMITIDO` en `estadisticas/recepcion/wrangler.jsonc`.

## Si algo no anda

- **La app no registra visitas:** revisá que `src/estadisticas-config.js` tenga la dirección completa, con `/api/e` al final, y que la rama con ese cambio sea la que publica el sitio. Probá la página sin `?demo`, sin `?debug` y sin `?sinstats=1`.
- **El panel dice "Acceso denegado":** faltan o están mal `ACCESS_TEAM_DOMAIN` o `ACCESS_AUD`, o el correo no figura en la política *Allow*. Cerrá sesión (ventana privada) y volvé a entrar.
- **El panel dice "Sin acceso" después de un rato:** la sesión de Access venció. Recargá la página.
- **Aparecen visitas pero sin provincia:** pasa con algunas conexiones. Se muestran como "Sin dato".

## Pruebas

Desde la raíz del repositorio:

```
node tests/estadisticas.test.mjs
node tests/estadisticas_cliente.test.mjs
node tests/estadisticas_panel.test.mjs
NODE_PATH=$(npm root -g) node tests/e2e_estadisticas.cjs
```

Las tres primeras prueban la recepción, el login, el script de la app y los cálculos del panel. La última abre la app en un navegador y comprueba que cuenta, que no cuenta el modo demo y que sigue funcionando si la recepción no responde.
