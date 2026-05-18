/* tests · integridad del optimizer
 *
 * Invariantes que deben cumplirse SIEMPRE, sin excepción:
 *   1. Cero solapamientos entre piezas (en cualquier tablero).
 *   2. Cero piezas fuera de los bordes (respetando refilado).
 *   3. 100% de las piezas del despiece quedan ubicadas.
 *   4. El conteo de tableros usados ≥ mínimo teórico (área total / área tablero).
 *   5. Resultado determinista para misma entrada + misma seed.
 *
 * Casos a cubrir:
 *   - Despiece chico (5-10 piezas) en un solo tablero.
 *   - Despiece grande (>50 piezas) que requiere 2-3 tableros.
 *   - Pieza con veta forzada (no rotable).
 *   - Pieza al ras del tablero (largo == largo_tablero - 2*refilado).
 *
 * Pendiente.
 */
