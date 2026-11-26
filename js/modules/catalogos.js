// =========================================================
// js/modules/catalogos.js
// Catálogos del sistema: maestros de distrito y categoría.
// Pestañas tipo chip, buscador, tabla con
// el uso real de cada fila (atractivos o servicios que la
// referencian) y alta/edición/borrado respetando las
// restricciones UNIQUE y FOREIGN KEY de la base.
// =========================================================

import * as api from "../api.js";
import * as ui from "../ui.js";

// Definición de las tres pestañas del módulo.
const PESTANAS = [
  {
    clave: "distrito",
    id: "id_distrito",
    etiqueta: "Distritos",
    singular: "distrito",
    icono: "location_city",
    prefijo: "DS",
    conDescripcion: true,
    usa: "atractivo",
  },
  {
    clave: "categoria",
    id: "id_categoria",
    etiqueta: "Categorías",
    singular: "categoría",
    icono: "category",
    prefijo: "CT",
    conDescripcion: false,
    usa: "atractivo",
  },
];

// Pestaña activa y texto del buscador.
const estado = { pestana: "distrito", buscar: "" };

// Copias en memoria de los tres maestros y su uso real.
let listas = { distrito: [], categoria: [] };
let usos = { distrito: {}, categoria: {} };

let raiz = null;
let cajaLista = null;
let cajaMetricas = null;
let contenedorChips = null;
let botonLimpiarBusqueda = null;
let temporizadorBusqueda = null;
let destruido = false;

// Atajo a la pestaña seleccionada.
function pestanaActual() {
  return PESTANAS.find((p) => p.clave === estado.pestana) || PESTANAS[0];
}

/* ---------- Ciclo de vida ---------- */

export async function init(contenedor) {
  raiz = contenedor;
  destruido = false;
  estado.pestana = "distrito";
  estado.buscar = "";
  ui.limpiar(raiz);

  raiz.append(crearHero(), crearMetricas(), crearFiltros());

  cajaLista = ui.h("div", {
    id: "lista-catalogos",
    "aria-live": "polite",
    "aria-busy": "true",
  });
  raiz.append(cajaLista);

  await cargarTodo();
}

export function destroy() {
  destruido = true;
  if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
}

/* ---------- Construcción de la interfaz ---------- */

function crearHero() {
  const botonNuevo = ui.h(
    "button",
    { type: "button", class: "boton boton--primario" },
    ui.icono("add"),
    ui.h("span", { texto: "Nuevo registro" })
  );
  botonNuevo.addEventListener("click", () => abrirFormulario(null));

  const botonSincronizar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono",
      "aria-label": "Recargar los catálogos",
      title: "Recargar catálogos",
    },
    ui.icono("sync")
  );
  botonSincronizar.addEventListener("click", async () => {
    await cargarTodo();
    ui.toast("Catálogos actualizados desde Supabase.", "exito");
  });

  return ui.h(
    "section",
    { class: "hero hero--catalogos" },
    ui.h(
      "div",
      { class: "hero__contenido" },
      ui.h(
        "span",
        { class: "badge-mono" },
        ui.icono("database"),
        ui.h("span", { texto: "SIGTUR · Maestros del sistema" })
      ),
      ui.h("h2", { class: "hero__titulo", texto: "Catálogos del sistema" }),
      ui.h("p", {
        class: "hero__texto",
        texto: "Administración de los parámetros base de Cañete Vive: distritos, categorías de atractivos y tipos de servicio que alimentan el resto de los módulos.",
      }),
      ui.h("div", { class: "hero__acciones" }, botonNuevo, botonSincronizar)
    )
  );
}

function crearMetricas() {
  cajaMetricas = ui.h("div", { class: "rejilla-metricas", "aria-live": "polite" });
  cajaMetricas.append(
    metrica("Distritos", "…"),
    metrica("Categorías", "…", "metrica__valor--oliva")
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
    placeholder: "Buscar por nombre en el catálogo activo…",
    "aria-label": "Buscar en el catálogo activo",
    autocomplete: "off",
  });

  botonLimpiarBusqueda = ui.h(
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
    id: "chips-catalogos",
    role: "group",
    "aria-label": "Seleccionar catálogo",
  });

  return ui.h(
    "section",
    { class: "tarjeta", "aria-label": "Búsqueda y catálogos" },
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
      )
    ),
    contenedorChips
  );
}

/* ---------- Carga y pintado ---------- */

// Carga los tres maestros y el uso real de cada fila.
async function cargarTodo() {
  if (destruido) return;

  try {
    const [distritos, categorias, atractivos] =
      await Promise.all([
        api.obtenerDistritos(),
        api.obtenerCategorias(),
        api.obtenerAtractivos(),
      ]);
    if (destruido) return;

    listas = { distrito: distritos, categoria: categorias };
    usos = {
      distrito: contarPor(atractivos, "id_distrito"),
      categoria: contarPor(atractivos, "id_categoria"),
    };

    actualizarMetricas();
    pintarChips();
    pintar();
  } catch (error) {
    if (destruido) return;
    ui.reemplazar(
      cajaLista,
      ui.contenedorError(ui.traducirError(error), () => cargarTodo())
    );
  }
}

// Cuenta cuántas veces aparece cada id en una lista de filas.
function contarPor(filas, columna) {
  const conteo = {};
  for (const fila of filas) {
    const clave = String(fila[columna]);
    conteo[clave] = (conteo[clave] || 0) + 1;
  }
  return conteo;
}

function actualizarMetricas() {
  if (destruido || !cajaMetricas) return;
  ui.limpiar(cajaMetricas);
  cajaMetricas.append(
    metrica("Distritos", String(listas.distrito.length).padStart(2, "0")),
    metrica("Categorías", String(listas.categoria.length).padStart(2, "0"), "metrica__valor--oliva")
  );
}

// Pestañas tipo chip con el conteo real de cada catálogo.
function pintarChips() {
  if (!contenedorChips) return;
  ui.limpiar(contenedorChips);

  for (const pestana of PESTANAS) {
    const activa = estado.pestana === pestana.clave;
    const cantidad = listas[pestana.clave].length;
    const chip = ui.h(
      "button",
      {
        type: "button",
        class: `chip${activa ? " chip--activa" : ""}`,
        "aria-pressed": String(activa),
      },
      ui.icono(pestana.icono),
      ui.h("span", { texto: `${pestana.etiqueta} (${cantidad})` })
    );
    chip.addEventListener("click", () => {
      if (estado.pestana === pestana.clave) return;
      estado.pestana = pestana.clave;
      estado.buscar = "";
      const buscador = document.getElementById("filtro-busqueda");
      if (buscador) buscador.value = "";
      if (botonLimpiarBusqueda) botonLimpiarBusqueda.hidden = true;
      pintarChips();
      pintar();
    });
    contenedorChips.append(chip);
  }
}

// Tabla del catálogo activo, filtrada por el texto de búsqueda.
function pintar() {
  if (destruido || !cajaLista) return;

  const pestana = pestanaActual();
  const texto = estado.buscar.trim().toLowerCase();
  const filas = listas[pestana.clave].filter(
    (fila) => !texto || String(fila.nombre).toLowerCase().includes(texto)
  );

  ui.pintarTabla({
    contenedor: cajaLista,
    caption: `Catálogo: ${pestana.etiqueta} · ${filas.length} registro(s)`,
    textoVacio: "No hay registros que coincidan con la búsqueda.",
    columnas: [
      { clave: "codigo", etiqueta: "Código" },
      { clave: "nombre", etiqueta: "Nombre" },
      { clave: "detalle", etiqueta: "Detalle" },
      { clave: "uso", etiqueta: "En uso" },
      { clave: "acciones", etiqueta: "Acciones" },
    ],
    datos: filas,
    renderCeldas: (fila) => {
      const codigo = `${pestana.prefijo}-${String(fila[pestana.id]).padStart(3, "0")}`;
      const detalle = pestana.conDescripcion
        ? fila.descripcion || "Sin descripción"
        : "—";
      const n = usos[pestana.clave][String(fila[pestana.id])] || 0;
      const uso = `${n} atractivo(s)`;

      const botonEditar = ui.h(
        "button",
        {
          type: "button",
          class: "boton boton--suave boton--pequeno",
          "aria-label": `Editar ${fila.nombre}`,
        },
        ui.icono("edit"),
        ui.h("span", { texto: "Editar" })
      );
      botonEditar.addEventListener("click", () => abrirFormulario(fila));

      const botonEliminar = ui.h(
        "button",
        {
          type: "button",
          class: "boton boton--suave boton--pequeno",
          "aria-label": `Eliminar ${fila.nombre}`,
        },
        ui.icono("delete"),
        ui.h("span", { texto: "Eliminar" })
      );
      botonEliminar.addEventListener("click", () => eliminarFila(fila));

      return [
        ui.h("span", { class: "mono", texto: codigo }),
        ui.h("strong", { texto: fila.nombre }),
        ui.h("span", { class: "texto-tenue", texto: String(detalle) }),
        ui.h("span", { class: "mono texto-tenue", texto: uso }),
        ui.h("div", { class: "acciones" }, botonEditar, botonEliminar),
      ];
    },
  });
}

/* ---------- Formulario (crear / editar) ---------- */

async function abrirFormulario(filaExistente) {
  const pestana = pestanaActual();
  const esEdicion = Boolean(filaExistente);
  const maximo = ui.LIMITES[pestana.clave].nombre;

  const campoNombre = ui.campo({
    nombre: "nombre",
    etiqueta: `Nombre del ${pestana.singular}`,
    requerido: true,
    ayuda: `Máximo ${maximo} caracteres.`,
    maximo,
  });

  const hijos = [campoNombre.nodo];

  if (pestana.conDescripcion) {
    hijos.push(
      ui.campoTextarea({
        nombre: "descripcion",
        etiqueta: "Descripción",
        ayuda: `Máximo ${ui.LIMITES.distrito.descripcion} caracteres.`,
        maximo: ui.LIMITES.distrito.descripcion,
      }).nodo
    );
  }

  const botonCancelar = ui.h(
    "button",
    { type: "button", class: "boton boton--suave", texto: "Cancelar" }
  );
  const botonGuardar = ui.h(
    "button",
    { type: "submit", class: "boton boton--primario" },
    ui.icono("save"),
    ui.h("span", { texto: esEdicion ? "Guardar cambios" : `Crear ${pestana.singular}` })
  );

  const formulario = ui.h(
    "form",
    { class: "formulario", novalidate: true },
    ...hijos,
    ui.h("div", { class: "formulario__acciones" }, botonCancelar, botonGuardar)
  );

  if (esEdicion) {
    campoNombre.control.value = filaExistente.nombre ?? "";
    const descripcion = formulario.elements.descripcion;
    if (descripcion) descripcion.value = filaExistente.descripcion ?? "";
  }

  const entrada = ui.abrirModal({
    titulo: esEdicion ? `Editar ${pestana.singular}` : `Nuevo ${pestana.singular}`,
    cuerpo: formulario,
  });

  ui.vigilarErrores(formulario);
  botonCancelar.addEventListener("click", () => entrada.cerrar());

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datos = leerFormulario(formulario, pestana.clave);
    const errores = validarCatalogo(datos, pestana, filaExistente);
    ui.mostrarErrores(formulario, errores);
    if (Object.values(errores).some(Boolean)) return;

    const textoOriginal = botonGuardar.textContent;
    botonGuardar.disabled = true;
    botonGuardar.textContent = "Guardando…";
    botonCancelar.disabled = true;

    try {
      if (esEdicion) {
        await guardar(pestana.clave, filaExistente[pestana.id], datos);
        ui.toast(`${capital(pestana.singular)} actualizado correctamente.`, "exito");
      } else {
        await guardar(pestana.clave, null, datos);
        ui.toast(`${capital(pestana.singular)} creado correctamente.`, "exito");
      }
      entrada.cerrar();
      await cargarTodo();
    } catch (error) {
      ui.toast(ui.traducirError(error), "error");
      botonGuardar.disabled = false;
      botonGuardar.textContent = textoOriginal;
      botonCancelar.disabled = false;
    }
  });
}

function capital(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function leerFormulario(formulario, clave) {
  const nombre = formulario.elements.nombre.value.trim();
  if (clave === "distrito") {
    return { nombre, descripcion: formulario.elements.descripcion.value.trim() };
  }
  return { nombre };
}

// Validaciones del cliente: obligatorios, longitudes y
// duplicados (los maestros tienen UNIQUE sobre "nombre").
function validarCatalogo(datos, pestana, filaExistente) {
  const v = ui.validacion;
  const maximo = ui.LIMITES[pestana.clave].nombre;

  const duplicado = listas[pestana.clave].some(
    (fila) =>
      (!filaExistente || fila[pestana.id] !== filaExistente[pestana.id]) &&
      String(fila.nombre).trim().toLowerCase() === datos.nombre.trim().toLowerCase()
  );

  const errores = {
    nombre:
      v.requerido(datos.nombre, "nombre") ||
      v.longitudMaxima(datos.nombre, maximo, "El nombre") ||
      (duplicado
        ? `Ya existe un ${pestana.singular} con ese nombre en este catálogo.`
        : null),
  };

  if (pestana.conDescripcion) {
    errores.descripcion = v.longitudMaxima(
      datos.descripcion,
      ui.LIMITES.distrito.descripcion,
      "La descripción"
    );
  }

  return errores;
}

// Despacha al guardar/actualizar según la pestaña activa.
async function guardar(clave, id, datos) {
  if (clave === "distrito") {
    return id ? api.actualizarDistrito(id, datos) : api.crearDistrito(datos);
  }
  return id ? api.actualizarCategoria(id, datos) : api.crearCategoria(datos);
}

/* ---------- Eliminar ---------- */

async function eliminarFila(fila) {
  const pestana = pestanaActual();
  const enUso = usos[pestana.clave][String(fila[pestana.id])] || 0;

  const confirmado = await ui.confirmar({
    titulo: `Eliminar ${pestana.singular}`,
    mensaje:
      enUso > 0
        ? `Se eliminará "${fila.nombre}", que está en uso por ${enUso} registro(s). Si la base lo tiene restringido, el borrado será bloqueado.`
        : `Se eliminará "${fila.nombre}". Esta acción no se puede deshacer.`,
    textoAceptar: "Sí, eliminar",
  });
  if (!confirmado) return;

  try {
    if (pestana.clave === "distrito") await api.eliminarDistrito(fila.id_distrito);
    else await api.eliminarCategoria(fila.id_categoria);

    ui.toast(`Se eliminó "${fila.nombre}".`, "exito");
    await cargarTodo();
  } catch (error) {
    // 23503: la base impide borrar filas referenciadas.
    ui.toast(ui.traducirError(error), "error");
  }
}
