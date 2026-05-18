/* corte-maderable · config pública (front-end)
 *
 * Apunta al MISMO Supabase que usa maderable-produccion. Esos dos valores
 * (URL + ANON_KEY) son públicos por diseño en Supabase — la seguridad la
 * da RLS sobre las tablas. El service_role_key vive solo en env vars de
 * Vercel y nunca toca este archivo.
 *
 * Para configurar:
 *   1. Copiá `SUPABASE_URL` y `SUPABASE_ANON_KEY` de
 *      https://maderable-produccion.vercel.app/js/supabase-config.js
 *      (o desde el panel de Supabase → Project Settings → API).
 *   2. Reemplazá los placeholders de abajo.
 *
 * Si el archivo queda con placeholders, la UI muestra el banner de
 * "MRP no configurado" y los campos Cliente/Proyecto pasan a texto libre.
 */

window.MRP_CONFIG = {
  SUPABASE_URL:      'PEGAR_AQUI_LA_URL',
  SUPABASE_ANON_KEY: 'PEGAR_AQUI_LA_ANON_KEY',

  // Tablas (asumido por defecto el schema estándar)
  CLIENTES_TABLE:  'clientes',
  PROYECTOS_TABLE: 'proyectos',
  // Campo por el que ordenamos los selects
  ORDER_BY: 'nombre',
  // Cantidad máxima de filas a traer (Supabase default = 1000)
  MAX_ROWS: 1000,
};
