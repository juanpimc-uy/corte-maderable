/* tests · diff de G-code contra maqueta v3
 *
 * Garantiza paridad 1:1 entre el generador migrado y el de la maqueta.
 *
 * Mecánica:
 *   1. Caso fijo: despiece de 3 piezas, tablero 2440×1830, MDF 25.4,
 *      parámetros default, seed fija.
 *   2. Correr el optimizer y el genGcode del archivo migrado.
 *   3. Correr los mismos contra la maqueta v3 (cargada como string fixture).
 *   4. Comparar byte-a-byte (con CRLF normalizado).
 *
 * Cualquier diferencia rompe el test. Si JP aprueba un cambio, se actualiza
 * la fixture en el mismo commit.
 *
 * Pendiente.
 */
