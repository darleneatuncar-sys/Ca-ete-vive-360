-- CAÑETE VIVE 360
-- Migración desde 9 tablas hacia las 8 tablas solicitadas en la práctica.
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor.
-- Conserva los datos: copia el nombre del catálogo tipo_servicio a
-- servicio.tipo_servicio antes de retirar la tabla adicional.

begin;

alter table public.servicio
  add column if not exists tipo_servicio varchar(40);

update public.servicio as s
set tipo_servicio = ts.nombre
from public.tipo_servicio as ts
where s.id_tipo_servicio = ts.id_tipo_servicio
  and (s.tipo_servicio is null or btrim(s.tipo_servicio) = '');

alter table public.servicio
  alter column tipo_servicio set not null;

alter table public.servicio
  drop constraint if exists ck_servicio_tipo;

alter table public.servicio
  add constraint ck_servicio_tipo
  check (char_length(btrim(tipo_servicio)) between 1 and 40);

-- El nombre de una FK puede variar; este bloque elimina la FK que apunta
-- a tipo_servicio sin depender del nombre que Supabase le haya asignado.
do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class child on child.oid = con.conrelid
  join pg_namespace child_ns on child_ns.oid = child.relnamespace
  join pg_class parent on parent.oid = con.confrelid
  join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
  where con.contype = 'f'
    and child_ns.nspname = 'public'
    and child.relname = 'servicio'
    and parent_ns.nspname = 'public'
    and parent.relname = 'tipo_servicio';

  if constraint_name is not null then
    execute format('alter table public.servicio drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.servicio
  drop column if exists id_tipo_servicio;

drop table if exists public.tipo_servicio;

commit;

-- Comprobación: debe devolver solo estas 8 tablas.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;
