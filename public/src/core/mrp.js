/* core · cliente MRP (lectura directa Supabase REST)
 *
 * Lee proyectos del MRP de Maderable (Supabase MBLE-INT), tabla `proyectos_cache`.
 * Esa tabla tiene el proyecto y el cliente denormalizado en cada fila — no hay
 * tabla de clientes separada. Derivamos la lista de clientes en el front a
 * partir de los valores distintos del campo `cliente`.
 *
 * Schema real (public.proyectos_cache):
 *   id           text  (PK)
 *   numero       text
 *   nombre       text
 *   cliente      text  ← agrupador
 *   cliente_nombre text  (nombre largo, opcional)
 *   estado       text
 *   activo       boolean
 *   obra         text
 *   fecha_creacion text
 *   ...
 *
 * Si la config no está disponible o la red falla, devolvemos { ok: false,
 * error } y la UI cae a inputs de texto libre.
 */

function getCfg() {
  const c = window.MRP_CONFIG;
  if (!c) return null;
  if (!c.SUPABASE_URL || !c.SUPABASE_ANON_KEY) return null;
  return c;
}

// La config viene async desde /api/config (cargado por public/js/config.js).
export async function waitForConfig() {
  if (window.MRP_CONFIG_PROMISE) {
    try { await window.MRP_CONFIG_PROMISE; } catch (_) {}
  }
  return getCfg();
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

// Cache en memoria para no pegarle al MRP en cada interacción.
let _proyectosCache = null;
async function getProyectos() {
  if (_proyectosCache) return _proyectosCache;
  const cfg = getCfg();
  // Solo proyectos activos, con cliente no vacío.
  const rows = await rest('proyectos_cache?select=id,numero,nombre,cliente,cliente_nombre,activo&activo=eq.true&order=cliente.asc,nombre.asc&limit=' + (cfg.MAX_ROWS || 1000));
  _proyectosCache = rows.filter(r => (r.cliente || '').trim());
  return _proyectosCache;
}

// Permite forzar refresh (ej. botón "Recargar MRP" si se agrega).
export function clearMrpCache() { _proyectosCache = null; }

// Lista clientes únicos derivados de proyectos_cache.cliente.
// Devuelve [{id: 'OFD', nombre: 'OFD'}] — id == nombre porque no hay catálogo
// real. Mantenemos forma {id, nombre} para que la UI no cambie.
export async function listClientes() {
  const cfg = getCfg();
  if (!cfg) return { ok: false, error: 'no_config' };
  try {
    const proys = await getProyectos();
    const set = new Set();
    for (const p of proys) {
      const c = (p.cliente || '').trim();
      if (c) set.add(c);
    }
    const rows = [...set].sort((a, b) => a.localeCompare(b, 'es')).map(c => ({ id: c, nombre: c }));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Lista proyectos para un cliente dado (filtra por nombre exacto del cliente).
// Devuelve [{id, nombre, cliente_id}] con id = proyectos_cache.id (text).
export async function listProyectos(clienteId) {
  const cfg = getCfg();
  if (!cfg) return { ok: false, error: 'no_config' };
  try {
    const proys = await getProyectos();
    const rows = proys
      .filter(p => (p.cliente || '').trim() === clienteId)
      .map(p => ({
        id: p.id,
        nombre: p.numero ? (p.numero + ' · ' + p.nombre) : p.nombre,
        cliente_id: p.cliente,
      }));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
