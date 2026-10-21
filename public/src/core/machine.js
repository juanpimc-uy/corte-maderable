/* core · orientación de mesa NEPOTIS
 *
 * El optimizer trabaja con el tablero "acostado": su eje X recorre el
 * LARGO del tablero y su eje Y el ANCHO. La NEPOTIS real es al revés:
 *
 *     X máquina → máx 2000 mm  (el tablero apoya el ANCHO acá)
 *     Y máquina → máx 3000 mm  (el LARGO corre sobre este eje)
 *
 * toMachine() TRANSPONE el plano (x↔y) para pasar del espacio del
 * optimizer al espacio físico de la mesa. Se eligió la transposición
 * (y no una rotación) a propósito: la esquina donde el optimizer
 * agrupa el nesting (su 0,0) cae en el 0,0 de la máquina — el corte
 * arranca pegado al origen G54 y el sobrante queda arriba/derecha
 * (pedido de planta 2026-08-10).
 *
 * Consistencia garantizada: el preview (svgBoard) y el G-code se
 * generan AMBOS desde estas coordenadas máquina, así que lo que se ve
 * es lo que se corta — no puede haber espejo entre plano y mecanizado.
 * genGcode() no se toca (1:1 maqueta): recibe rects ya transformados y
 * genera los contornos anti-horarios en el espacio nuevo.
 *
 * Veta: el largo de la pieza (X del optimizer) queda sobre el eje Y de
 * la máquina = largo del tablero → la convención largo ∥ veta se
 * mantiene idéntica.
 *
 * Mapeo (transposición):
 *   punto  (x, y)        → (y, x)
 *   rect   (x, y, w, h)  → (x' = y, y' = x, w' = h, h' = w)
 */

export function toMachine(parts, sheet) {
  return {
    sheet: { ...sheet, w: sheet.h, h: sheet.w },
    parts: parts.map(p => ({ ...p, x: p.y, y: p.x, w: p.h, h: p.w })),
  };
}
