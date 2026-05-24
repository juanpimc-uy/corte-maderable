-- corte-maderable · db/001_init.sql
--
-- Schema inicial para historial de cortes en el Supabase de MBLE-INT.
--
-- ▶ JP corre este SQL en Supabase → SQL Editor. NO se ejecuta automático.
--
-- AISLAMIENTO TOTAL: todo vive en el schema `corte`. El MRP en `public`
-- no se toca. La FK desde `corte.cortes.proyecto_id` hacia
-- `public.proyectos_cache(id)` es outgoing (solo lectura) y on delete set null.
-- Para desinstalar: `drop schema corte cascade;` y desaparece.
--
-- v2: ajustado al schema real del MRP de Maderable:
--   - public.proyectos_cache(id text, cliente text, cliente_nombre text, nombre text, ...)
--   - NO existe tabla clientes separada. Cliente se deriva como texto
--     del campo `cliente` de los proyectos.
--
-- Drop al inicio porque la tabla está vacía y el modelo cambió respecto
-- a la versión anterior (bigint → text en proyecto_id, sin cliente_id).
-- Si más adelante se quiere preservar data en un upgrade, usar ALTER.

drop schema if exists corte cascade;
create schema corte;

create table corte.cortes (
  id           bigserial primary key,

  -- referencia al MRP (mismo tipo que proyectos_cache.id que es text)
  proyecto_id  text,           -- ↩ public.proyectos_cache(id)

  -- copia denormalizada para reportes históricos (sobrevive renames)
  cliente      text not null,  -- ej. "OFD" — viene de proyectos_cache.cliente
  proyecto     text not null,  -- ej. "MAQUETA-SPC1" — proyectos_cache.nombre o numero
  material     text not null,
  espesor      numeric(8,3),

  -- payload del trabajo confirmado
  tableros     jsonb not null,
  piezas       jsonb not null,
  parametros   jsonb not null,

  -- metadata
  created_by   text,
  created_at   timestamptz not null default now()
);

-- FK opcional al proyecto del MRP. Si proyectos_cache existe y su id es text, la creamos.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='proyectos_cache' and column_name='id' and data_type='text'
  ) then
    begin
      alter table corte.cortes
        add constraint cortes_proyecto_fk foreign key (proyecto_id)
        references public.proyectos_cache(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;
end$$;

create index cortes_created_at_idx  on corte.cortes (created_at desc);
create index cortes_proyecto_id_idx on corte.cortes (proyecto_id);
create index cortes_cliente_idx     on corte.cortes (cliente);

create view corte.cortes_listado as
  select id, proyecto_id, cliente, proyecto, material, espesor,
         created_by, created_at,
         jsonb_array_length(tableros) as n_tableros,
         jsonb_array_length(piezas)   as n_piezas
  from corte.cortes;

grant usage on schema corte to anon, authenticated, service_role;
grant select, insert, update, delete on corte.cortes to anon, authenticated, service_role;
grant select on corte.cortes_listado to anon, authenticated, service_role;
grant usage, select on sequence corte.cortes_id_seq to anon, authenticated, service_role;
