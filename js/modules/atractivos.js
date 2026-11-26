// =========================================================
// js/modules/atractivos.js
// Módulo de Atractivos: CRUD completo con búsqueda por
// nombre y filtros por distrito y categoría.
// Presentación: sistema de diseño "Cañete Vive"
// (cabecera visual, métricas, buscador tipo píldora,
// chips de categoría y lista de tarjetas).
// =========================================================

import * as api from "../api.js";
import * as ui from "../ui.js";
import * as fotos from "../fotosLocales.js";

// Estado actual de los filtros de la vista.
const estado = {
  buscar: "",
  idDistrito: "",
  idCategoria: "",
};

// Límites reales de la tabla atractivo (ver js/ui.js -> LIMITES).
const MAX = ui.LIMITES.atractivo;

let raiz = null;
let cajaLista = null;
let cajaMetricas = null;
let temporizadorBusqueda = null;
let destruido = false;
// Referencias de la interfaz que se llenan al cargar los catálogos.
let selectDistrito = null;
let contenedorChips = null;

/* ---------- Ciclo de vida ---------- */

export async function init(contenedor) {
  raiz = contenedor;
  destruido = false;
  ui.limpiar(raiz);

  raiz.append(crearHero(), crearMetricas(), crearFiltros());

  cajaLista = ui.h("div", {
    id: "lista-atractivos",
    "aria-live": "polite",
    "aria-busy": "true",
  });
  raiz.append(cajaLista);

  await Promise.all([
    cargarFiltroDistritos(),
    cargarChipsCategorias(),
    actualizarMetricas(),
  ]);
  await recargar();
}

export function destroy() {
  destruido = true;
  if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
}

/* ---------- Construcción de la interfaz ---------- */

// Cabecera visual con insignia, título y llamada a la acción.
function crearHero() {
  const botonRegistrar = ui.h("button", {
    type: "button",
    class: "boton boton--primario",
  }, ui.icono("add_location_alt"), ui.h("span", { texto: "Registrar atractivo" }));
  botonRegistrar.addEventListener("click", () => abrirFormulario(null));

  const botonSincronizar = ui.h("button", {
    type: "button",
    class: "boton-icono",
    "aria-label": "Recargar la lista de atractivos",
    title: "Recargar lista",
  }, ui.icono("sync"));
  botonSincronizar.addEventListener("click", async () => {
    await Promise.all([actualizarMetricas(), recargar()]);
    ui.toast("Lista actualizada desde Supabase.", "exito");
  });

  return ui.h(
    "section",
    { class: "hero hero--atractivos" },
    ui.h(
      "div",
      { class: "hero__contenido" },
      ui.h(
        "span",
        { class: "badge-mono" },
        ui.icono("hub"),
        ui.h("span", { texto: "SIGTUR · Región Cañete" })
      ),
      ui.h("h2", { class: "hero__titulo", texto: "Atractivos" }),
      ui.h("p", {
        class: "hero__texto",
        texto: "Gestión y control del inventario de recursos turísticos de la provincia de Cañete: distrito, categoría, dirección y coordenadas.",
      }),
      ui.h("div", { class: "hero__acciones" }, botonRegistrar, botonSincronizar)
    )
  );
}

// Métricas del inventario (datos reales, sin filtros).
function crearMetricas() {
  cajaMetricas = ui.h("div", { class: "rejilla-metricas", "aria-live": "polite" });
  cajaMetricas.append(
    metrica("Inventario", "…"),
    metrica("Con coordenadas", "…", "metrica__valor--oliva"),
    metrica("Distritos", "…", "metrica__valor--terracota")
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

// Buscador, filtro de distrito, chips de categoría y botón limpiar.
function crearFiltros() {
  const inputBusqueda = ui.h("input", {
    type: "search",
    id: "filtro-busqueda",
    class: "control",
    name: "buscar",
    placeholder: "Buscar por nombre del atractivo…",
    "aria-label": "Buscar atractivo por nombre",
    autocomplete: "off",
  });

  const botonLimpiarBusqueda = ui.h("button", {
    type: "button",
    class: "buscador__limpiar",
    "aria-label": "Borrar búsqueda",
    hidden: true,
  }, ui.icono("close"));
  botonLimpiarBusqueda.addEventListener("click", () => {
    inputBusqueda.value = "";
    botonLimpiarBusqueda.hidden = true;
    estado.buscar = "";
    inputBusqueda.focus();
    recargar();
  });

  // Búsqueda con rebote: espera 350 ms mientras el usuario escribe.
  inputBusqueda.addEventListener("input", (evento) => {
    botonLimpiarBusqueda.hidden = evento.target.value === "";
    if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      estado.buscar = evento.target.value;
      recargar();
    }, 350);
  });

  selectDistrito = ui.h(
    "select",
    { id: "filtro-distrito", class: "control", name: "id_distrito" },
    ui.h("option", { value: "", texto: "Todos los distritos" })
  );
  selectDistrito.addEventListener("change", (evento) => {
    estado.idDistrito = evento.target.value;
    recargar();
  });

  contenedorChips = ui.h("div", {
    class: "chips",
    id: "chips-categoria",
    role: "group",
    "aria-label": "Filtrar por categoría",
  });

  const botonLimpiar = ui.h("button", {
    type: "button",
    class: "boton boton--fantasma boton--pequeno",
  }, ui.icono("filter_alt_off"), ui.h("span", { texto: "Limpiar filtros" }));
  botonLimpiar.addEventListener("click", () => {
    estado.buscar = "";
    estado.idDistrito = "";
    estado.idCategoria = "";
    inputBusqueda.value = "";
    botonLimpiarBusqueda.hidden = true;
    selectDistrito.value = "";
    pintarChips(null);
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
          ui.h("span", { texto: "Nombre" })
        ),
        ui.h("div", { class: "buscador" },
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
          { class: "campo-filtro__etiqueta", for: "filtro-distrito" },
          ui.icono("location_on"),
          ui.h("span", { texto: "Distrito" })
        ),
        selectDistrito
      ),
      ui.h("div", { class: "filtros__acciones" }, botonLimpiar)
    ),
    contenedorChips
  );
}

/* ---------- Carga de datos ---------- */

async function cargarFiltroDistritos() {
  try {
    const distritos = await api.obtenerDistritos();
    if (destruido) return;
    for (const distrito of distritos) {
      selectDistrito.append(
        ui.h("option", {
          value: String(distrito.id_distrito),
          texto: distrito.nombre,
        })
      );
    }
  } catch (error) {
    if (destruido) return;
    ui.toast(`No se pudieron cargar los distritos: ${ui.traducirError(error)}`, "error");
  }
}

async function cargarChipsCategorias() {
  try {
    const categorias = await api.obtenerCategorias();
    if (destruido) return;
    pintarChips(categorias);
  } catch (error) {
    if (destruido) return;
    ui.toast(`No se pudieron cargar las categorías: ${ui.traducirError(error)}`, "error");
  }
}

// Dibuja los chips de categoría (la primera opción es "Todas").
function pintarChips(categorias) {
  if (!contenedorChips) return;
  ui.limpiar(contenedorChips);

  const opciones = [
    { valor: "", texto: "Todas" },
    ...(categorias || []).map((c) => ({
      valor: String(c.id_categoria),
      texto: c.nombre,
    })),
  ];

  for (const opcion of opciones) {
    const activa = estado.idCategoria === opcion.valor;
    const chip = ui.h(
      "button",
      {
        type: "button",
        class: `chip${activa ? " chip--activa" : ""}`,
        "aria-pressed": String(activa),
        texto: opcion.texto,
      }
    );
    chip.addEventListener("click", () => {
      estado.idCategoria = opcion.valor;
      pintarChips(categorias);
      recargar();
    });
    contenedorChips.append(chip);
  }
}

// Métricas globales del inventario (sin filtros aplicados).
async function actualizarMetricas() {
  if (destruido || !cajaMetricas) return;
  try {
    const todos = await api.obtenerAtractivos();
    if (destruido) return;

    const conCoordenadas = todos.filter(
      (a) => a.latitud !== null && a.longitud !== null
    ).length;
    const distritos = new Set(todos.map((a) => a.id_distrito)).size;

    ui.limpiar(cajaMetricas);
    cajaMetricas.append(
      metrica("Inventario", String(todos.length).padStart(2, "0")),
      metrica("Con coordenadas", String(conCoordenadas).padStart(2, "0"), "metrica__valor--oliva"),
      metrica("Distritos", String(distritos).padStart(2, "0"), "metrica__valor--terracota")
    );
  } catch (error) {
    if (destruido) return;
    ui.toast(ui.traducirError(error), "error");
  }
}

// Consulta la lista y la pinta como tarjetas.
async function recargar() {
  if (destruido || !cajaLista) return;

  cajaLista.setAttribute("aria-busy", "true");
  ui.reemplazar(cajaLista, ui.contenedorCargando("Cargando atractivos…"));

  try {
    const atractivos = await api.obtenerAtractivos(estado);
    if (destruido) return;

    ui.pintarTarjetas({
      contenedor: cajaLista,
      datos: atractivos,
      textoVacio: "No hay atractivos que coincidan con la búsqueda.",
      renderTarjeta: crearTarjeta,
    });
  } catch (error) {
    if (destruido) return;
    ui.reemplazar(
      cajaLista,
      ui.contenedorError(ui.traducirError(error), () => recargar())
    );
  } finally {
    if (!destruido) cajaLista.setAttribute("aria-busy", "false");
  }
}

// Tarjeta individual de un atractivo.
function crearTarjeta(item) {
  const codigo = `AT-${String(item.id_atractivo).padStart(3, "0")}`;
  const ubicacion = item.direccion || "Sin dirección registrada";

  const botonEditar = ui.h(
    "button",
    { type: "button", class: "boton boton--suave boton--pequeno", "aria-label": `Editar ${item.nombre}` },
    ui.icono("edit"),
    ui.h("span", { texto: "Editar" })
  );
  botonEditar.addEventListener("click", () => abrirFormulario(item));

  const botonEliminar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono boton-icono--pequeno boton-icono--peligro",
      "aria-label": `Eliminar ${item.nombre}`,
      title: "Eliminar",
    },
    ui.icono("delete")
  );
  botonEliminar.addEventListener("click", () => eliminarAtractivo(item));

  return ui.h(
    "article",
    { class: "tarjeta-item" },
    ui.h(
      "div",
      { class: "tarjeta-item__inicio" },
      crearEspacioImagen(item, fotos.obtenerFotoLocal("atractivo", item.id_atractivo), () => abrirFormulario(item)),
      ui.h(
        "div",
        { class: "tarjeta-item__cuerpo" },
        ui.h(
          "div",
          { class: "tarjeta-item__fila" },
          ui.h("span", { class: "codigo", texto: codigo }),
          ui.h("span", {
            class: "insignia insignia--suave",
            texto: item.categoria?.nombre || "Sin categoría",
          })
        ),
        ui.h("h3", { class: "tarjeta-item__titulo", texto: item.nombre }),
        ui.h(
          "p",
          { class: "tarjeta-item__ubicacion" },
          ui.icono("pin_drop"),
          ui.h("span", { texto: ubicacion })
        )
      )
    ),
    ui.h(
      "div",
      { class: "tarjeta-item__meta" },
      ui.h("span", {
        class: "insignia",
        texto: item.distrito?.nombre || "Sin distrito",
      }),
      ui.h("span", {
        class: "mono texto-tenue",
        texto: ui.formatearCoordenadas(item.latitud, item.longitud),
      })
    ),
    ui.h("div", { class: "tarjeta-item__acciones" }, botonEditar, botonEliminar)
  );
}

/* ---------- Formulario (crear / editar) ---------- */

// Crea un campo con etiqueta, control y espacio para el error.
function crearCampo({ nombre, etiqueta, requerido = false, ayuda = null, tipo = "text" }) {
  const errorId = `${nombre}-error`;
  const control = ui.h("input", {
    type: tipo,
    id: nombre,
    name: nombre,
    class: "control",
    required: requerido || undefined,
    "aria-describedby": errorId,
  });

  const hijos = [
    ui.h(
      "label",
      { class: "campo__etiqueta", for: nombre },
      etiqueta,
      requerido ? ui.h("span", { class: "requerido", texto: "*", "aria-hidden": "true" }) : null
    ),
    control,
  ];
  if (ayuda) hijos.push(ui.h("p", { class: "campo__ayuda", id: `${nombre}-ayuda`, texto: ayuda }));
  hijos.push(ui.h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true }));

  return { nodo: ui.h("div", { class: "campo" }, ...hijos), control };
}

function crearSelect({ nombre, etiqueta, requerido = false, opciones = [], vacio = "Seleccione…" }) {
  const errorId = `${nombre}-error`;
  const control = ui.h(
    "select",
    { id: nombre, name: nombre, class: "control", required: requerido || undefined, "aria-describedby": errorId },
    ui.h("option", { value: "", texto: vacio }),
    ...opciones.map((op) => ui.h("option", { value: String(op.valor), texto: op.texto }))
  );

  return {
    nodo: ui.h(
      "div",
      { class: "campo" },
      ui.h(
        "label",
        { class: "campo__etiqueta", for: nombre },
        etiqueta,
        requerido ? ui.h("span", { class: "requerido", texto: "*", "aria-hidden": "true" }) : null
      ),
      control,
      ui.h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true })
    ),
    control,
  };
}

function crearTextarea({ nombre, etiqueta, requerido = false, ayuda = null, maximo = 500 }) {
  const errorId = `${nombre}-error`;
  const control = ui.h("textarea", {
    id: nombre,
    name: nombre,
    class: "control",
    maxlength: String(maximo),
    required: requerido || undefined,
    "aria-describedby": errorId,
  });

  const hijos = [
    ui.h(
      "label",
      { class: "campo__etiqueta", for: nombre },
      etiqueta,
      requerido ? ui.h("span", { class: "requerido", texto: "*", "aria-hidden": "true" }) : null
    ),
    control,
  ];
  if (ayuda) hijos.push(ui.h("p", { class: "campo__ayuda", texto: ayuda }));
  hijos.push(ui.h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true }));

  return { nodo: ui.h("div", { class: "campo" }, ...hijos), control };
}

async function abrirFormulario(atractivoExistente) {
  const esEdicion = Boolean(atractivoExistente);

  // Catálogos para los select (distritos y categorías).
  let distritos = [];
  let categorias = [];
  try {
    [distritos, categorias] = await Promise.all([
      api.obtenerDistritos(),
      api.obtenerCategorias(),
    ]);
  } catch (error) {
    ui.toast(ui.traducirError(error), "error");
    return;
  }

  const campoNombre = crearCampo({
    nombre: "nombre",
    etiqueta: "Nombre del atractivo",
    requerido: true,
    ayuda: `Máximo ${MAX.nombre} caracteres.`,
  });
  campoNombre.control.maxLength = MAX.nombre;

  const campoDistrito = crearSelect({
    nombre: "id_distrito",
    etiqueta: "Distrito",
    requerido: true,
    opciones: distritos.map((d) => ({ valor: d.id_distrito, texto: d.nombre })),
    vacio: "Seleccione un distrito",
  });

  const campoCategoria = crearSelect({
    nombre: "id_categoria",
    etiqueta: "Categoría",
    requerido: true,
    opciones: categorias.map((c) => ({ valor: c.id_categoria, texto: c.nombre })),
    vacio: "Seleccione una categoría",
  });

  const campoDireccion = crearCampo({
    nombre: "direccion",
    etiqueta: "Dirección",
    ayuda: `Máximo ${MAX.direccion} caracteres.`,
  });
  campoDireccion.control.maxLength = MAX.direccion;

  const campoImagen = crearCampoImagen();

  const campoLatitud = crearCampo({
    nombre: "latitud",
    etiqueta: "Latitud",
    ayuda: `Entre -90 y 90 (máx. ${MAX.decimales} decimales).`,
  });
  campoLatitud.control.type = "number";
  campoLatitud.control.min = "-90";
  campoLatitud.control.max = "90";
  campoLatitud.control.step = "any";
  campoLatitud.control.inputMode = "decimal";

  const campoLongitud = crearCampo({
    nombre: "longitud",
    etiqueta: "Longitud",
    ayuda: `Entre -180 y 180 (máx. ${MAX.decimales} decimales).`,
  });
  campoLongitud.control.type = "number";
  campoLongitud.control.min = "-180";
  campoLongitud.control.max = "180";
  campoLongitud.control.step = "any";
  campoLongitud.control.inputMode = "decimal";

  const campoDescripcion = crearTextarea({
    nombre: "descripcion",
    etiqueta: "Descripción",
    ayuda: `Máximo ${MAX.descripcion} caracteres.`,
    maximo: MAX.descripcion,
  });

  const botonCancelar = ui.h("button", {
    type: "button",
    class: "boton boton--suave",
    texto: "Cancelar",
  });
  const botonGuardar = ui.h("button", {
    type: "submit",
    class: "boton boton--primario",
  }, ui.icono("save"), ui.h("span", { texto: esEdicion ? "Guardar cambios" : "Crear atractivo" }));

  const formulario = ui.h(
    "form",
    { class: "formulario", novalidate: true },
    ui.h(
      "div",
      { class: "formulario__rejilla" },
      campoNombre.nodo,
      campoDistrito.nodo,
      campoCategoria.nodo,
      campoDireccion.nodo,
      campoImagen.nodo,
      campoLatitud.nodo,
      campoLongitud.nodo
    ),
    campoDescripcion.nodo,
    ui.h("div", { class: "formulario__acciones" }, botonCancelar, botonGuardar)
  );

  // Prellenar en modo edición.
  if (esEdicion) {
    campoNombre.control.value = atractivoExistente.nombre ?? "";
    campoDistrito.control.value = String(atractivoExistente.id_distrito ?? "");
    campoCategoria.control.value = String(atractivoExistente.id_categoria ?? "");
    campoDireccion.control.value = atractivoExistente.direccion ?? "";
    campoLatitud.control.value = atractivoExistente.latitud ?? "";
    campoLongitud.control.value = atractivoExistente.longitud ?? "";
    campoDescripcion.control.value = atractivoExistente.descripcion ?? "";
  }

  const entrada = ui.abrirModal({
    titulo: esEdicion ? "Editar atractivo" : "Nuevo atractivo",
    cuerpo: formulario,
  });

  ui.vigilarErrores(formulario);
  botonCancelar.addEventListener("click", () => entrada.cerrar());

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datos = leerFormulario(formulario);
    const errores = validarAtractivo(datos);
    ui.mostrarErrores(formulario, errores);
    if (Object.values(errores).some(Boolean)) return;

    // Estado de carga en el botón para evitar dobles envíos.
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
        resultado = await api.actualizarAtractivo(atractivoExistente.id_atractivo, datos);
        await fotos.guardarFotoLocal("atractivo", resultado.id_atractivo, archivoFoto);
        ui.toast("Atractivo actualizado correctamente.", "exito");
      } else {
        resultado = await api.crearAtractivo(datos);
        await fotos.guardarFotoLocal("atractivo", resultado.id_atractivo, archivoFoto);
        ui.toast("Atractivo creado correctamente.", "exito");
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

// Lee y normaliza los valores del formulario.
function leerFormulario(formulario) {
  const valor = (nombre) => formulario.elements[nombre].value;
  const latitud = valor("latitud").trim();
  const longitud = valor("longitud").trim();

  return {
    nombre: valor("nombre").trim(),
    id_distrito: Number(valor("id_distrito")),
    id_categoria: Number(valor("id_categoria")),
    direccion: valor("direccion").trim(),
    imagen_archivo: formulario.elements.imagen_archivo.files?.[0] || null,
    // Los campos numéricos vacíos se envían como null (nunca como "").
    latitud: latitud === "" ? null : Number(latitud),
    longitud: longitud === "" ? null : Number(longitud),
    descripcion: valor("descripcion").trim(),
  };
}

// Validaciones del cliente ANTES de consultar a Supabase.
function validarAtractivo(datos) {
  const v = ui.validacion;
  const latitudTexto = datos.latitud === null ? "" : String(datos.latitud);
  const longitudTexto = datos.longitud === null ? "" : String(datos.longitud);

  return {
    nombre:
      v.requerido(datos.nombre, "nombre") ||
      v.longitudMaxima(datos.nombre, MAX.nombre, "El nombre"),
    id_distrito: datos.id_distrito
      ? null
      : "Selecciona un distrito.",
    id_categoria: datos.id_categoria
      ? null
      : "Selecciona una categoría.",
    latitud:
      v.rangoNumerico(latitudTexto, -90, 90, "La latitud") ||
      v.decimalesMaximos(latitudTexto, MAX.decimales, "La latitud"),
    longitud:
      v.rangoNumerico(longitudTexto, -180, 180, "La longitud") ||
      v.decimalesMaximos(longitudTexto, MAX.decimales, "La longitud"),
    descripcion: v.longitudMaxima(datos.descripcion, MAX.descripcion, "La descripción"),
    direccion: v.longitudMaxima(datos.direccion, MAX.direccion, "La dirección"),
    imagen_archivo: fotos.validarFotoLocal(datos.imagen_archivo),
  };
}

// Muestra la fotografía registrada o un marcador cuando todavía no hay una.
function crearEspacioImagen(item, fotoLocal, alSeleccionar) {
  const marco = ui.h("button", {
    type: "button",
    class: "foto-atractivo",
    "aria-label": fotoLocal
      ? `Cambiar foto de ${item.nombre}`
      : `Subir foto para ${item.nombre}`,
    title: fotoLocal ? "Cambiar foto" : "Subir foto",
  });
  marco.addEventListener("click", alSeleccionar);

  const sinFoto = () => {
    ui.limpiar(marco);
    marco.classList.add("foto-atractivo--vacia");
    marco.append(
      ui.icono("add_a_photo"),
      ui.h("span", { texto: "Subir foto" })
    );
  };

  if (!fotoLocal) {
    sinFoto();
    return marco;
  }

  marco.classList.remove("foto-atractivo--vacia");
  const imagen = ui.h("img", {
    src: fotoLocal,
    alt: `Foto de ${item.nombre}`,
    loading: "lazy",
  });
  imagen.addEventListener("error", sinFoto);
  marco.append(imagen);
  return marco;
}

function crearCampoImagen() {
  const errorId = "imagen_archivo-error";
  const control = ui.h("input", {
    type: "file",
    id: "imagen_archivo",
    name: "imagen_archivo",
    class: "control control--archivo",
    accept: "image/jpeg,image/png,image/webp",
    "aria-describedby": errorId,
  });

  return {
    nodo: ui.h(
      "div",
      { class: "campo" },
      ui.h(
        "label",
        { class: "campo__etiqueta", for: "imagen_archivo" },
        "Foto del atractivo"
      ),
      control,
      ui.h("p", {
        class: "campo__ayuda",
        texto: "Se guarda solo en este navegador (JPG, PNG o WebP; máximo 1.5 MB).",
      }),
      ui.h("p", { class: "campo__error", id: errorId, "data-error-para": "imagen_archivo", hidden: true })
    ),
    control,
  };
}


/* ---------- Eliminar ---------- */

async function eliminarAtractivo(item) {
  const confirmado = await ui.confirmar({
    titulo: "Eliminar atractivo",
    mensaje: `Se eliminará "${item.nombre}". Esta acción no se puede deshacer. Si tiene visitas o rutas relacionadas, el sistema impedirá el borrado.`,
    textoAceptar: "Sí, eliminar",
  });
  if (!confirmado) return;

  try {
    await api.eliminarAtractivo(item.id_atractivo);
    ui.toast(`Se eliminó "${item.nombre}".`, "exito");
    await Promise.all([recargar(), actualizarMetricas()]);
  } catch (error) {
    // Aquí se traducen 23503 (registros relacionados) y 23505, etc.
    ui.toast(ui.traducirError(error), "error");
  }
}
