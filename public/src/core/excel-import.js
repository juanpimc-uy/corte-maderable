/* core · import de despiece desde Excel
 *
 * Lee un .xlsx (SheetJS, cargado por CDN o como dep) y devuelve un array PCS[].
 *
 * Columnas esperadas (decisión JP):
 *   1. Código        (texto)
 *   2. Largo         (mm, número)
 *   3. Ancho         (mm, número)
 *   4. Cant          (entero ≥ 1)
 *   5. Veta          (true/false; "si"/"no"; con/sin)
 *   6. Descripción   (texto, opcional)
 *
 * Tolerancia:
 *   - Encabezados case-insensitive.
 *   - Sinónimos aceptados: cantidad/qty (Cant), grano (Veta), desc (Descripción).
 *   - Mensaje de error claro si falta una columna obligatoria.
 *
 * Pendiente.
 */
