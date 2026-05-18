/* core · cliente MRP (lectura directa Supabase REST)
 *
 * Lee Clientes y Proyectos directo desde el Supabase de maderable-produccion.
 * Sin cliente oficial de Supabase para no agregar dep — fetch al endpoint
 * PostgREST con el anon key + apikey header.
 *
 * Schema asumido:
 *   clientes  (id, nombre)
 *   proyectos (id, nombre, cliente_id)
 *
 * Si la config no está cargada o las llamadas fallan, devuelve { ok: false,
 * error } y la UI muestra el fallback de texto libre.
 */

function getCfg() {
  const c = window.MRP_CONFIG;
  if (!c) return null;
  if (!c.SUPABASE_URL || c.SUPABASE_URL.startsWith('PEGAR_AQUI')) return null;
  if (!c.SUPABASE_ANON_KEY || c.SUPABASE_ANON_KEY.startsWith('PEGAR_AQUI')) return null;
  return c;
}

export function mrpConfigured() {
  return getCfg() !== null;
}

async function rest(path) {
  const cfg = getCfg();
  if (!cfg) throw new Error('MRP_CONFIG no completado');
  const url = `${cfg.SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    headers: {
      'apikey':        cfg.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
      'Accept':        'application/json',
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

// Lista todos los clientes (orden alfabético).
export async function listClientes() {
  const cfg = getCfg();
  if (!cfg) return { ok: false, error: 'no_config' };
  try {
    const rows = await rest(`${cfg.CLIENTES_TABLE}?select=id,nombre&order=${cfg.ORDER_BY}.asc&limit=${cfg.MAX_ROWS}`);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Lista proyectos de un cliente. Si cliente_id es null, devuelve todos.
export async function listProyectos(clienteId) {
  const cfg = getCfg();
  if (!cfg) return { ok: false, error: 'no_config' };
  try {
    let q = `${cfg.PROYECTOS_TABLE}?select=id,nombre,cliente_id&order=${cfg.ORDER_BY}.asc&limit=${cfg.MAX_ROWS}`;
    if (clienteId != null) q += `&cliente_id=eq.${encodeURIComponent(clienteId)}`;
    const rows = await rest(q);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
