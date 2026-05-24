-- corte-maderable · db/001_init.sql
-- Schema inicial para historial de cortes.
--
-- ▶ Este SQL se corre MANUALMENTE en el Supabase de MBLE-INT (el del MRP).
--   JP lo pega en el SQL editor de Supabase y lo ejecuta. NO se ejecuta
--   desde código en ningún momento.
--
-- AISLAMIENTO TOTAL del MRP: TODO vive en un schema separado llamado
-- `corte`. Tu `public.clientes`, `public.proyectos`, etc. no se tocan.
-- Las foreign keys hacia `public.*` son outgoing (solo leen referencias)
-- y `on delete set null`, así que tampoco bloquean borrados en el MRP.
--
-- Si en algún momento querés desinstalar este módulo, basta con:
--   drop schema corte cascade;
-- y todo lo de acá desaparece, sin afectar nada del MRP.
--
-- DESPUÉS DE CORRER ESTE SQL: Supabase Dashboard → Settings → API →
-- "Exposed schemas" → agregar `corte`. Eso habilita los endpoints REST
-- /rest/v1/cortes y /rest/v1/cortes_listado.

-- ----- schema aislado -----
create schema if not exists corte;

-- ----- tabla principal -----
create table if not exists corte.cortes (
  id           bigserial primary key,

  -- referencias al MRP (cross-schema, solo lectura, on delete set null)
  cliente_id   bigint,   -- ↩ public.clientes(id)
  proyecto_id  bigint,   -- ↩ public.proyectos(id)

  -- copia denormalizada para reportes históricos (sobrevive renames)
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
  created_at   timestamptz not null default now()
);

-- FK opcionales: las creamos si las tablas existen y el tipo coincide.
-- Comentá / cambiá tipo si tu schema MRP usa otro tipo de id (ej. uuid).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='clientes') then
    begin
      alter table corte.cortes
        add constraint cortes_cliente_fk foreign key (cliente_id) references public.clientes(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='proyectos') then
    begin
      alter table corte.cortes
        add constraint cortes_proyecto_fk foreign key (proyecto_id) references public.proyectos(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;
end$$;

create index if not exists cortes_created_at_idx  on corte.cortes (created_at desc);
create index if not exists cortes_proyecto_id_idx on corte.cortes (proyecto_id);
create index if not exists cortes_cliente_id_idx  on corte.cortes (cliente_id);

-- ----- vista resumida (sin jsonb pesados) -----
create or replace view corte.cortes_listado as
  select id, cliente_id, proyecto_id, cliente, proyecto, material, espesor,
         created_by, created_at,
         jsonb_array_length(tableros) as n_tableros,
         jsonb_array_length(piezas)   as n_piezas
  from corte.cortes;

-- ----- permisos para que PostgREST pueda leer/escribir -----
-- (Supabase usa los roles anon y authenticated)
grant usage on schema corte to anon, authenticated, service_role;
grant select, insert, update, delete on corte.cortes to anon, authenticated, service_role;
grant select on corte.cortes_listado to anon, authenticated, service_role;
grant usage, select on sequence corte.cortes_id_seq to anon, authenticated, service_role;

-- RLS: en v1, planta opera en red interna sin auth. Si más adelante se
-- agrega auth, descomentar esto y agregar policies de SELECT/INSERT:
--
-- alter table corte.cortes enable row level security;
-- create policy "cortes_read_authenticated"  on corte.cortes for select to authenticated using (true);
-- create policy "cortes_write_authenticated" on corte.cortes for insert to authenticated with check (true);
