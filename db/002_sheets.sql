-- corte-maderable · db/002_sheets.sql
--
-- Catálogo de tableros editable desde la app.
-- Sembrado con los 7 tableros default actuales (src/data/sheets.js)
-- para no quedar con el dropdown vacío después de correr.
--
-- ▶ JP corre este SQL en SQL Editor de Supabase (MBLE-INT). Una sola vez.
--   El SQL es idempotente: usa "if not exists" y "on conflict do nothing".

create table if not exists corte.sheets (
  id          bigserial primary key,
  nombre      text not null,                  -- ej. "MDF estándar 2750"
  w           numeric(8,1) not null,          -- mm
  h           numeric(8,1) not null,          -- mm
  is_default  boolean not null default false, -- el que se selecciona al abrir la app
  orden       int     not null default 100,   -- para sort manual del dropdown
  active      boolean not null default true,  -- soft-delete
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sheets_active_orden_idx on corte.sheets (active, orden) where active = true;

-- Trigger para mantener updated_at al día
create or replace function corte.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sheets_updated_at on corte.sheets;
create trigger sheets_updated_at
  before update on corte.sheets
  for each row execute function corte.set_updated_at();

-- Seed con los 7 actuales (solo si la tabla está vacía).
insert into corte.sheets (nombre, w, h, is_default, orden)
select nombre, w, h, is_default, orden from (values
  ('MDF estándar 2750×1830',  2750, 1830, true,  10),
  ('MDF estándar 2440×1830',  2440, 1830, false, 20),
  ('Compacto 2440×1220',      2440, 1220, false, 30),
  ('Grande 2800×2070',        2800, 2070, false, 40),
  ('Largo 3050×1830',         3050, 1830, false, 50),
  ('Vertical 1830×2600',      1830, 2600, false, 60),
  ('Extra largo 3660×1830',   3660, 1830, false, 70)
) as v(nombre, w, h, is_default, orden)
where not exists (select 1 from corte.sheets);

-- Permisos para PostgREST
grant select, insert, update, delete on corte.sheets to anon, authenticated, service_role;
grant usage, select on sequence corte.sheets_id_seq to anon, authenticated, service_role;
