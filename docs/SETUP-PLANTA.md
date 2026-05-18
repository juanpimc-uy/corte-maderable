# Setup de la PC de planta — impresión sin diálogo

Para que el flujo "tocar pieza → imprime" funcione sin el cuadro de impresión
del navegador, hay que dejar Chrome configurado en modo kiosk-print.

## Una sola vez

1. **Instalar el driver de la Datamax** en Windows. Verificar que imprime una
   etiqueta de prueba desde el panel de impresoras del sistema.
2. **Crear un perfil de Chrome dedicado** para la app (ej: `corte-maderable`).
   Esto evita pisar la impresora predeterminada de otros perfiles.
3. En ese perfil, **poner la Datamax como impresora predeterminada del perfil**
   (Settings → Avanzado → Imprimir → Por defecto).

## Shortcut de la PC de planta

Crear un acceso directo en el escritorio que lance:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --user-data-dir="C:\corte-maderable-profile" ^
    --kiosk-printing ^
    --start-fullscreen ^
    --app=https://corte.maderable.uy
```

Flags clave:

| Flag                        | Para qué |
|-----------------------------|----------|
| `--user-data-dir=...`       | perfil aislado, no pisa otros usuarios de Chrome |
| `--kiosk-printing`          | `window.print()` imprime directo, sin diálogo |
| `--start-fullscreen`        | pantalla completa para modo tablet |
| `--app=<url>`               | ventana sin barra de direcciones |

Opcional:
- `--kiosk` (kiosk full, sin salir con Esc). Solo si la PC es 100% dedicada.

## Verificación

1. Abrir el shortcut.
2. Optimizar un trabajo simple.
3. Ir a la pestaña Etiquetas.
4. Tocar una pieza → debe salir la etiqueta por la Datamax **sin diálogo**.
5. La pieza queda marcada como hecha en el SVG.

Si aparece el diálogo: revisar que la Datamax es default del perfil y que el
flag `--kiosk-printing` está activo (Chrome lo muestra brevemente al arrancar
en `chrome://version`).

## Tamaño de etiqueta

El `@page { size: ... }` en el HTML debe coincidir con el formato cargado en
la Datamax. Editar en `src/core/labels.js` (constante `LABEL_SIZE_MM`) y
recargar.
