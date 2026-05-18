-- corte-maderable · db/001_init.sql
-- Schema inicial para historial de cortes.
--
-- ▶ Este SQL se corre MANUALMENTE en el Supabase de maderable-produccion
--   (el mismo que usa el resto del ecosistema). Cuando esté listo, JP lo
--   pega en el SQL editor de Supabase y lo ejecuta. NO se ejecuta desde
--   código en ningún momento.
--
-- Premisa: el MRP de Maderable tiene tablas `clientes` y `proyectos`.
-- Acá no las creamos — solo referenciamos. La tabla `cortes` guarda
-- tanto los IDs (para joins) como una copia denormalizada del nombre
-- (para que los reportes históricos sigan siendo legibles aunque mañana
-- se renombre o se borre un cliente/proyecto del MRP).
--
-- Tipos de FK: se asume `bigint` (default de bigserial en Supabase). Si
-- en tu MRP `clientes.id` / `proyectos.id` son `uuid`, cambiá los tipos
-- de cliente_id / proyecto_id de bigint a uuid antes de correr.

create table if not exists cortes (
  id           bigserial primary key,

  -- referencias al MRP (mismas tablas que usan los otros productos)
  cliente_id   bigint,   -- ↩ clientes(id)
  proyecto_id  bigint,   -- ↩ proyectos(id)

  -- copia denormalizada para reportes históricos
  cliente      text not null,
  proyecto     text not null,
  material     text not null,
  espesor      numeric(8,3),

  -- payload del trabajo confirmado
  tableros     jsonb not null,
  piezas       jsonb not null,
  parametros   jsonb not null,

  -- metadata
  created_by   text,
  created_at   timestamptz not null default now(),

  -- FK opcionales: las creamos si las tablas existen y el tipo coincide.
  -- Comentá estas dos líneas si tu schema usa otro tipo de id (ej. uuid).
  constraint cortes_cliente_fk  foreign key (cliente_id)  references clientes(id)  on delete set null,
  constraint cortes_proyecto_fk foreign key (proyecto_id) references proyectos(id) on delete set null
);

create index if not exists cortes_created_at_idx on cortes (created_at desc);
create index if not exists cortes_proyecto_id_idx on cortes (proyecto_id);
create index if not exists cortes_cliente_id_idx  on cortes (cliente_id);

-- Vista cómoda para listados rápidos (sin los jsonb pesados):
create or replace view cortes_listado as
  select id, cliente_id, proyecto_id, cliente, proyecto, material, espesor,
         created_by, created_at,
         jsonb_array_length(tableros) as n_tableros,
         jsonb_array_length(piezas)   as n_piezas
  from cortes;

-- RLS: en v1, planta opera en red interna sin auth. Si más adelante se
-- agrega auth, descomentar esto y agregar policies de SELECT/INSERT por
-- rol authenticated:
--
-- alter table cortes enable row level security;
-- create policy "cortes_read_authenticated"  on cortes for select to authenticated using (true);
-- create policy "cortes_write_authenticated" on cortes for insert to authenticated with check (true);
