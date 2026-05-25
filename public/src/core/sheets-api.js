/* core · cliente del catálogo de tableros
 *
 * Habla con /api/sheets (serverless en Vercel) que a su vez habla con
 * corte.sheets en Supabase. Si el endpoint no está disponible (ej. dev local
 * sin vercel dev), funciones devuelven { ok:false } y la app cae al
 * hardcoded de src/data/sheets.js.
 */

async function api(method, path, body) {
  const url = '/api/sheets' + (path || '');
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (_) { /* ignore */ }
  if (!r.ok) return { ok: false, status: r.status, error: data && data.error, detail: data && data.detail };
  return { ok: true, data };
}

export async function listSheets(includeInactive) {
  const r = await api('GET', '?all=' + (includeInactive ? '1' : '0'));
  return r.ok ? { ok: true, rows: r.data.rows || [] } : r;
}

export async function createSheet(payload) {
  const r = await api('POST', '', payload);
  return r.ok ? { ok: true, row: r.data.row } : r;
}

export async function updateSheet(id, payload) {
  const r = await api('PATCH', '?id=' + encodeURIComponent(id), payload);
  return r.ok ? { ok: true, row: r.data.row } : r;
}

export async function archiveSheet(id) {
  const r = await api('DELETE', '?id=' + encodeURIComponent(id));
  return r.ok ? { ok: true } : r;
}
