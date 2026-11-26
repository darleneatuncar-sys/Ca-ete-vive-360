# Cañete Vive 360

Sistema turístico académico para registrar atractivos, rutas, turistas, servicios y visitas de Cañete.

## Base de datos final

La base tiene exactamente ocho tablas relacionadas:

1. `distrito`
2. `categoria`
3. `atractivo`
4. `turista`
5. `servicio`
6. `ruta`
7. `detalle_ruta`
8. `visita`

`detalle_ruta` es la tabla intermedia que resuelve la relación muchos a muchos entre `ruta` y `atractivo`.

## Cómo actualizar Supabase

1. Abre **Supabase > SQL Editor**.
2. Ejecuta `sql/01_migracion_8_tablas.sql` si la tabla `tipo_servicio` aún existe. Si ya la eliminaste, ejecuta `sql/01b_recuperar_servicios_sin_tipo_servicio.sql`.
3. Confirma que el último `SELECT` liste ocho tablas.
4. Ejecuta `sql/02_consultas_vistas_indices.sql`.
5. Recarga la aplicación web.

La migración conserva los tipos de servicio ya registrados: los copia al nuevo campo `servicio.tipo_servicio` antes de eliminar la tabla adicional.

## Qué demuestra el sistema

- CRUD para atractivos, rutas, turistas, servicios, visitas, distritos y categorías.
- Búsquedas y filtros por nombre, distrito, categoría, fechas y tipo de servicio.
- Dashboard con indicadores, ranking de atractivos y últimas visitas.
- Dos vistas SQL para resumir atractivos y rutas.
- Índices para las búsquedas más frecuentes.
- Fotos visuales para atractivos, servicios y turistas: se guardan solo en el navegador actual y no se envían a Supabase.

## Datos de prueba

Los registros son datos de prueba académicos; no representan estadísticas oficiales de Cañete.

# Asi funciona el sistema 

Dashboard: no agrega registros. Es un resumen visual de lo que ya existe en la base de datos: cantidad de atractivos, turistas, visitas, rutas, servicios y distritos. También muestra el atractivo más visitado, visitas por atractivo y las últimas visitas registradas.

Catálogos: aquí administras los datos base.
- Distritos: por ejemplo, San Vicente, Asia o Lunahuaná.
- Categorías: naturaleza, cultura, aventura, etc.
  Estos datos se usan al registrar atractivos.

Atractivos: son los lugares turísticos. Cada atractivo debe relacionarse con:
- un distrito;
- una categoría.
  Por ejemplo: “Castillo Unanue” puede pertenecer a San Vicente y a la categoría Cultura.

Rutas: son recorridos turísticos. Una ruta puede contener varios atractivos. Por ejemplo, “Ruta cultural de Cañete” puede incluir Castillo Unanue, Plaza de Armas y otros lugares.

Detalle de ruta: funciona internamente; conecta una ruta con sus atractivos y guarda el orden de visita. Por eso una ruta puede tener muchas paradas y un atractivo puede aparecer en diferentes rutas.

Turistas: registra los datos de los visitantes, como nombres, apellidos y correo. El correo no debe repetirse.

Visitas: registra que un turista visitó un atractivo en una fecha determinada y, opcionalmente, dejó un comentario. Esta tabla relaciona directamente Turista + Atractivo.

Servicios: registra hospedajes, restaurantes, guías, transporte o actividades. Cada servicio pertenece a un distrito y ahora guarda su tipo como texto dentro de la misma tabla.

Distrito 1 ── N Atractivo
Categoría 1 ── N Atractivo
Distrito 1 ── N Servicio
Ruta N ── M Atractivo  (mediante detalle_ruta)
Turista 1 ── N Visita
Atractivo 1 ── N Visita
