-- CAÑETE VIVE 360 - Consultas, vistas e índices solicitados
-- Ejecutar después de 01_migracion_8_tablas.sql.

-- 1. Consulta SELECT con JOIN: atractivos con distrito y categoría.
select
  a.id_atractivo,
  a.nombre as atractivo,
  d.nombre as distrito,
  c.nombre as categoria,
  a.direccion
from public.atractivo as a
join public.distrito as d on d.id_distrito = a.id_distrito
join public.categoria as c on c.id_categoria = a.id_categoria
order by d.nombre, a.nombre;

-- 2. Consulta de resumen con GROUP BY: visitas por atractivo.
select
  a.nombre as atractivo,
  count(v.id_visita) as total_visitas
from public.atractivo as a
left join public.visita as v on v.id_atractivo = a.id_atractivo
group by a.id_atractivo, a.nombre
order by total_visitas desc, a.nombre;

-- 3. Vistas. Se recrean para que sus columnas coincidan exactamente con
-- las que consume el sistema web.
drop view if exists public.v_atractivo_resumen;
create view public.v_atractivo_resumen as
select
  a.id_atractivo,
  a.nombre as atractivo,
  d.nombre as distrito,
  c.nombre as categoria,
  count(v.id_visita) as total_visitas
from public.atractivo as a
join public.distrito as d on d.id_distrito = a.id_distrito
join public.categoria as c on c.id_categoria = a.id_categoria
left join public.visita as v on v.id_atractivo = a.id_atractivo
group by a.id_atractivo, a.nombre, d.nombre, c.nombre;

-- Vista para mostrar las paradas de cada ruta en su orden.
drop view if exists public.v_ruta_detallada;
create view public.v_ruta_detallada as
select
  r.id_ruta,
  r.nombre as ruta,
  r.descripcion as descripcion_ruta,
  r.duracion_horas,
  dr.id_detalle,
  dr.orden_visita,
  a.id_atractivo,
  a.nombre as atractivo,
  d.id_distrito,
  d.nombre as distrito
from public.ruta as r
join public.detalle_ruta as dr on dr.id_ruta = r.id_ruta
join public.atractivo as a on a.id_atractivo = dr.id_atractivo
join public.distrito as d on d.id_distrito = a.id_distrito;

-- 4. Índices: aceleran filtros usados por la aplicación.
create index if not exists idx_atractivo_distrito on public.atractivo (id_distrito);
create index if not exists idx_atractivo_categoria on public.atractivo (id_categoria);
create index if not exists idx_servicio_distrito on public.servicio (id_distrito);
create index if not exists idx_servicio_tipo on public.servicio (tipo_servicio);
create index if not exists idx_visita_atractivo_fecha on public.visita (id_atractivo, fecha_visita desc);

-- Verificación rápida de las vistas.
select * from public.v_atractivo_resumen order by total_visitas desc, atractivo;
select * from public.v_ruta_detallada order by id_ruta, orden_visita;
