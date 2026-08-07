/* core · orientación de mesa NEPOTIS
 *
 * El optimizer trabaja con el tablero "acostado": su eje X recorre el
 * LARGO del tablero y su eje Y el ANCHO. La NEPOTIS real es al revés:
 *
 *     X máquina → máx 2000 mm  (el tablero apoya el ANCHO acá)
 *     Y máquina → máx 3000 mm  (el LARGO corre sobre este eje)
 *
 * toMachine() rota el plano 90° (rotación pura, SIN espejar) para pasar
 * del espacio del optimizer al espacio físico de la mesa. Al ser una
 * rotación, el layout que se ve en pantalla es exactamente el que queda
 * sobre la mesa — no hay imagen especular.
 *
 * genGcode() NO se toca (sigue 1:1 con la maqueta v3): recibe las piezas
 * ya transformadas y genera los contornos anti-horarios en el espacio
 * nuevo, así que el sentido de fresado no cambia.
 *
 * Mapeo (rotación horaria del plano BL, W = largo del tablero):
 *   punto  (x, y)        → (y, W − x)
 *   rect   (x, y, w, h)  → (x' = y, y' = W − x − w, w' = h, h' = w)
 */

export function toMachine(parts, sheet) {
  const W = sheet.w;
  return {
    sheet: { ...sheet, w: sheet.h, h: sheet.w },
    parts: parts.map(p => ({ ...p, x: p.y, y: W - p.x - p.w, w: p.h, h: p.w })),
  };
}
