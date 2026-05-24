/* api · /api/config (Vercel serverless function)
 *
 * Devuelve la configuración pública que el front-end necesita para
 * conectarse al MRP en Supabase. Lee de env vars de Vercel.
 *
 * Por qué no hardcodear en public/js/config.js:
 * - El repo es público en GitHub.
 * - Aunque la ANON_KEY es "pública" por diseño de Supabase, sacarla
 *   del repo nos da rotación de claves sin tocar código.
 * - Mantiene una sola fuente de verdad para todas las env de Supabase.
 *
 * Vars requeridas en Vercel (Project Settings → Environment Variables):
 *   - SUPABASE_URL                 (ej: https://xhfeurinovvsbgobkidy.supabase.co)
 *   - SUPABASE_ANON_KEY            (la clave pública, jwt eyJ...)
 *   - SUPABASE_SERVICE_ROLE_KEY    (solo para /api/cortes, nunca expuesta acá)
 *
 * Vars opcionales (con defaults sensatos si faltan):
 *   - MRP_SCHEMA                   ('public' por default)
 *   - MRP_CLIENTES_TABLE           ('clientes')
 *   - MRP_PROYECTOS_TABLE          ('proyectos')
 *   - MRP_ORDER_BY                 ('nombre')
 *
 * IMPORTANTE: este endpoint NUNCA devuelve SUPABASE_SERVICE_ROLE_KEY.
 */

export default function handler(req, res) {
  const SUPABASE_URL      = process.env.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(200).json({
      ok: false,
      reason: 'env_vars_missing',
      hint: 'Falta SUPABASE_URL y/o SUPABASE_ANON_KEY en las env vars de Vercel.',
    });
  }

  // Pequeña cache para evitar pegarle cada carga (5 min). El front igual cachea en memoria.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  return res.status(200).json({
    ok: true,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    // schema en el que viven clientes/proyectos del MRP (default public)
    MRP_SCHEMA:       process.env.MRP_SCHEMA       || 'public',
    CLIENTES_TABLE:   process.env.MRP_CLIENTES_TABLE  || 'clientes',
    PROYECTOS_TABLE:  process.env.MRP_PROYECTOS_TABLE || 'proyectos',
    ORDER_BY:         process.env.MRP_ORDER_BY        || 'nombre',
    MAX_ROWS:         1000,
  });
}
