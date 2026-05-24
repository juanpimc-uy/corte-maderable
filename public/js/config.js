/* corte-maderable · loader de config del front-end
 *
 * Antes este archivo tenía las claves hardcodeadas. Ahora las lee del
 * endpoint serverless /api/config, que las saca de env vars de Vercel.
 * Beneficio: nada sensible vive en el repo y la rotación de claves
 * no requiere commit.
 *
 * Mecánica:
 *   - window.MRP_CONFIG_PROMISE → promesa que resuelve con la config.
 *   - window.MRP_CONFIG → poblado tras el fetch exitoso (para código
 *     legacy que esperaba esta global).
 *
 * En desarrollo local sin /api/config (ej. python3 -m http.server),
 * el fetch va a fallar con 404 y la app cae al modo "texto libre"
 * automáticamente. Para probar con MRP en local: usar `vercel dev`.
 */

window.MRP_CONFIG_PROMISE = (async () => {
  try {
    const r = await fetch('/api/config', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) {
      console.warn('[config] /api/config respondió', r.status);
      return null;
    }
    const cfg = await r.json();
    if (!cfg.ok) {
      console.warn('[config] backend reporta:', cfg.reason || 'desconocido');
      return null;
    }
    window.MRP_CONFIG = cfg;
    return cfg;
  } catch (e) {
    console.warn('[config] no pude cargar /api/config:', e.message);
    return null;
  }
})();
