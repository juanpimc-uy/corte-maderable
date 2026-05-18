# Etiquetas → Datamax · decisión y hallazgo

## Suposición original del alcance

> "En producción no se usa el cuadro de impresión del navegador. Se genera DPL
> y se envía a la Datamax por el mismo mecanismo que ya usa `etiquetas-maderable`.
> No se reinventa."

## Hallazgo (inspección del repo `etiquetas-maderable`)

El repo `juanpimc-uy/etiquetas-maderable` se inspeccionó vía Chrome el 2026-05-17.
Es un solo `index.html` con 25 funciones JS. Las dos funciones de impresión son
`printLabels()` y `printLabelsZoho()`. Ambas:

- Arman un DOM con las etiquetas (incluyen QR vía `QRCode(...)`).
- Aplican CSS `@page`/`@media print`.
- Disparan `window.print()`.

No hay:

- Generación de DPL (sin encoding `STX`/`ETX`/comandos de Datamax).
- Sockets, fetch a endpoints de impresión, ni agente local.
- Referencias a IP de la Datamax, drivers, ni print servers.

Los únicos endpoints serverless son `/api/zoho-token` y `/api/zoho-books` — para
hidratar productos desde Zoho Books. **Nada para impresión.**

**Conclusión:** la Datamax hoy recibe el trabajo como una impresora más del SO
(driver Windows). La app dispara el cuadro de impresión y el usuario confirma.

## Decisión para corte-maderable v1

Mismo patrón que `etiquetas-maderable`, **sin el cuadro intermedio**:

1. `labels.js` arma el DOM de la etiqueta con `@page { size: <largo>mm <ancho>mm }`
   exactamente al tamaño del label físico de la Datamax.
2. Llama `window.print()`.
3. En la PC de planta, Chrome se lanza con `--kiosk-printing` y la Datamax como
   impresora predeterminada del perfil → `window.print()` imprime sin diálogo.

Ver `SETUP-PLANTA.md` para el procedimiento.

## Punto de extensión (v2)

`labels.js` reservará `toDPL(piece, ctx)` exportada pero no implementada en v1.
Si en producción real el patrón kiosk no alcanza (por ej. la Datamax no responde
bien al driver, o se necesita confirmación de impresión), se puede pasar a:

- Agente local Node/Go que escucha en `localhost:XXXX` y reenvía DPL por TCP raw
  9100 / USB / paralelo a la Datamax.
- Función serverless en Vercel + túnel hacia la Datamax (Cloudflare Tunnel /
  Tailscale).

Cualquiera de los dos consume el mismo `toDPL()`, sin tocar la UI.
