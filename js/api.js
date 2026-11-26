// =========================================================
// js/api.js
// Todas las consultas a Supabase, separadas de la interfaz.
// Cada función devuelve los datos o lanza un error que la
// capa de UI traduce con ui.traducirError().
// =========================================================

import { supabase } from "./supabaseClient.js";


// Devuelve los datos o lanza el error de Supabase.
function exigir(respuesta) {
  if (respuesta.error) throw respuesta.error;
  return respuesta.data;
}

// Escapa los caracteres especiales de LIKE para la búsqueda.
function patronBusqueda(texto) {
  return texto
    .trim()
    .replace(/[\\%_]/g, (car) => `\\${car}`);
}

/* ---------- Catálogos simples ---------- */

export async function obtenerDistritos() {
  return exigir(
    await supabase
      .from("distrito")
      .select("id_distrito, nombre, descripcion")
      .order("nombre", { ascending: true })
  );
}

export async function obtenerCategorias() {
  return exigir(
    await supabase
      .from("categoria")
      .select("id_categoria, nombre")
      .order("nombre", { ascending: true })
  );
}

/* ---------- Atractivos ---------- */

// Listado con nombres de distrito y categoría (relaciones).
// Acepta búsqueda por nombre y filtros por distrito/categoría.
export async function obtenerAtractivos({
  buscar = "",
  idDistrito = "",
  idCategoria = "",
} = {}) {
  let consulta = supabase
    .from("atractivo")
    .select("*, distrito(nombre), categoria(nombre)")
    .order("nombre", { ascending: true });

  if (idDistrito) consulta = consulta.eq("id_distrito", idDistrito);
  if (idCategoria) consulta = consulta.eq("id_categoria", idCategoria);
  if (buscar.trim()) {
    consulta = consulta.ilike("nombre", `%${patronBusqueda(buscar)}%`);
  }

  return exigir(await consulta);
}

export async function obtenerAtractivo(id) {
  const datos = exigir(
    await supabase
      .from("atractivo")
      .select("*, distrito(nombre), categoria(nombre)")
      .eq("id_atractivo", id)
      .maybeSingle()
  );
  return datos;
}

export async function crearAtractivo(nuevo) {
  return exigir(
    await supabase
      .from("atractivo")
      .insert(nuevo)
      .select("*, distrito(nombre), categoria(nombre)")
      .single()
  );
}

export async function actualizarAtractivo(id, cambios) {
  return exigir(
    await supabase
      .from("atractivo")
      .update(cambios)
      .eq("id_atractivo", id)
      .select("*, distrito(nombre), categoria(nombre)")
      .single()
  );
}

export async function eliminarAtractivo(id) {
  return exigir(
    await supabase.from("atractivo").delete().eq("id_atractivo", id)
  );
}


/* ---------- Conteos (para el dashboard) ---------- */

// Cuenta filas sin transferirlas (count exact head).
export async function contarRegistros(tabla) {
  const respuesta = await supabase
    .from(tabla)
    .select("*", { count: "exact", head: true });
  if (respuesta.error) throw respuesta.error;
  return respuesta.count ?? 0;
}

// Totales globales usados por el dashboard.
export async function obtenerTotales() {
  const [atractivos, turistas, visitas, rutas, servicios] = await Promise.all([
    contarRegistros("atractivo"),
    contarRegistros("turista"),
    contarRegistros("visita"),
    contarRegistros("ruta"),
    contarRegistros("servicio"),
  ]);
  return { atractivos, turistas, visitas, rutas, servicios };
}

// Últimas visitas registradas, con nombres de turista y atractivo.
export async function obtenerVisitasRecientes(limite = 5) {
  return exigir(
    await supabase
      .from("visita")
      .select(
        "id_visita, fecha_visita, comentario, turista(nombres, apellidos), atractivo(nombre)"
      )
      .order("fecha_visita", { ascending: false })
      .order("id_visita", { ascending: false })
      .limit(limite)
  );
}

/* ---------- Rutas ---------- */

// Listado de rutas (opcional: búsqueda por nombre).
export async function obtenerRutas({ buscar = "" } = {}) {
  let consulta = supabase
    .from("ruta")
    .select("*")
    .order("nombre", { ascending: true });

  if (buscar.trim()) {
    consulta = consulta.ilike("nombre", `%${patronBusqueda(buscar)}%`);
  }

  return exigir(await consulta);
}

export async function crearRuta(nueva) {
  return exigir(
    await supabase.from("ruta").insert(nueva).select("*").single()
  );
}

export async function actualizarRuta(id, cambios) {
  return exigir(
    await supabase
      .from("ruta")
      .update(cambios)
      .eq("id_ruta", id)
      .select("*")
      .single()
  );
}

// La base aplica ON DELETE CASCADE sobre detalle_ruta (verificado),
// así que borrar la ruta elimina sus paradas en una sola consulta.
export async function eliminarRuta(id) {
  return exigir(await supabase.from("ruta").delete().eq("id_ruta", id));
}

// Vista completa: todas las filas de paradas (una por parada),
// para agrupar en el cliente sin hacer N consultas.
export async function obtenerVistaRutas() {
  return exigir(
    await supabase
      .from("v_ruta_detallada")
      .select("*")
      .order("id_ruta", { ascending: true })
      .order("orden_visita", { ascending: true })
  );
}

// Paradas gestionables de una ruta (con id_detalle para editar/borrar)
// y con nombre del atractivo y su distrito.
export async function obtenerParadas(idRuta) {
  return exigir(
    await supabase
      .from("detalle_ruta")
      .select(
        "id_detalle, orden_visita, id_atractivo, atractivo(nombre, distrito(nombre))"
      )
      .eq("id_ruta", idRuta)
      .order("orden_visita", { ascending: true })
  );
}

export async function agregarParada(nueva) {
  return exigir(
    await supabase
      .from("detalle_ruta")
      .insert(nueva)
      .select(
        "id_detalle, orden_visita, id_atractivo, atractivo(nombre, distrito(nombre))"
      )
      .single()
  );
}

export async function eliminarParada(idDetalle) {
  return exigir(
    await supabase.from("detalle_ruta").delete().eq("id_detalle", idDetalle)
  );
}

// Cambia el orden de una parada. La base exige orden_visita > 0 y
// único por ruta (uq_detalle_ruta_orden): el módulo usa un orden
// temporal intermedio para evitar duplicados durante el intercambio.
export async function actualizarOrdenParada(idDetalle, orden) {
  return exigir(
    await supabase
      .from("detalle_ruta")
      .update({ orden_visita: orden })
      .eq("id_detalle", idDetalle)
      .select("id_detalle, orden_visita")
      .single()
  );
}

/* ---------- Turistas ---------- */

// Listado completo ordenado por nombre. La búsqueda multi-campo
// (nombres, apellidos y correo) y los chips se aplican en el
// módulo, porque no se puede expresar en una sola consulta.
export async function obtenerTuristas() {
  return exigir(
    await supabase
      .from("turista")
      .select("*")
      .order("nombres", { ascending: true })
      .order("id_turista", { ascending: true })
  );
}

export async function crearTurista(nuevo) {
  return exigir(
    await supabase.from("turista").insert(nuevo).select("*").single()
  );
}

export async function actualizarTurista(id, cambios) {
  return exigir(
    await supabase
      .from("turista")
      .update(cambios)
      .eq("id_turista", id)
      .select("*")
      .single()
  );
}

// Sin dependencias propias: si el turista tiene visitas, la base
// responde 23503 (fk_visita_turista con ON DELETE RESTRICT).
export async function eliminarTurista(id) {
  return exigir(await supabase.from("turista").delete().eq("id_turista", id));
}

// IDs de los turistas con al menos una visita (una sola consulta
// para armar las métricas y los chips "Con visitas"/"Sin visitas").
export async function visitasPorTurista() {
  const filas = exigir(await supabase.from("visita").select("id_turista"));
  return filas.map((fila) => Number(fila.id_turista));
}

/* ---------- Servicios turísticos ---------- */

// Listado con distrito y tipo de servicio resueltos. Acepta
// búsqueda por nombre y filtros por distrito/tipo (el módulo los
// envía como eq/ilike, igual que los atractivos).
export async function obtenerServicios({
  buscar = "",
  idDistrito = "",
  tipoServicio = "",
} = {}) {
  let consulta = supabase
    .from("servicio")
    .select("*, distrito(nombre)")
    .order("nombre", { ascending: true });

  if (idDistrito) consulta = consulta.eq("id_distrito", idDistrito);
  if (tipoServicio) consulta = consulta.eq("tipo_servicio", tipoServicio);
  if (buscar.trim()) {
    consulta = consulta.ilike("nombre", `%${patronBusqueda(buscar)}%`);
  }

  return exigir(await consulta);
}

export async function crearServicio(nuevo) {
  return exigir(
    await supabase
      .from("servicio")
      .insert(nuevo)
      .select("*, distrito(nombre)")
      .single()
  );
}

export async function actualizarServicio(id, cambios) {
  return exigir(
    await supabase
      .from("servicio")
      .update(cambios)
      .eq("id_servicio", id)
      .select("*, distrito(nombre)")
      .single()
  );
}

export async function eliminarServicio(id) {
  return exigir(await supabase.from("servicio").delete().eq("id_servicio", id));
}

/* ---------- Visitas ---------- */

// Registro con turista y atractivo resueltos. El rango de fechas
// y el atractivo se filtran en el servidor (eq/gte/lte); el texto
// libre se aplica en el módulo porque cruza tres tablas.
export async function obtenerVisitas({
  idAtractivo = "",
  desde = "",
  hasta = "",
} = {}) {
  let consulta = supabase
    .from("visita")
    .select(
      "*, turista(nombres, apellidos), atractivo(nombre, distrito(nombre))"
    )
    .order("fecha_visita", { ascending: false, nullsFirst: false })
    .order("id_visita", { ascending: false });

  if (idAtractivo) consulta = consulta.eq("id_atractivo", idAtractivo);
  if (desde) consulta = consulta.gte("fecha_visita", desde);
  if (hasta) consulta = consulta.lte("fecha_visita", hasta);

  return exigir(await consulta);
}

export async function crearVisita(nueva) {
  return exigir(
    await supabase
      .from("visita")
      .insert(nueva)
      .select("*, turista(nombres, apellidos), atractivo(nombre, distrito(nombre))")
      .single()
  );
}

export async function actualizarVisita(id, cambios) {
  return exigir(
    await supabase
      .from("visita")
      .update(cambios)
      .eq("id_visita", id)
      .select("*, turista(nombres, apellidos), atractivo(nombre, distrito(nombre))")
      .single()
  );
}

export async function eliminarVisita(id) {
  return exigir(await supabase.from("visita").delete().eq("id_visita", id));
}

/* ---------- Catálogos (escritura) ---------- */
// Las lecturas ya existen arriba (obtenerDistritos y obtenerCategorias).
// Aquí se administra los dos catálogos maestros; ambos usan columnas
// con restricción UNIQUE, así que el
// 23505 lo traduce ui.traducirError() con el nombre en español.

export async function crearDistrito(nuevo) {
  return exigir(
    await supabase.from("distrito").insert(nuevo).select("*").single()
  );
}

export async function actualizarDistrito(id, cambios) {
  return exigir(
    await supabase
      .from("distrito")
      .update(cambios)
      .eq("id_distrito", id)
      .select("*")
      .single()
  );
}

// fk_atractivo_distrito es RESTRICT: la base responde 23503 si el
// distrito todavía tiene atractivos.
export async function eliminarDistrito(id) {
  return exigir(await supabase.from("distrito").delete().eq("id_distrito", id));
}

export async function crearCategoria(nuevo) {
  return exigir(
    await supabase.from("categoria").insert(nuevo).select("*").single()
  );
}

export async function actualizarCategoria(id, cambios) {
  return exigir(
    await supabase
      .from("categoria")
      .update(cambios)
      .eq("id_categoria", id)
      .select("*")
      .single()
  );
}

export async function eliminarCategoria(id) {
  return exigir(
    await supabase.from("categoria").delete().eq("id_categoria", id)
  );
}

/* ---------- Vistas de solo lectura ---------- */

// Vista: atractivos con total de visitas.
export async function obtenerResumenAtractivos() {
  return exigir(
    await supabase
      .from("v_atractivo_resumen")
      .select("*")
      .order("total_visitas", { ascending: false })
  );
}

// Vista: paradas de una ruta ordenadas.
export async function obtenerRutaDetallada(idRuta) {
  return exigir(
    await supabase
      .from("v_ruta_detallada")
      .select("*")
      .eq("id_ruta", idRuta)
      .order("orden_visita", { ascending: true })
  );
}
