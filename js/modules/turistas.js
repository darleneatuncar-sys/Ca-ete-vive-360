// =========================================================
// js/modules/turistas.js
// CRUD de turistas: registro de visitantes con búsqueda
// multi-campo (nombres, apellidos y correo) y chips de
// estado según si tienen visitas registradas.
// =========================================================

import * as api from "../api.js";
import * as ui from "../ui.js";
import * as fotos from "../fotosLocales.js";

// Estado de los filtros de la vista.
const estado = {
  buscar: "",
  chip: "todos", // todos | con | sin
};

// Límites reales de la tabla turista (ver js/ui.js -> LIMITES).
const MAX = ui.LIMITES.turista;

// Copias en memoria: se refiltran sin volver a consultar.
let turistas = [];
let conteoVisitas = new Map(); // id_turista -> nº de visitas

let raiz = null;
let cajaLista = null;
let cajaMetricas = null;
let contenedorChips = null;
let temporizadorBusqueda = null;
let destruido = false;

/* ---------- Ciclo de vida ---------- */

export async function init(contenedor) {
  raiz = contenedor;
  destruido = false;
  estado.buscar = "";
  estado.chip = "todos";
  ui.limpiar(raiz);

  raiz.append(crearHero(), crearMetricas(), crearFiltros());

  cajaLista = ui.h("div", {
    id: "lista-turistas",
    "aria-live": "polite",
    "aria-busy": "true",
  });
  raiz.append(cajaLista);

  await cargar();
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
    ui.icono("person_add"),
    ui.h("span", { texto: "Registrar turista" })
  );
  botonRegistrar.addEventListener("click", () => abrirFormulario(null));

  const botonSincronizar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono",
      "aria-label": "Recargar la lista de turistas",
      title: "Recargar lista",
    },
    ui.icono("sync")
  );
  botonSincronizar.addEventListener("click", async () => {
    await cargar();
    ui.toast("Lista actualizada desde Supabase.", "exito");
  });

  return ui.h(
    "section",
    { class: "hero hero--turistas" },
    ui.h(
      "div",
      { class: "hero__contenido" },
      ui.h(
        "span",
        { class: "badge-mono" },
        ui.icono("travel_explore"),
        ui.h("span", { texto: "SIGTUR · Registro de visitantes" })
      ),
      ui.h("h2", { class: "hero__titulo", texto: "Turistas" }),
      ui.h("p", {
        class: "hero__texto",
        texto: "Control de visitantes nacionales e internacionales que recorren los circuitos turísticos de la provincia de Cañete: datos de contacto y trazabilidad de sus visitas.",
      }),
      ui.h("div", { class: "hero__acciones" }, botonRegistrar, botonSincronizar)
    )
  );
}

function crearMetricas() {
  cajaMetricas = ui.h("div", { class: "rejilla-metricas", "aria-live": "polite" });
  cajaMetricas.append(
    metrica("Turistas", "…"),
    metrica("Con visitas", "…", "metrica__valor--oliva"),
    metrica("Sin visitas", "…", "metrica__valor--terracota")
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
    placeholder: "Buscar por nombre, apellido o correo…",
    "aria-label": "Buscar turista por nombre, apellido o correo",
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

  // Búsqueda con rebote: espera 350 ms mientras el usuario escribe.
  inputBusqueda.addEventListener("input", (evento) => {
    botonLimpiarBusqueda.hidden = evento.target.value === "";
    if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      estado.buscar = evento.target.value;
      pintar();
    }, 350);
  });

  contenedorChips = ui.h("div", {
    class: "chips",
    id: "chips-turista",
    role: "group",
    "aria-label": "Filtrar por actividad de visitas",
  });

  const botonLimpiar = ui.h(
    "button",
    { type: "button", class: "boton boton--fantasma boton--pequeno" },
    ui.icono("filter_alt_off"),
    ui.h("span", { texto: "Limpiar filtros" })
  );
  botonLimpiar.addEventListener("click", () => {
    estado.buscar = "";
    estado.chip = "todos";
    inputBusqueda.value = "";
    botonLimpiarBusqueda.hidden = true;
    pintarChips();
    ui.toast("Filtros restablecidos.", "info");
    pintar();
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
          ui.h("span", { texto: "Nombre o correo" })
        ),
        ui.h(
          "div",
          { class: "buscador" },
          ui.icono("search", "buscador__icono"),
          inputBusqueda,
          botonLimpiarBusqueda
        )
      ),
      ui.h("div", { class: "filtros__acciones" }, botonLimpiar)
    ),
    contenedorChips
  );
}

/* ---------- Carga y pintado ---------- */

// Descarga turistas y el conteo de visitas en paralelo.
async function cargar() {
  if (destruido || !cajaLista) return;

  cajaLista.setAttribute("aria-busy", "true");
  ui.reemplazar(cajaLista, ui.contenedorCargando("Cargando turistas…"));

  try {
    const [lista, idsVisitas] = await Promise.all([
      api.obtenerTuristas(),
      api.visitasPorTurista(),
    ]);
    if (destruido) return;

    turistas = lista;
    // La API devuelve un id por cada visita: así se cuentan las visitas.
    conteoVisitas = new Map();
    for (const id of idsVisitas) {
      conteoVisitas.set(id, (conteoVisitas.get(id) || 0) + 1);
    }

    actualizarMetricas();
    pintarChips();
    pintar();
  } catch (error) {
    if (destruido) return;
    ui.reemplazar(cajaLista, ui.contenedorError(ui.traducirError(error), () => cargar()));
  } finally {
    if (!destruido) cajaLista.setAttribute("aria-busy", "false");
  }
}

function visitasDe(id) {
  return conteoVisitas.get(Number(id)) || 0;
}

function actualizarMetricas() {
  if (destruido || !cajaMetricas) return;
  const conVisitas = turistas.filter((t) => visitasDe(t.id_turista) > 0).length;

  ui.limpiar(cajaMetricas);
  cajaMetricas.append(
    metrica("Turistas", String(turistas.length).padStart(2, "0")),
    metrica("Con visitas", String(conVisitas).padStart(2, "0"), "metrica__valor--oliva"),
    metrica("Sin visitas", String(turistas.length - conVisitas).padStart(2, "0"), "metrica__valor--terracota")
  );
}

// Chips de estado (todos / con visitas / sin visitas) con conteo.
function pintarChips() {
  if (!contenedorChips) return;
  ui.limpiar(contenedorChips);

  const conVisitas = turistas.filter((t) => visitasDe(t.id_turista) > 0).length;
  const opciones = [
    { valor: "todos", texto: "Todos", cantidad: turistas.length },
    { valor: "con", texto: "Con visitas", cantidad: conVisitas },
    { valor: "sin", texto: "Sin visitas", cantidad: turistas.length - conVisitas },
  ];

  for (const opcion of opciones) {
    const activa = estado.chip === opcion.valor;
    const chip = ui.h(
      "button",
      {
        type: "button",
        class: `chip${activa ? " chip--activa" : ""}`,
        "aria-pressed": String(activa),
      },
      ui.h("span", { texto: opcion.texto }),
      ui.h("span", { class: "mono", texto: `(${opcion.cantidad})` })
    );
    chip.addEventListener("click", () => {
      estado.chip = opcion.valor;
      pintarChips();
      pintar();
    });
    contenedorChips.append(chip);
  }
}

// Filtra en memoria (texto libre + chip) y pinta las tarjetas.
function pintar() {
  if (destruido || !cajaLista) return;

  const texto = estado.buscar.trim().toLowerCase();
  const filas = turistas.filter((turista) => {
    const coincideTexto =
      !texto ||
      `${turista.nombres} ${turista.apellidos} ${turista.correo}`
        .toLowerCase()
        .includes(texto);
    const activo = visitasDe(turista.id_turista) > 0;
    const coincideChip =
      estado.chip === "todos" ||
      (estado.chip === "con" && activo) ||
      (estado.chip === "sin" && !activo);
    return coincideTexto && coincideChip;
  });

  ui.pintarTarjetas({
    contenedor: cajaLista,
    datos: filas,
    textoVacio: "No hay turistas que coincidan con la búsqueda.",
    renderTarjeta: crearTarjeta,
  });
}

function crearTarjeta(item) {
  const codigo = `TR-${String(item.id_turista).padStart(3, "0")}`;
  const total = visitasDe(item.id_turista);
  const nombreCompleto = `${item.nombres} ${item.apellidos}`;

  const botonEditar = ui.h(
    "button",
    {
      type: "button",
      class: "boton boton--suave boton--pequeno",
      "aria-label": `Editar ${nombreCompleto}`,
    },
    ui.icono("edit"),
    ui.h("span", { texto: "Editar" })
  );
  botonEditar.addEventListener("click", () => abrirFormulario(item));

  const botonEliminar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono boton-icono--pequeno boton-icono--peligro",
      "aria-label": `Eliminar ${nombreCompleto}`,
      title: "Eliminar",
    },
    ui.icono("delete")
  );
  botonEliminar.addEventListener("click", () => eliminarTurista(item));

  return ui.h(
    "article",
    { class: "tarjeta-item" },
    ui.h(
      "div",
      { class: "tarjeta-item__inicio" },
      crearEspacioImagenTurista(item, fotos.obtenerFotoLocal("turista", item.id_turista), () => abrirFormulario(item)),
      ui.h(
        "div",
        { class: "tarjeta-item__cuerpo" },
        ui.h(
          "div",
          { class: "tarjeta-item__fila" },
          ui.h("span", { class: "codigo", texto: codigo }),
          ui.h("span", {
            class: `insignia ${total > 0 ? "insignia--activa" : ""}`.trim(),
            texto: total > 0 ? "Con visitas" : "Sin visitas",
          })
        ),
        ui.h("h3", { class: "tarjeta-item__titulo", texto: nombreCompleto }),
        ui.h(
          "p",
          { class: "tarjeta-item__ubicacion" },
          ui.icono("mail"),
          ui.h("span", { texto: item.correo })
        )
      )
    ),
    ui.h(
      "div",
      { class: "tarjeta-item__meta" },
      ui.h("span", {
        class: "insignia insignia--suave",
        texto: total === 1 ? "1 visita" : `${total} visitas`,
      }),
      ui.h("span", { class: "mono texto-tenue", texto: `#${item.id_turista}` })
    ),
    ui.h("div", { class: "tarjeta-item__acciones" }, botonEditar, botonEliminar)
  );
}

/* ---------- Formulario (crear / editar) ---------- */

async function abrirFormulario(turistaExistente) {
  const esEdicion = Boolean(turistaExistente);

  const campoNombres = ui.campo({
    nombre: "nombres",
    etiqueta: "Nombres",
    requerido: true,
    ayuda: `Máximo ${MAX.nombres} caracteres.`,
    maximo: MAX.nombres,
  });

  const campoApellidos = ui.campo({
    nombre: "apellidos",
    etiqueta: "Apellidos",
    requerido: true,
    ayuda: `Máximo ${MAX.apellidos} caracteres.`,
    maximo: MAX.apellidos,
  });

  const campoCorreo = ui.campo({
    nombre: "correo",
    etiqueta: "Correo electrónico",
    tipo: "email",
    requerido: true,
    ayuda: "Ejemplo: visitante@correo.com",
  });

  const campoImagen = crearCampoImagen();

  const botonCancelar = ui.h(
    "button",
    { type: "button", class: "boton boton--suave", texto: "Cancelar" }
  );
  const botonGuardar = ui.h(
    "button",
    { type: "submit", class: "boton boton--primario" },
    ui.icono("save"),
    ui.h("span", { texto: esEdicion ? "Guardar cambios" : "Registrar turista" })
  );

  const formulario = ui.h(
    "form",
    { class: "formulario", novalidate: true },
    ui.h(
      "div",
      { class: "formulario__rejilla" },
      campoNombres.nodo,
      campoApellidos.nodo,
      campoImagen.nodo
    ),
    campoCorreo.nodo,
    ui.h("div", { class: "formulario__acciones" }, botonCancelar, botonGuardar)
  );

  if (esEdicion) {
    campoNombres.control.value = turistaExistente.nombres ?? "";
    campoApellidos.control.value = turistaExistente.apellidos ?? "";
    campoCorreo.control.value = turistaExistente.correo ?? "";
  }

  const entrada = ui.abrirModal({
    titulo: esEdicion ? "Editar turista" : "Nuevo turista",
    cuerpo: formulario,
  });

  ui.vigilarErrores(formulario);
  botonCancelar.addEventListener("click", () => entrada.cerrar());

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datos = {
      nombres: formulario.elements.nombres.value.trim(),
      apellidos: formulario.elements.apellidos.value.trim(),
      correo: formulario.elements.correo.value.trim(),
      imagen_archivo: formulario.elements.imagen_archivo.files?.[0] || null,
    };
    const errores = validarTurista(datos, turistaExistente);
    ui.mostrarErrores(formulario, errores);
    if (Object.values(errores).some(Boolean)) return;

    const textoOriginal = botonGuardar.textContent;
    botonGuardar.disabled = true;
    botonGuardar.textContent = "Guardando…";
    botonCancelar.disabled = true;

    try {
      const archivoFoto = datos.imagen_archivo;
      delete datos.imagen_archivo;
      delete datos.imagen_url;
      let resultado;
      if (esEdicion) {
        resultado = await api.actualizarTurista(turistaExistente.id_turista, datos);
        await fotos.guardarFotoLocal("turista", resultado.id_turista, archivoFoto);
        ui.toast("Turista actualizado correctamente.", "exito");
      } else {
        resultado = await api.crearTurista(datos);
        await fotos.guardarFotoLocal("turista", resultado.id_turista, archivoFoto);
        ui.toast("Turista registrado correctamente.", "exito");
      }
      entrada.cerrar();
      await cargar();
    } catch (error) {
      // 23505: correo repetido (uq_turista_correo).
      ui.toast(ui.traducirError(error), "error");
      botonGuardar.disabled = false;
      botonGuardar.textContent = textoOriginal;
      botonCancelar.disabled = false;
    }
  });
}

// Validaciones del cliente ANTES de consultar a Supabase.
function validarTurista(datos, turistaExistente) {
  const v = ui.validacion;

  const correoRepetido = turistas.some(
    (t) =>
      (!turistaExistente || t.id_turista !== turistaExistente.id_turista) &&
      String(t.correo).trim().toLowerCase() === datos.correo.trim().toLowerCase()
  );

  return {
    nombres:
      v.requerido(datos.nombres, "nombres") ||
      v.longitudMaxima(datos.nombres, MAX.nombres, "Los nombres"),
    apellidos:
      v.requerido(datos.apellidos, "apellidos") ||
      v.longitudMaxima(datos.apellidos, MAX.apellidos, "Los apellidos"),
    correo:
      v.requerido(datos.correo, "correo") ||
      v.correo(datos.correo) ||
      (correoRepetido ? "Ya existe un turista con ese correo." : null),
    imagen_archivo: fotos.validarFotoLocal(datos.imagen_archivo),
  };
}

function crearCampoImagen() {
  const errorId = "imagen_archivo-error";
  const control = ui.h("input", {
    type: "file", id: "imagen_archivo", name: "imagen_archivo",
    class: "control control--archivo", accept: "image/jpeg,image/png,image/webp",
    "aria-describedby": errorId,
  });
  return {
    nodo: ui.h("div", { class: "campo" },
      ui.h("label", { class: "campo__etiqueta", for: "imagen_archivo" }, "Foto del turista"),
      control,
      ui.h("p", { class: "campo__ayuda", texto: "Se guarda solo en este navegador (JPG, PNG o WebP; máximo 1.5 MB)." }),
      ui.h("p", { class: "campo__error", id: errorId, "data-error-para": "imagen_archivo", hidden: true })
    ), control,
  };
}

function crearEspacioImagenTurista(item, fotoLocal, alSeleccionar) {
  const nombre = `${item.nombres} ${item.apellidos}`;
  const marco = ui.h("button", {
    type: "button", class: "foto-atractivo",
    "aria-label": fotoLocal ? `Cambiar foto de ${nombre}` : `Subir foto para ${nombre}`,
    title: fotoLocal ? "Cambiar foto" : "Subir foto",
  });
  marco.addEventListener("click", alSeleccionar);
  const sinFoto = () => {
    ui.limpiar(marco);
    marco.classList.add("foto-atractivo--vacia");
    marco.append(ui.icono("add_a_photo"), ui.h("span", { texto: "Subir foto" }));
  };
  if (!fotoLocal) { sinFoto(); return marco; }
  const imagen = ui.h("img", { src: fotoLocal, alt: `Foto de ${nombre}`, loading: "lazy" });
  imagen.addEventListener("error", sinFoto);
  marco.append(imagen);
  return marco;
}

/* ---------- Eliminar ---------- */

async function eliminarTurista(item) {
  const nombreCompleto = `${item.nombres} ${item.apellidos}`;
  const visitas = visitasDe(item.id_turista);

  const confirmado = await ui.confirmar({
    titulo: "Eliminar turista",
    mensaje:
      visitas > 0
        ? `Se eliminará "${nombreCompleto}", que tiene ${visitas} visita(s) registradas. Si la base lo tiene restringido, el borrado será bloqueado.`
        : `Se eliminará "${nombreCompleto}". Esta acción no se puede deshacer.`,
    textoAceptar: "Sí, eliminar",
  });
  if (!confirmado) return;

  try {
    await api.eliminarTurista(item.id_turista);
    ui.toast(`Se eliminó "${nombreCompleto}".`, "exito");
    await cargar();
  } catch (error) {
    // 23503: fk_visita_turista es RESTRICT, menciona "visitas".
    ui.toast(ui.traducirError(error), "error");
  }
}
