/* api · /api/cortes (Vercel serverless function)
 *
 * Historial básico de cortes. Sin auth: en v1 la red es interna.
 *
 * Métodos:
 *   POST  /api/cortes        → guarda un trabajo confirmado en Supabase.
 *   GET   /api/cortes        → lista los últimos N (default 50).
 *
 * Payload POST esperado (validado mínimo, no estricto):
 *   {
 *     cliente:    string,
 *     proyecto:   string,
 *     material:   string,
 *     espesor:    number,
 *     tableros:   array  (RES.boards),
 *     piezas:     array  (despiece original),
 *     parametros: object (OPT efectivos),
 *     created_by: string?
 *   }
 *
 * Vars de entorno (Vercel):
 *   - SUPABASE_URL                  (ej: https://xxxx.supabase.co)
 *   - SUPABASE_SERVICE_ROLE_KEY     (NUNCA expuesta al front)
 *
 * Si faltan, el endpoint devuelve 503 con un mensaje claro.
 * No uso el cliente oficial de Supabase para no agregar dep — basta con
 * fetch contra el endpoint REST (PostgREST) que ya expone Supabase.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function envReady() {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

// Las tablas viven en el schema `corte` (no en public). PostgREST necesita
// que se lo digamos via Accept-Profile (GET) o Content-Profile (POST/PATCH).
const SCHEMA = process.env.CORTES_SCHEMA || 'corte';

function supaHeaders(extra = {}) {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function readJson(req) {
  // Vercel Node runtime: req.body puede venir parseado o como stream.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return await new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function bad(res, code, msg, extra) {
  res.status(code).json({ error: msg, ...(extra || {}) });
}

export default async function handler(req, res) {
  if (!envReady()) {
    return bad(res, 503, 'supabase_not_configured', {
      hint: 'Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en las env vars de Vercel.',
    });
  }

  if (req.method === 'GET') {
    const u = new URL(req.url, 'http://x');  // base falsa, solo para parsear query
    const id = u.searchParams.get('id');
    // Caso A: ?id=N  → trae el corte COMPLETO con jsonbs (para "abrir trabajo")
    if (id) {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/cortes?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
          { headers: supaHeaders({ 'Accept-Profile': SCHEMA }) }
        );
        if (!r.ok) return bad(res, r.status, 'supabase_get_failed', { detail: await r.text() });
        const rows = await r.json();
        if (!rows.length) return bad(res, 404, 'not_found');
        return res.status(200).json({ row: rows[0] });
      } catch (e) {
        return bad(res, 500, 'fetch_error', { detail: e.message });
      }
    }
    // Caso B: lista resumida (sin jsonbs pesados) — para /historial.html
    const limit = Math.min(200, Math.max(1, parseInt(u.searchParams.get('limit') || '50', 10)));
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/cortes_listado?select=*&order=created_at.desc&limit=${limit}`,
        { headers: supaHeaders({ 'Accept-Profile': SCHEMA }) }
      );
      if (!r.ok) return bad(res, r.status, 'supabase_get_failed', { detail: await r.text() });
      const rows = await r.json();
      return res.status(200).json({ rows });
    } catch (e) {
      return bad(res, 500, 'fetch_error', { detail: e.message });
    }
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readJson(req); }
    catch (e) { return bad(res, 400, 'invalid_json', { detail: e.message }); }

    // Validación mínima — toleramos cliente/proyecto vacíos (usuario no eligió del MRP).
    // Lo único que pedimos: arrays no vacíos y parametros.
    if (!Array.isArray(body.tableros) || !body.tableros.length) return bad(res, 400, 'missing_field', { field: 'tableros' });
    if (!Array.isArray(body.piezas)   || !body.piezas.length)   return bad(res, 400, 'missing_field', { field: 'piezas' });
    if (typeof body.parametros !== 'object' || !body.parametros) return bad(res, 400, 'missing_field', { field: 'parametros' });

    const cliStr   = (typeof body.cliente   === 'string' && body.cliente.trim())   || '(sin cliente)';
    const proyStr  = (typeof body.proyecto  === 'string' && body.proyecto.trim())  || '(sin proyecto)';
    const matStr   = (typeof body.material  === 'string' && body.material.trim())  || 'MDF';

    const row = {
      cliente:     cliStr,
      proyecto:    proyStr,
      // proyecto_id es text (apunta a public.proyectos_cache.id). cliente_id
      // ya no existe — el MRP no tiene tabla clientes separada.
      proyecto_id: body.proyecto_id == null ? null : String(body.proyecto_id),
      material:    matStr,
      espesor:     body.espesor == null ? null : Number(body.espesor),
      tableros:    body.tableros,
      piezas:      body.piezas,
      parametros:  body.parametros,
      created_by:  typeof body.created_by === 'string' ? body.created_by : null,
    };

    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/cortes`, {
        method: 'POST',
        headers: supaHeaders({
          'Prefer': 'return=representation',
          'Content-Profile': SCHEMA,
        }),
        body: JSON.stringify(row),
      });
      if (!r.ok) return bad(res, r.status, 'supabase_insert_failed', { detail: await r.text() });
      const inserted = await r.json();
      const id = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
      return res.status(201).json({ id, ok: true });
    } catch (e) {
      return bad(res, 500, 'fetch_error', { detail: e.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return bad(res, 405, 'method_not_allowed');
}
