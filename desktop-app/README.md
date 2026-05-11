# Pausa Activa Gato Desktop

Aplicacion de escritorio para mostrar pausas activas programadas en pantalla, sin depender del navegador ni de URLs.

## Funciones incluidas

- Panel de configuracion para definir la duracion de la pausa.
- Horas programadas en formato `HH:mm`, una por linea y en formato de '24H'.
- Ejecucion en segundo plano desde la bandeja del sistema.
- Opcion de iniciar con Windows.
- Boton para probar la pausa inmediatamente.
- Overlay de pausa a pantalla completa, siempre encima.

## Videos

Coloca tus videos definitivos en:

- `src/assets/break-start.webm`
- `src/assets/break-loop.webm`

Durante desarrollo, si esos archivos no existen, la app intenta usar los videos del proyecto original ubicados en `../assets/neko1.webm` y `../assets/neko2.webm`.

Importante: los assets del proyecto original tienen una licencia separada y restrictiva. Para distribuir el ejecutable, reemplazalos por videos propios o autorizados. este proyecto y sucreador no femomentan el uso de estos assets ni su distribución, este proyecto se realiza sin animo de lucro.

## Comandos

```powershell
npm install
npm run dev
npm run build
```

El instalador para Windows se genera con `electron-builder`.

## Notas

La app no monitorea URLs ni uso del navegador. Las pausas se activan solo por horario.
Para arrancar el generar el build se usa "npm.cmd run build" esto genera el ejecutable