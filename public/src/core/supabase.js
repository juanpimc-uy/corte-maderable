/* core · cliente Supabase para historial básico
 *
 * Lee SUPABASE_URL y SUPABASE_ANON_KEY desde variables de entorno
 * inyectadas por Vercel en build (window.__SUPA__ o similar). Mismo
 * patrón que el ecosistema (etiquetas-maderable).
 *
 * API expuesta:
 *   - saveCorte(payload)   → POST a /api/cortes
 *   - listCortes(limit)    → GET  a /api/cortes?limit=…
 *
 * Las funciones serverless en api/cortes.js usan la service-role key
 * (server-side only) para validar e insertar. El front nunca ve la
 * service key.
 *
 * Pendiente.
 */
