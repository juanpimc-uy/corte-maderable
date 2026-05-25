/* api · /api/sheets (Vercel serverless function)
 *
 * CRUD de tableros (catálogo editable desde la app).
 *
 * Métodos:
 *   GET    /api/sheets               → lista activos (por orden, luego nombre)
 *   POST   /api/sheets               → crea un tablero
 *   PATCH  /api/sheets?id=N          → actualiza nombre/w/h/orden/is_default/active
 *   DELETE /api/sheets?id=N          → soft delete (active=false)
 *
 * Payload POST/PATCH:
 *   { nombre, w, h, is_default?, orden?, active? }
 *
 * Vive en schema `corte.sheets`. PostgREST necesita Accept-Profile / Content-Profile.
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (lo mismo que /api/cortes).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHEMA       = process.env.CORTES_SCHEMA || 'corte';

function envReady() { return Boolean(SUPABASE_URL && SERVICE_KEY); }

function supaHeaders(extra = {}) {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return await new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function bad(res, code, msg, extra) { res.status(code).json({ error: msg, ...(extra || {}) }); }

// Construye un payload validado a partir del body.
function buildRow(body, partial) {
  const out = {};
  if (body.nombre != null) out.nombre = String(body.nombre).trim();
  if (body.w != null) out.w = Number(body.w);
  if (body.h != null) out.h = Number(body.h);
  if (body.is_default != null) out.is_default = !!body.is_default;
  if (body.orden != null) out.orden = parseInt(body.orden, 10) || 100;
  if (body.active != null) out.active = !!body.active;

  if (!partial) {
    // POST: required fields
    if (!out.nombre) throw new Error('nombre vacío');
    if (!out.w || !out.h) throw new Error('w/h inválidos');
  } else {
    // PATCH: tolerar campos vacíos
    if (out.w != null && !out.w) throw new Error('w inválido');
    if (out.h != null && !out.h) throw new Error('h inválido');
  }
  return out;
}

export default async function handler(req, res) {
  if (!envReady()) {
    return bad(res, 503, 'supabase_not_configured', {
      hint: 'Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en las env vars de Vercel.',
    });
  }

  const u = new URL(req.url, 'http://x');
  const id = u.searchParams.get('id');

  // GET
  if (req.method === 'GET') {
    const includeInactive = u.searchParams.get('all') === '1';
    let q = 'sheets?select=*&order=orden.asc,nombre.asc';
    if (!includeInactive) q += '&active=eq.true';
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`,
        { headers: supaHeaders({ 'Accept-Profile': SCHEMA }) });
      if (!r.ok) return bad(res, r.status, 'supabase_get_failed', { detail: await r.text() });
      return res.status(200).json({ rows: await r.json() });
    } catch (e) {
      return bad(res, 500, 'fetch_error', { detail: e.message });
    }
  }

  // POST
  if (req.method === 'POST') {
    let body;
    try { body = await readJson(req); } catch (e) { return bad(res, 400, 'invalid_json', { detail: e.message }); }
    let row;
    try { row = buildRow(body, false); } catch (e) { return bad(res, 400, 'invalid_payload', { detail: e.message }); }
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/sheets`, {
        method: 'POST',
        headers: supaHeaders({ 'Prefer': 'return=representation', 'Content-Profile': SCHEMA }),
        body: JSON.stringify(row),
      });
      if (!r.ok) return bad(res, r.status, 'supabase_insert_failed', { detail: await r.text() });
      const inserted = await r.json();
      return res.status(201).json({ row: Array.isArray(inserted) ? inserted[0] : inserted });
    } catch (e) {
      return bad(res, 500, 'fetch_error', { detail: e.message });
    }
  }

  // PATCH
  if (req.method === 'PATCH') {
    if (!id) return bad(res, 400, 'missing_id');
    let body;
    try { body = await readJson(req); } catch (e) { return bad(res, 400, 'invalid_json', { detail: e.message }); }
    let row;
    try { row = buildRow(body, true); } catch (e) { return bad(res, 400, 'invalid_payload', { detail: e.message }); }
    if (!Object.keys(row).length) return bad(res, 400, 'empty_patch');
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/sheets?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: supaHeaders({ 'Prefer': 'return=representation', 'Content-Profile': SCHEMA }),
        body: JSON.stringify(row),
      });
      if (!r.ok) return bad(res, r.status, 'supabase_update_failed', { detail: await r.text() });
      const updated = await r.json();
      return res.status(200).json({ row: Array.isArray(updated) ? updated[0] : updated });
    } catch (e) {
      return bad(res, 500, 'fetch_error', { detail: e.message });
    }
  }

  // DELETE — soft delete (active = false) por defecto. Hard con ?hard=1.
  if (req.method === 'DELETE') {
    if (!id) return bad(res, 400, 'missing_id');
    const hard = u.searchParams.get('hard') === '1';
    try {
      if (hard) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/sheets?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: supaHeaders({ 'Content-Profile': SCHEMA }),
        });
        if (!r.ok) return bad(res, r.status, 'supabase_delete_failed', { detail: await r.text() });
        return res.status(200).json({ ok: true, hard: true });
      } else {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/sheets?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: supaHeaders({ 'Prefer': 'return=representation', 'Content-Profile': SCHEMA }),
          body: JSON.stringify({ active: false }),
        });
        if (!r.ok) return bad(res, r.status, 'supabase_archive_failed', { detail: await r.text() });
        return res.status(200).json({ ok: true, hard: false });
      }
    } catch (e) {
      return bad(res, 500, 'fetch_error', { detail: e.message });
    }
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return bad(res, 405, 'method_not_allowed');
}
