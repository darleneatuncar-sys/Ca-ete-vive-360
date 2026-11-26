// =========================================================
// js/modules/visitas.js
// CRUD de visitas: turista + atractivo + fecha + comentario.
// El atractivo y el rango de fechas se filtran en el servidor
// (eq/gte/lte) y el texto libre se aplica sobre el resultado,
// porque cruza turista, atractivo y comentario a la vez.
// =========================================================

import * as api from "../api.js";
import * as ui from "../ui.js";

// Estado de los filtros: buscar es local; el resto viaja a Supabase.
const estado = {
  buscar: "",
  idAtractivo: "",
  desde: "",
  hasta: "",
};

// Límites reales de la tabla visita (ver js/ui.js -> LIMITES).
const MAX = ui.LIMITES.visita;

// Última respuesta del servidor (sin el texto libre aplicado).
let visitas = [];

let raiz = null;
let cajaLista = null;
let cajaMetricas = null;
let selectAtractivo = null;
let temporizadorBusqueda = null;
let destruido = false;

/* ---------- Ciclo de vida ---------- */

export async function init(contenedor) {
  raiz = contenedor;
  destruido = false;
  estado.buscar = "";
  estado.idAtractivo = "";
  estado.desde = "";
  estado.hasta = "";
  ui.limpiar(raiz);

  raiz.append(crearHero(), crearMetricas(), crearFiltros());

  cajaLista = ui.h("div", {
    id: "lista-visitas",
    "aria-live": "polite",
    "aria-busy": "true",
  });
  raiz.append(cajaLista);

  await Promise.all([cargarFiltroAtractivos(), actualizarMetricas()]);
  await recargar();
}

export function destroy() {
  destruido = true;
  if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
}

/* ---------- Construcción de la interfaz ---------- */

function crearHero() {
  const botonRegistrar = ui.h(
    "button",
    { type: "button", class: "boton boton--primario" },
    ui.icono("how_to_reg"),
    ui.h("span", { texto: "Registrar visita" })
  );
  botonRegistrar.addEventListener("click", () => abrirFormulario(null));

  const botonSincronizar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono",
      "aria-label": "Recargar la lista de visitas",
      title: "Recargar lista",
    },
    ui.icono("sync")
  );
  botonSincronizar.addEventListener("click", async () => {
    await Promise.all([actualizarMetricas(), recargar()]);
    ui.toast("Lista actualizada desde Supabase.", "exito");
  });

  return ui.h(
    "section",
    { class: "hero hero--visitas" },
    ui.h(
      "div",
      { class: "hero__contenido" },
      ui.h(
        "span",
        { class: "badge-mono" },
        ui.icono("person_pin_circle"),
        ui.h("span", { texto: "SIGTUR · Aforo y movilidad provincial" })
      ),
      ui.h("h2", { class: "hero__titulo", texto: "Visitas" }),
      ui.h("p", {
        class: "hero__texto",
        texto: "Registro y trazabilidad de los ingresos de turistas a los atractivos provinciales: quién visitó, qué visitó, cuándo y con qué comentario.",
      }),
      ui.h("div", { class: "hero__acciones" }, botonRegistrar, botonSincronizar)
    )
  );
}

function crearMetricas() {
  cajaMetricas = ui.h("div", { class: "rejilla-metricas", "aria-live": "polite" });
  cajaMetricas.append(
    metrica("Visitas", "…"),
    metrica("Turistas distintos", "…", "metrica__valor--oliva"),
    metrica("Atractivos visitados", "…", "metrica__valor--terracota")
  );
  return cajaMetricas;
}

function metrica(etiqueta, valor, claseValor = "") {
  return ui.h(
    "div",
    { class: "metrica" },
    ui.h("span", { class: "metrica__etiqueta", texto: etiqueta }),
    ui.h("span", { class: `metrica__valor ${claseValor}`.trim(), texto: String(valor) })
  );
}

function crearFiltros() {
  const inputBusqueda = ui.h("input", {
    type: "search",
    id: "filtro-busqueda",
    class: "control",
    name: "buscar",
    placeholder: "Buscar por turista, atractivo o comentario…",
    "aria-label": "Buscar visita por turista, atractivo o comentario",
    autocomplete: "off",
  });

  const botonLimpiarBusqueda = ui.h(
    "button",
    { type: "button", class: "buscador__limpiar", "aria-label": "Borrar búsqueda", hidden: true },
    ui.icono("close")
  );
  botonLimpiarBusqueda.addEventListener("click", () => {
    inputBusqueda.value = "";
    botonLimpiarBusqueda.hidden = true;
    estado.buscar = "";
    inputBusqueda.focus();
    pintar();
  });

  // Búsqueda con rebote sobre la copia local (sin nueva consulta).
  inputBusqueda.addEventListener("input", (evento) => {
    botonLimpiarBusqueda.hidden = evento.target.value === "";
    if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      estado.buscar = evento.target.value;
      pintar();
    }, 350);
  });

  selectAtractivo = ui.h(
    "select",
    { id: "filtro-atractivo", class: "control", name: "id_atractivo" },
    ui.h("option", { value: "", texto: "Todos los atractivos" })
  );
  selectAtractivo.addEventListener("change", (evento) => {
    estado.idAtractivo = evento.target.value;
    recargar();
  });

  const inputDesde = ui.h("input", {
    type: "date",
    id: "filtro-desde",
    class: "control",
    name: "desde",
    "aria-label": "Fecha desde",
  });
  inputDesde.addEventListener("change", (evento) => {
    estado.desde = evento.target.value;
    recargar();
  });

  const inputHasta = ui.h("input", {
    type: "date",
    id: "filtro-hasta",
    class: "control",
    name: "hasta",
    "aria-label": "Fecha hasta",
  });
  inputHasta.addEventListener("change", (evento) => {
    estado.hasta = evento.target.value;
    recargar();
  });

  const botonLimpiar = ui.h(
    "button",
    { type: "button", class: "boton boton--fantasma boton--pequeno" },
    ui.icono("filter_alt_off"),
    ui.h("span", { texto: "Limpiar filtros" })
  );
  botonLimpiar.addEventListener("click", () => {
    estado.buscar = "";
    estado.idAtractivo = "";
    estado.desde = "";
    estado.hasta = "";
    inputBusqueda.value = "";
    botonLimpiarBusqueda.hidden = true;
    selectAtractivo.value = "";
    inputDesde.value = "";
    inputHasta.value = "";
    ui.toast("Filtros restablecidos.", "info");
    recargar();
  });

  return ui.h(
    "section",
    { class: "tarjeta", "aria-label": "Búsqueda y filtros" },
    ui.h(
      "div",
      { class: "filtros" },
      ui.h(
        "div",
        { class: "campo-filtro campo-filtro--buscar" },
        ui.h(
          "label",
          { class: "campo-filtro__etiqueta", for: "filtro-busqueda" },
          ui.icono("search"),
          ui.h("span", { texto: "Texto libre" })
        ),
        ui.h(
          "div",
          { class: "buscador" },
          ui.icono("search", "buscador__icono"),
          inputBusqueda,
          botonLimpiarBusqueda
        )
      ),
      ui.h(
        "div",
        { class: "campo-filtro" },
        ui.h(
          "label",
          { class: "campo-filtro__etiqueta", for: "filtro-atractivo" },
          ui.icono("landscape"),
          ui.h("span", { texto: "Atractivo" })
        ),
        selectAtractivo
      ),
      ui.h(
        "div",
        { class: "campo-filtro" },
        ui.h(
          "label",
          { class: "campo-filtro__etiqueta", for: "filtro-desde" },
          ui.icono("event"),
          ui.h("span", { texto: "Desde" })
        ),
        inputDesde
      ),
      ui.h(
        "div",
        { class: "campo-filtro" },
        ui.h(
          "label",
          { class: "campo-filtro__etiqueta", for: "filtro-hasta" },
          ui.icono("event"),
          ui.h("span", { texto: "Hasta" })
        ),
        inputHasta
      ),
      ui.h("div", { class: "filtros__acciones" }, botonLimpiar)
    )
  );
}

/* ---------- Carga y pintado ---------- */

async function cargarFiltroAtractivos() {
  try {
    const atractivos = await api.obtenerAtractivos();
    if (destruido) return;
    for (const atractivo of atractivos) {
      selectAtractivo.append(
        ui.h("option", {
          value: String(atractivo.id_atractivo),
          texto: atractivo.nombre,
        })
      );
    }
  } catch (error) {
    if (destruido) return;
    ui.toast(`No se pudieron cargar los atractivos: ${ui.traducirError(error)}`, "error");
  }
}

// Métricas globales (siempre sin filtros, como en los demás módulos).
async function actualizarMetricas() {
  if (destruido || !cajaMetricas) return;
  try {
    const todas = await api.obtenerVisitas();
    if (destruido) return;

    const turistas = new Set(todas.map((v) => v.id_turista)).size;
    const atractivos = new Set(todas.map((v) => v.id_atractivo)).size;

    ui.limpiar(cajaMetricas);
    cajaMetricas.append(
      metrica("Visitas", String(todas.length).padStart(2, "0")),
      metrica("Turistas distintos", String(turistas).padStart(2, "0"), "metrica__valor--oliva"),
      metrica("Atractivos visitados", String(atractivos).padStart(2, "0"), "metrica__valor--terracota")
    );
  } catch (error) {
    if (destruido) return;
    ui.toast(ui.traducirError(error), "error");
  }
}

// Consulta al servidor con atractivo y rango de fechas.
async function recargar() {
  if (destruido || !cajaLista) return;

  cajaLista.setAttribute("aria-busy", "true");
  ui.reemplazar(cajaLista, ui.contenedorCargando("Cargando visitas…"));

  try {
    visitas = await api.obtenerVisitas({
      idAtractivo: estado.idAtractivo,
      desde: estado.desde,
      hasta: estado.hasta,
    });
    if (destruido) return;
    pintar();
  } catch (error) {
    if (destruido) return;
    ui.reemplazar(cajaLista, ui.contenedorError(ui.traducirError(error), () => recargar()));
  } finally {
    if (!destruido) cajaLista.setAttribute("aria-busy", "false");
  }
}

// Aplica el texto libre sobre la última respuesta y pinta la tabla.
function pintar() {
  if (destruido || !cajaLista) return;

  const texto = estado.buscar.trim().toLowerCase();
  const filas = visitas.filter((visita) => {
    if (!texto) return true;
    const turista = visita.turista
      ? `${visita.turista.nombres} ${visita.turista.apellidos}`
      : "";
    const atractivo = visita.atractivo?.nombre || "";
    return `${turista} ${atractivo} ${visita.comentario || ""}`
      .toLowerCase()
      .includes(texto);
  });

  ui.pintarTabla({
    contenedor: cajaLista,
    caption: `Visitas registradas · ${filas.length} registro(s)`,
    textoVacio: "No hay visitas que coincidan con los filtros.",
    columnas: [
      { clave: "codigo", etiqueta: "Código" },
      { clave: "fecha", etiqueta: "Fecha" },
      { clave: "turista", etiqueta: "Turista" },
      { clave: "atractivo", etiqueta: "Atractivo" },
      { clave: "comentario", etiqueta: "Comentario" },
      { clave: "acciones", etiqueta: "Acciones" },
    ],
    datos: filas,
    renderCeldas: (visita) => {
      const codigo = `VI-${String(visita.id_visita).padStart(3, "0")}`;
      const nombreTurista = visita.turista
        ? `${visita.turista.nombres} ${visita.turista.apellidos}`
        : "Sin turista";
      const nombreAtractivo = visita.atractivo?.nombre || "Sin atractivo";
      const distrito = visita.atractivo?.distrito?.nombre || "";
      const comentario = recortar(visita.comentario, 90);

      const botonEditar = ui.h(
        "button",
        {
          type: "button",
          class: "boton boton--suave boton--pequeno",
          "aria-label": `Editar visita ${codigo}`,
        },
        ui.icono("edit"),
        ui.h("span", { texto: "Editar" })
      );
      botonEditar.addEventListener("click", () => abrirFormulario(visita));

      const botonEliminar = ui.h(
        "button",
        {
          type: "button",
          class: "boton boton--suave boton--pequeno",
          "aria-label": `Eliminar visita ${codigo}`,
        },
        ui.icono("delete"),
        ui.h("span", { texto: "Eliminar" })
      );
      botonEliminar.addEventListener("click", () => eliminarVisita(visita));

      return [
        ui.h("span", { class: "mono", texto: codigo }),
        ui.h("span", { class: "mono", texto: ui.formatearFecha(visita.fecha_visita) }),
        ui.h("strong", { texto: nombreTurista }),
        ui.h(
          "div",
          {},
          ui.h("strong", { texto: nombreAtractivo }),
          distrito
            ? ui.h("div", { class: "texto-tenue", texto: distrito })
            : null
        ),
        ui.h("span", { class: "texto-tenue", texto: comentario }),
        ui.h("div", { class: "acciones" }, botonEditar, botonEliminar),
      ];
    },
  });
}

function recortar(texto, maximo) {
  const valor = String(texto || "").trim();
  if (!valor) return "—";
  return valor.length > maximo ? `${valor.slice(0, maximo - 1)}…` : valor;
}

/* ---------- Formulario (crear / editar) ---------- */

async function abrirFormulario(visitaExistente) {
  const esEdicion = Boolean(visitaExistente);

  // Catálogos para los select (turistas y atractivos).
  let turistas = [];
  let atractivos = [];
  try {
    [turistas, atractivos] = await Promise.all([
      api.obtenerTuristas(),
      api.obtenerAtractivos(),
    ]);
  } catch (error) {
    ui.toast(ui.traducirError(error), "error");
    return;
  }

  const campoTurista = ui.campoSelect({
    nombre: "id_turista",
    etiqueta: "Turista",
    requerido: true,
    opciones: turistas.map((t) => ({
      valor: t.id_turista,
      texto: `${t.nombres} ${t.apellidos}`,
    })),
    vacio: "Seleccione un turista",
  });

  const campoAtractivo = ui.campoSelect({
    nombre: "id_atractivo",
    etiqueta: "Atractivo",
    requerido: true,
    opciones: atractivos.map((a) => ({
      valor: a.id_atractivo,
      texto: a.nombre,
    })),
    vacio: "Seleccione un atractivo",
  });

  const campoFecha = ui.campo({
    nombre: "fecha_visita",
    etiqueta: "Fecha de la visita",
    tipo: "date",
    requerido: true,
    ayuda: "No puede ser una fecha futura.",
    max: new Date().toISOString().slice(0, 10),
  });

  const campoComentario = ui.campoTextarea({
    nombre: "comentario",
    etiqueta: "Comentario",
    ayuda: `Opcional. Máximo ${MAX.comentario} caracteres.`,
    maximo: MAX.comentario,
  });

  const botonCancelar = ui.h(
    "button",
    { type: "button", class: "boton boton--suave", texto: "Cancelar" }
  );
  const botonGuardar = ui.h(
    "button",
    { type: "submit", class: "boton boton--primario" },
    ui.icono("save"),
    ui.h("span", { texto: esEdicion ? "Guardar cambios" : "Registrar visita" })
  );

  const formulario = ui.h(
    "form",
    { class: "formulario", novalidate: true },
    ui.h(
      "div",
      { class: "formulario__rejilla" },
      campoTurista.nodo,
      campoAtractivo.nodo,
      campoFecha.nodo
    ),
    campoComentario.nodo,
    ui.h("div", { class: "formulario__acciones" }, botonCancelar, botonGuardar)
  );

  // Prellenar en modo edición.
  if (esEdicion) {
    campoTurista.control.value = String(visitaExistente.id_turista ?? "");
    campoAtractivo.control.value = String(visitaExistente.id_atractivo ?? "");
    campoFecha.control.value = visitaExistente.fecha_visita ?? "";
    campoComentario.control.value = visitaExistente.comentario ?? "";
  }

  const entrada = ui.abrirModal({
    titulo: esEdicion ? "Editar visita" : "Nueva visita",
    cuerpo: formulario,
  });

  ui.vigilarErrores(formulario);
  botonCancelar.addEventListener("click", () => entrada.cerrar());

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datos = {
      id_turista: Number(formulario.elements.id_turista.value),
      id_atractivo: Number(formulario.elements.id_atractivo.value),
      fecha_visita: formulario.elements.fecha_visita.value,
      comentario: formulario.elements.comentario.value.trim(),
    };
    const errores = validarVisita(datos);
    ui.mostrarErrores(formulario, errores);
    if (Object.values(errores).some(Boolean)) return;

    const textoOriginal = botonGuardar.textContent;
    botonGuardar.disabled = true;
    botonGuardar.textContent = "Guardando…";
    botonCancelar.disabled = true;

    try {
      if (esEdicion) {
        await api.actualizarVisita(visitaExistente.id_visita, datos);
        ui.toast("Visita actualizada correctamente.", "exito");
      } else {
        await api.crearVisita(datos);
        ui.toast("Visita registrada correctamente.", "exito");
      }
      entrada.cerrar();
      await Promise.all([recargar(), actualizarMetricas()]);
    } catch (error) {
      ui.toast(ui.traducirError(error), "error");
      botonGuardar.disabled = false;
      botonGuardar.textContent = textoOriginal;
      botonCancelar.disabled = false;
    }
  });
}

// Validaciones del cliente ANTES de consultar a Supabase.
function validarVisita(datos) {
  const v = ui.validacion;
  return {
    id_turista: datos.id_turista ? null : "Selecciona un turista.",
    id_atractivo: datos.id_atractivo ? null : "Selecciona un atractivo.",
    fecha_visita:
      v.requerido(datos.fecha_visita, "la fecha") ||
      v.fechaNoFutura(datos.fecha_visita, "La fecha"),
    comentario: v.longitudMaxima(datos.comentario, MAX.comentario, "El comentario"),
  };
}

/* ---------- Eliminar ---------- */

async function eliminarVisita(visita) {
  const codigo = `VI-${String(visita.id_visita).padStart(3, "0")}`;
  const confirmado = await ui.confirmar({
    titulo: "Eliminar visita",
    mensaje: `Se eliminará la visita ${codigo}. Esta acción no se puede deshacer.`,
    textoAceptar: "Sí, eliminar",
  });
  if (!confirmado) return;

  try {
    await api.eliminarVisita(visita.id_visita);
    ui.toast(`Se eliminó la visita ${codigo}.`, "exito");
    await Promise.all([recargar(), actualizarMetricas()]);
  } catch (error) {
    ui.toast(ui.traducirError(error), "error");
  }
}
