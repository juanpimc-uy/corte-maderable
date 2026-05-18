/* core · etiquetas de pieza para Datamax
 *
 * Mismo patrón que etiquetas-maderable: armar DOM con la etiqueta
 * (con QR), aplicar @page con el tamaño físico del label, disparar
 * window.print(). Sin diálogo intermedio gracias a Chrome lanzado
 * con --kiosk-printing y Datamax como predeterminada en planta
 * (ver docs/SETUP-PLANTA.md).
 *
 * Contenido de etiqueta:
 *   - Proyecto, Cliente (cabecera)
 *   - Código de pieza con sufijo de instancia (P01-1, P01-2…)
 *   - Dimensiones (largo × ancho × espesor)
 *   - Material
 *   - Tablero (T1, T2…)
 *   - QR opcional con id de pieza
 *
 * Punto de extensión para v2 (DPL real):
 *   export function toDPL(piece, ctx) { ... }
 * Devolvería el string DPL listo para mandar a un agente local o
 * a una función serverless que abra socket TCP a la Datamax. No se
 * implementa en v1 — el flujo "tocar pieza → imprime" se resuelve
 * vía window.print + kiosk-printing.
 *
 * Pendiente.
 */
