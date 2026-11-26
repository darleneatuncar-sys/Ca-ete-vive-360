// =========================================================
// js/modules/servicios.js
// CRUD de servicios turísticos: hospedajes, gastronomía,
// agencias y guías afiliados en los distritos de Cañete.
// Filtros en el servidor (nombre, distrito y tipo) con chips
// derivados de la columna tipo_servicio de la propia tabla.
// =========================================================

import * as api from "../api.js";
import * as ui from "../ui.js";
import * as fotos from "../fotosLocales.js";

// Estado actual de los filtros de la vista.
const estado = {
  buscar: "",
  idDistrito: "",
  tipoServicio: "",
};

// Límites reales de la tabla servicio (ver js/ui.js -> LIMITES).
const MAX = ui.LIMITES.servicio;

let raiz = null;
let cajaLista = null;
let cajaMetricas = null;
let temporizadorBusqueda = null;
let destruido = false;
// Referencias de la interfaz que se llenan al cargar los catálogos.
let selectDistrito = null;
let contenedorChips = null;
// Copia SIN filtros: se usa para las métricas y para detectar
// duplicados (distrito + nombre) en el cliente.
let serviciosBase = [];

/* ---------- Ciclo de vida ---------- */

export async function init(contenedor) {
  raiz = contenedor;
  destruido = false;
  ui.limpiar(raiz);

  raiz.append(crearHero(), crearMetricas(), crearFiltros());

  cajaLista = ui.h("div", {
    id: "lista-servicios",
    "aria-live": "polite",
    "aria-busy": "true",
  });
  raiz.append(cajaLista);

  await Promise.all([
    cargarFiltroDistritos(),
    actualizarMetricas(),
  ]);
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
    ui.icono("add_circle"),
    ui.h("span", { texto: "Afiliar servicio" })
  );
  botonRegistrar.addEventListener("click", () => abrirFormulario(null));

  const botonSincronizar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono",
      "aria-label": "Recargar la lista de servicios",
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
    { class: "hero hero--servicios" },
    ui.h(
      "div",
      { class: "hero__contenido" },
      ui.h(
        "span",
        { class: "badge-mono" },
        ui.icono("verified_user"),
        ui.h("span", { texto: "SIGTUR · Padrón de prestadores" })
      ),
      ui.h("h2", { class: "hero__titulo", texto: "Servicios turísticos" }),
      ui.h("p", {
        class: "hero__texto",
        texto: "Directorio de prestadores homologados en los valles y litorales de Cañete: hospedajes, gastronomía, agencias de aventura, guías y transporte, con su distrito y tipo de servicio.",
      }),
      ui.h("div", { class: "hero__acciones" }, botonRegistrar, botonSincronizar)
    )
  );
}

function crearMetricas() {
  cajaMetricas = ui.h("div", { class: "rejilla-metricas", "aria-live": "polite" });
  cajaMetricas.append(
    metrica("Servicios", "…"),
    metrica("Distritos cubiertos", "…", "metrica__valor--oliva"),
    metrica("Tipos de servicio", "…", "metrica__valor--terracota")
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
    placeholder: "Buscar por nombre del servicio…",
    "aria-label": "Buscar servicio por nombre",
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
    id: "chips-tipo",
    role: "group",
    "aria-label": "Filtrar por tipo de servicio",
  });

  const botonLimpiar = ui.h(
    "button",
    { type: "button", class: "boton boton--fantasma boton--pequeno" },
    ui.icono("filter_alt_off"),
    ui.h("span", { texto: "Limpiar filtros" })
  );
  botonLimpiar.addEventListener("click", () => {
    estado.buscar = "";
    estado.idDistrito = "";
    estado.tipoServicio = "";
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

// Dibuja los chips de tipo (la primera opción es "Todos").
function pintarChips(tipos) {
  if (!contenedorChips) return;
  ui.limpiar(contenedorChips);

  const opciones = [
    { valor: "", texto: "Todos" },
    ...(tipos || []).map((tipo) => ({ valor: tipo, texto: tipo })),
  ];

  for (const opcion of opciones) {
    const activa = estado.tipoServicio === opcion.valor;
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
      estado.tipoServicio = opcion.valor;
      pintarChips(tipos);
      recargar();
    });
    contenedorChips.append(chip);
  }
}

// Métricas globales del padrón (sin filtros aplicados).
async function actualizarMetricas() {
  if (destruido || !cajaMetricas) return;
  try {
    const todos = await api.obtenerServicios();
    if (destruido) return;

    serviciosBase = todos;
    const distritos = new Set(todos.map((s) => s.id_distrito)).size;
    const tiposDisponibles = [...new Set(
      todos.map((s) => String(s.tipo_servicio || "").trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "es"));

    ui.limpiar(cajaMetricas);
    cajaMetricas.append(
      metrica("Servicios", String(todos.length).padStart(2, "0")),
      metrica("Distritos cubiertos", String(distritos).padStart(2, "0"), "metrica__valor--oliva"),
      metrica("Tipos de servicio", String(tiposDisponibles.length).padStart(2, "0"), "metrica__valor--terracota")
    );
    pintarChips(tiposDisponibles);
  } catch (error) {
    if (destruido) return;
    ui.toast(ui.traducirError(error), "error");
  }
}

// Consulta la lista (con filtros del servidor) y la pinta.
async function recargar() {
  if (destruido || !cajaLista) return;

  cajaLista.setAttribute("aria-busy", "true");
  ui.reemplazar(cajaLista, ui.contenedorCargando("Cargando servicios…"));

  try {
    const servicios = await api.obtenerServicios(estado);
    if (destruido) return;

    ui.pintarTarjetas({
      contenedor: cajaLista,
      datos: servicios,
      textoVacio: "No hay servicios que coincidan con los filtros.",
      renderTarjeta: crearTarjeta,
    });
  } catch (error) {
    if (destruido) return;
    ui.reemplazar(cajaLista, ui.contenedorError(ui.traducirError(error), () => recargar()));
  } finally {
    if (!destruido) cajaLista.setAttribute("aria-busy", "false");
  }
}

// Tarjeta individual de un servicio afiliado.
function crearTarjeta(item) {
  const codigo = `SV-${String(item.id_servicio).padStart(3, "0")}`;
  const ubicacion = item.direccion || `Distrito ${item.distrito?.nombre || "sin asignar"}`;
  const telefono = item.telefono || "Sin teléfono";

  const botonEditar = ui.h(
    "button",
    {
      type: "button",
      class: "boton boton--suave boton--pequeno",
      "aria-label": `Editar ${item.nombre}`,
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
      "aria-label": `Eliminar ${item.nombre}`,
      title: "Eliminar",
    },
    ui.icono("delete")
  );
  botonEliminar.addEventListener("click", () => eliminarServicio(item));

  return ui.h(
    "article",
    { class: "tarjeta-item" },
    ui.h(
      "div",
      { class: "tarjeta-item__inicio" },
      crearEspacioImagenServicio(item, fotos.obtenerFotoLocal("servicio", item.id_servicio), () => abrirFormulario(item)),
      ui.h(
        "div",
        { class: "tarjeta-item__cuerpo" },
        ui.h(
          "div",
          { class: "tarjeta-item__fila" },
          ui.h("span", { class: "codigo", texto: codigo }),
          ui.h("span", {
            class: "insignia insignia--suave",
            texto: item.tipo_servicio || "Sin tipo",
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
      ui.h("span", { class: "mono texto-tenue", texto: telefono })
    ),
    ui.h("div", { class: "tarjeta-item__acciones" }, botonEditar, botonEliminar)
  );
}

/* ---------- Formulario (crear / editar) ---------- */

async function abrirFormulario(servicioExistente) {
  const esEdicion = Boolean(servicioExistente);

  // Catálogo de distrito; el tipo pertenece a cada servicio.
  let distritos = [];
  try {
    distritos = await api.obtenerDistritos();
  } catch (error) {
    ui.toast(ui.traducirError(error), "error");
    return;
  }

  const campoNombre = ui.campo({
    nombre: "nombre",
    etiqueta: "Nombre del servicio",
    requerido: true,
    ayuda: `Máximo ${MAX.nombre} caracteres.`,
    maximo: MAX.nombre,
  });

  const campoDistrito = ui.campoSelect({
    nombre: "id_distrito",
    etiqueta: "Distrito",
    requerido: true,
    opciones: distritos.map((d) => ({ valor: d.id_distrito, texto: d.nombre })),
    vacio: "Seleccione un distrito",
  });

  const campoTipo = ui.campo({
    nombre: "tipo_servicio",
    etiqueta: "Tipo de servicio",
    requerido: true,
    ayuda: `Ejemplo: hospedaje, gastronomía o aventura. Máximo ${MAX.tipoServicio} caracteres.`,
    maximo: MAX.tipoServicio,
  });

  const campoTelefono = ui.campo({
    nombre: "telefono",
    etiqueta: "Teléfono",
    tipo: "tel",
    ayuda: `Opcional. Mínimo ${MAX.telefonoMin} dígitos, máximo ${MAX.telefono} caracteres.`,
    maximo: MAX.telefono,
  });

  const campoDireccion = ui.campo({
    nombre: "direccion",
    etiqueta: "Dirección",
    ayuda: `Máximo ${MAX.direccion} caracteres.`,
    maximo: MAX.direccion,
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
    ui.h("span", { texto: esEdicion ? "Guardar cambios" : "Afiliar servicio" })
  );

  const formulario = ui.h(
    "form",
    { class: "formulario", novalidate: true },
    ui.h(
      "div",
      { class: "formulario__rejilla" },
      campoNombre.nodo,
      campoDistrito.nodo,
      campoTipo.nodo,
      campoTelefono.nodo,
      campoImagen.nodo
    ),
    campoDireccion.nodo,
    ui.h("div", { class: "formulario__acciones" }, botonCancelar, botonGuardar)
  );

  // Prellenar en modo edición.
  if (esEdicion) {
    campoNombre.control.value = servicioExistente.nombre ?? "";
    campoDistrito.control.value = String(servicioExistente.id_distrito ?? "");
    campoTipo.control.value = servicioExistente.tipo_servicio ?? "";
    campoTelefono.control.value = servicioExistente.telefono ?? "";
    campoDireccion.control.value = servicioExistente.direccion ?? "";
  }

  const entrada = ui.abrirModal({
    titulo: esEdicion ? "Editar servicio" : "Nuevo servicio",
    cuerpo: formulario,
  });

  ui.vigilarErrores(formulario);
  botonCancelar.addEventListener("click", () => entrada.cerrar());

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datos = leerFormulario(formulario);
    const errores = validarServicio(datos, servicioExistente);
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
        resultado = await api.actualizarServicio(servicioExistente.id_servicio, datos);
        await fotos.guardarFotoLocal("servicio", resultado.id_servicio, archivoFoto);
        ui.toast("Servicio actualizado correctamente.", "exito");
      } else {
        resultado = await api.crearServicio(datos);
        await fotos.guardarFotoLocal("servicio", resultado.id_servicio, archivoFoto);
        ui.toast("Servicio afiliado correctamente.", "exito");
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
  return {
    nombre: valor("nombre").trim(),
    id_distrito: Number(valor("id_distrito")),
    tipo_servicio: valor("tipo_servicio").trim(),
    telefono: valor("telefono").trim(),
    direccion: valor("direccion").trim(),
    imagen_archivo: formulario.elements.imagen_archivo.files?.[0] || null,
  };
}

// Validaciones del cliente ANTES de consultar a Supabase.
// La tabla servicio NO tiene UNIQUE: el duplicado
// (distrito + nombre) se detecta aquí, con la copia completa.
function validarServicio(datos, servicioExistente) {
  const v = ui.validacion;

  const duplicado = serviciosBase.some(
    (s) =>
      (!servicioExistente || s.id_servicio !== servicioExistente.id_servicio) &&
      Number(s.id_distrito) === Number(datos.id_distrito) &&
      String(s.nombre).trim().toLowerCase() === datos.nombre.trim().toLowerCase()
  );

  return {
    nombre:
      v.requerido(datos.nombre, "nombre") ||
      v.longitudMaxima(datos.nombre, MAX.nombre, "El nombre") ||
      (duplicado
        ? "Ya existe un servicio con ese nombre en este distrito."
        : null),
    id_distrito: datos.id_distrito ? null : "Selecciona un distrito.",
    tipo_servicio:
      v.requerido(datos.tipo_servicio, "tipo de servicio") ||
      v.longitudMaxima(datos.tipo_servicio, MAX.tipoServicio, "El tipo de servicio"),
    telefono: v.telefono(datos.telefono) || v.longitudMaxima(datos.telefono, MAX.telefono, "El teléfono"),
    direccion: v.longitudMaxima(datos.direccion, MAX.direccion, "La dirección"),
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
      ui.h("label", { class: "campo__etiqueta", for: "imagen_archivo" }, "Foto del servicio"),
      control,
      ui.h("p", { class: "campo__ayuda", texto: "Se guarda solo en este navegador (JPG, PNG o WebP; máximo 1.5 MB)." }),
      ui.h("p", { class: "campo__error", id: errorId, "data-error-para": "imagen_archivo", hidden: true })
    ), control,
  };
}

function crearEspacioImagenServicio(item, fotoLocal, alSeleccionar) {
  const marco = ui.h("button", {
    type: "button", class: "foto-atractivo",
    "aria-label": fotoLocal ? `Cambiar foto de ${item.nombre}` : `Subir foto para ${item.nombre}`,
    title: fotoLocal ? "Cambiar foto" : "Subir foto",
  });
  marco.addEventListener("click", alSeleccionar);
  const sinFoto = () => {
    ui.limpiar(marco);
    marco.classList.add("foto-atractivo--vacia");
    marco.append(ui.icono("add_a_photo"), ui.h("span", { texto: "Subir foto" }));
  };
  if (!fotoLocal) { sinFoto(); return marco; }
  const imagen = ui.h("img", { src: fotoLocal, alt: `Foto de ${item.nombre}`, loading: "lazy" });
  imagen.addEventListener("error", sinFoto);
  marco.append(imagen);
  return marco;
}

/* ---------- Eliminar ---------- */

async function eliminarServicio(item) {
  const confirmado = await ui.confirmar({
    titulo: "Eliminar servicio",
    mensaje: `Se eliminará "${item.nombre}" del padrón. Esta acción no se puede deshacer.`,
    textoAceptar: "Sí, eliminar",
  });
  if (!confirmado) return;

  try {
    await api.eliminarServicio(item.id_servicio);
    ui.toast(`Se eliminó "${item.nombre}".`, "exito");
    await Promise.all([recargar(), actualizarMetricas()]);
  } catch (error) {
    ui.toast(ui.traducirError(error), "error");
  }
}
