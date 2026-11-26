-- USAR SOLO SI YA ELIMINASTE LA TABLA tipo_servicio.
-- Conserva todos los servicios. Como los nombres de los tipos ya no existen,
-- asigna temporalmente "No especificado" para corregirlos desde la web.

begin;

alter table public.servicio
  add column if not exists tipo_servicio varchar(40);

update public.servicio
set tipo_servicio = 'No especificado'
where tipo_servicio is null or btrim(tipo_servicio) = '';

alter table public.servicio
  alter column tipo_servicio set not null;

alter table public.servicio
  drop constraint if exists ck_servicio_tipo;

alter table public.servicio
  add constraint ck_servicio_tipo
  check (char_length(btrim(tipo_servicio)) between 1 and 40);

alter table public.servicio
  drop column if exists id_tipo_servicio;

commit;

-- Después, abre el módulo Servicios y edita cada registro para reemplazar
-- "No especificado" por su tipo real: hospedaje, gastronomía, aventura, etc.
select id_servicio, nombre, tipo_servicio
from public.servicio
order by nombre;
