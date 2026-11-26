// =========================================================
// js/modules/rutas.js
// Módulo de Rutas: CRUD de la tabla `ruta` y gestión de sus
// paradas en `detalle_ruta` (agregar, eliminar y reordenar),
// con control del orden_visita (CHECK > 0 y único por ruta).
// Presentación: sistema de diseño "Cañete Vive".
// =========================================================

import * as api from "../api.js";
import * as ui from "../ui.js";

// Límites reales de la tabla ruta (ver js/ui.js -> LIMITES).
const MAX = ui.LIMITES.ruta;

// Estado de los filtros de la vista.
const estado = {
  buscar: "",
  idDistrito: "",
};

// Caché de datos (se recargan con el botón de sincronizar).
let rutas = [];
let vista = [];
let distritos = [];

let raiz = null;
let cajaLista = null;
let cajaMetricas = null;
let selectDistrito = null;
let temporizadorBusqueda = null;
let cargando = false;
let destruido = false;

/* ---------- Ciclo de vida ---------- */

export async function init(contenedor) {
  raiz = contenedor;
  destruido = false;
  ui.limpiar(raiz);

  raiz.append(crearHero(), crearMetricas(), crearFiltros());

  cajaLista = ui.h("div", {
    id: "lista-rutas",
    "aria-live": "polite",
    "aria-busy": "true",
  });
  raiz.append(cajaLista);

  await cargarFiltroDistritos();
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
    ui.icono("add_road"),
    ui.h("span", { texto: "Registrar ruta" })
  );
  botonRegistrar.addEventListener("click", () => abrirFormulario(null));

  const botonSincronizar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono",
      "aria-label": "Recargar la lista de rutas",
      title: "Recargar lista",
    },
    ui.icono("sync")
  );
  botonSincronizar.addEventListener("click", async () => {
    await recargar();
    ui.toast("Lista actualizada desde Supabase.", "exito");
  });

  return ui.h(
    "section",
    { class: "hero hero--rutas" },
    ui.h(
      "div",
      { class: "hero__contenido" },
      ui.h(
        "span",
        { class: "badge-mono" },
        ui.icono("route"),
        ui.h("span", { texto: "SIGTUR · Región Cañete" })
      ),
      ui.h("h2", { class: "hero__titulo", texto: "Rutas turísticas" }),
      ui.h("p", {
        class: "hero__texto",
        texto: "Recorridos ordenados por paradas: duración, secuencia de visitas y atractivos de cada ruta del inventario.",
      }),
      ui.h("div", { class: "hero__acciones" }, botonRegistrar, botonSincronizar)
    )
  );
}

function crearMetricas() {
  cajaMetricas = ui.h("div", { class: "rejilla-metricas", "aria-live": "polite" });
  cajaMetricas.append(
    metrica("Rutas", "…"),
    metrica("Paradas", "…", "metrica__valor--oliva"),
    metrica("Duración total", "…", "metrica__valor--terracota")
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

// Buscador por nombre de ruta o de parada, filtro de distrito y limpiar.
function crearFiltros() {
  const inputBusqueda = ui.h("input", {
    type: "search",
    id: "filtro-busqueda",
    class: "control",
    name: "buscar",
    placeholder: "Buscar ruta, atractivo o distrito…",
    "aria-label": "Buscar ruta por nombre o parada",
    autocomplete: "off",
  });

  const botonLimpiarBusqueda = ui.h(
    "button",
    {
      type: "button",
      class: "buscador__limpiar",
      "aria-label": "Borrar búsqueda",
      hidden: true,
    },
    ui.icono("close")
  );
  botonLimpiarBusqueda.addEventListener("click", () => {
    inputBusqueda.value = "";
    botonLimpiarBusqueda.hidden = true;
    estado.buscar = "";
    inputBusqueda.focus();
    pintarLista();
  });

  inputBusqueda.addEventListener("input", (evento) => {
    botonLimpiarBusqueda.hidden = evento.target.value === "";
    estado.buscar = evento.target.value;
    pintarLista();
  });

  selectDistrito = ui.h(
    "select",
    { id: "filtro-distrito", class: "control", name: "id_distrito" },
    ui.h("option", { value: "", texto: "Todos los distritos" })
  );
  selectDistrito.addEventListener("change", (evento) => {
    estado.idDistrito = evento.target.value;
    pintarLista();
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
    inputBusqueda.value = "";
    botonLimpiarBusqueda.hidden = true;
    selectDistrito.value = "";
    ui.toast("Filtros restablecidos.", "info");
    pintarLista();
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
          ui.h("span", { texto: "Ruta o parada" })
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
          ui.h("span", { texto: "Pasa por el distrito" })
        ),
        selectDistrito
      ),
      ui.h("div", { class: "filtros__acciones" }, botonLimpiar)
    )
  );
}

/* ---------- Carga de datos ---------- */

async function cargarFiltroDistritos() {
  try {
    distritos = await api.obtenerDistritos();
    if (destruido || !selectDistrito) return;
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

// Descarga rutas y paradas, actualiza métricas y pinta la lista.
async function recargar() {
  if (destruido || !cajaLista) return;

  cargando = true;
  cajaLista.setAttribute("aria-busy", "true");
  ui.reemplazar(cajaLista, ui.contenedorCargando("Cargando rutas…"));

  try {
    const [lista, filas] = await Promise.all([
      api.obtenerRutas(),
      api.obtenerVistaRutas(),
    ]);
    if (destruido) return;

    rutas = lista;
    vista = filas;
    // Con los datos en memoria ya se puede pintar (fin de la carga).
    cargando = false;
    actualizarMetricas();
    pintarLista();
  } catch (error) {
    cargando = false;
    if (destruido) return;
    ui.reemplazar(
      cajaLista,
      ui.contenedorError(ui.traducirError(error), () => recargar())
    );
  } finally {
    if (!destruido) cajaLista.setAttribute("aria-busy", "false");
  }
}

// Métricas globales (sin filtros): rutas, paradas y horas totales.
function actualizarMetricas() {
  if (destruido || !cajaMetricas) return;

  const horas = rutas.reduce(
    (suma, r) => suma + (Number(r.duracion_horas) || 0),
    0
  );

  ui.limpiar(cajaMetricas);
  cajaMetricas.append(
    metrica("Rutas", String(rutas.length).padStart(2, "0")),
    metrica("Paradas", String(vista.length).padStart(2, "0"), "metrica__valor--oliva"),
    metrica(
      "Duración total",
      `${horas % 1 === 0 ? horas : horas.toFixed(1)} h`,
      "metrica__valor--terracota"
    )
  );
}

// Paradas (filas de la vista) de una ruta concreta.
function paradasDe(idRuta) {
  return vista.filter((fila) => Number(fila.id_ruta) === Number(idRuta));
}

// Aplica búsqueda y filtro de distrito sobre la caché en memoria.
function filtrarRutas() {
  const texto = estado.buscar.trim().toLowerCase();
  let nombreDistrito = "";

  if (estado.idDistrito) {
    const distrito = distritos.find(
      (d) => String(d.id_distrito) === String(estado.idDistrito)
    );
    nombreDistrito = distrito ? distrito.nombre : "";
    if (!nombreDistrito) return [];
  }

  return rutas.filter((ruta) => {
    const paradas = paradasDe(ruta.id_ruta);

    if (nombreDistrito && !paradas.some((p) => p.distrito === nombreDistrito)) {
      return false;
    }

    if (!texto) return true;
    if (ruta.nombre.toLowerCase().includes(texto)) return true;

    // También busca dentro del nombre de los atractivos y distritos.
    return paradas.some(
      (p) =>
        String(p.atractivo || "").toLowerCase().includes(texto) ||
        String(p.distrito || "").toLowerCase().includes(texto)
    );
  });
}

function pintarLista() {
  if (destruido || !cajaLista || cargando) return;

  ui.pintarTarjetas({
    contenedor: cajaLista,
    datos: filtrarRutas(),
    textoVacio: "No hay rutas que coincidan con los filtros.",
    renderTarjeta: crearTarjeta,
  });
}

/* ---------- Tarjeta de una ruta ---------- */

function crearTarjeta(ruta) {
  const paradas = paradasDe(ruta.id_ruta);
  const codigo = `RT-${String(ruta.id_ruta).padStart(3, "0")}`;
  const duracion = `${Number(ruta.duracion_horas)} h`;

  // Distritos por los que pasa la ruta (sin repetir).
  const distritosRuta = [...new Set(paradas.map((p) => p.distrito).filter(Boolean))];

  const botonParadas = ui.h(
    "button",
    {
      type: "button",
      class: "boton boton--suave boton--pequeno",
      "aria-label": `Administrar paradas de ${ruta.nombre}`,
    },
    ui.icono("list_alt"),
    ui.h("span", { texto: paradas.length ? "Paradas" : "Agregar paradas" })
  );
  botonParadas.addEventListener("click", () => abrirParadas(ruta));

  const botonEditar = ui.h(
    "button",
    {
      type: "button",
      class: "boton boton--suave boton--pequeno",
      "aria-label": `Editar ${ruta.nombre}`,
    },
    ui.icono("edit"),
    ui.h("span", { texto: "Editar" })
  );
  botonEditar.addEventListener("click", () => abrirFormulario(ruta));

  const botonEliminar = ui.h(
    "button",
    {
      type: "button",
      class: "boton-icono boton-icono--pequeno boton-icono--peligro",
      "aria-label": `Eliminar ${ruta.nombre}`,
      title: "Eliminar",
    },
    ui.icono("delete")
  );
  botonEliminar.addEventListener("click", () => eliminarRuta(ruta));

  return ui.h(
    "article",
    { class: "tarjeta-item" },
    ui.h(
      "div",
      { class: "tarjeta-item__inicio" },
      ui.h("div", {
        class: "miniatura",
        texto: ui.iniciales(ruta.nombre),
        "aria-hidden": "true",
      }),
      ui.h(
        "div",
        { class: "tarjeta-item__cuerpo" },
        ui.h(
          "div",
          { class: "tarjeta-item__fila" },
          ui.h("span", { class: "codigo", texto: codigo }),
          ui.h("span", {
            class: "insignia insignia--suave",
            texto: `${paradas.length} parada(s)`,
          })
        ),
        ui.h("h3", { class: "tarjeta-item__titulo", texto: ruta.nombre }),
        ui.h(
          "p",
          { class: "tarjeta-item__ubicacion" },
          ui.icono("schedule"),
          ui.h("span", { class: "mono", texto: duracion })
        ),
        ui.h("p", {
          class: "tarjeta-item__descripcion texto-tenue",
          texto: ruta.descripcion || "Sin descripción registrada.",
        })
      )
    ),
    crearVistaParadas(paradas),
    ui.h(
      "div",
      { class: "tarjeta-item__meta" },
      ui.h("span", {
        class: "insignia",
        texto: distritosRuta.length
          ? distritosRuta.join(" · ")
          : "Sin paradas asignadas",
      }),
      ui.h("span", {
        class: "mono texto-tenue",
        texto: paradas.length ? `${paradas.length} parada(s)` : "0 parada(s)",
      })
    ),
    ui.h(
      "div",
      { class: "tarjeta-item__acciones" },
      botonParadas,
      botonEditar,
      botonEliminar
    )
  );
}

// Vista previa de las paradas dentro de la tarjeta (máx. 4).
function crearVistaParadas(paradas) {
  if (!paradas.length) {
    return ui.h("p", {
      class: "ruta-paradas ruta-paradas--vacia texto-tenue",
      texto: "Sin paradas: usa el botón «Paradas» para agregar atractivos al recorrido.",
    });
  }

  const contenedor = ui.h("div", { class: "ruta-paradas" });
  for (const parada of paradas.slice(0, 4)) {
    contenedor.append(
      ui.h(
        "div",
        { class: "ruta-parada" },
        ui.h("span", {
          class: "ruta-parada__orden",
          texto: String(parada.orden_visita),
          "aria-hidden": "true",
        }),
        ui.h("span", { class: "ruta-parada__nombre", texto: parada.atractivo }),
        ui.h("span", {
          class: "ruta-parada__distrito",
          texto: parada.distrito || "",
        })
      )
    );
  }

  if (paradas.length > 4) {
    contenedor.append(
      ui.h("p", {
        class: "ruta-parada__mas",
        texto: `+${paradas.length - 4} parada(s) más`,
      })
    );
  }

  return contenedor;
}

/* ---------- Formulario (crear / editar) ---------- */

function crearCampo({ nombre, etiqueta, requerido = false, ayuda = null }) {
  const errorId = `${nombre}-error`;
  const control = ui.h("input", {
    type: "text",
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
      requerido
        ? ui.h("span", { class: "requerido", texto: "*", "aria-hidden": "true" })
        : null
    ),
    control,
  ];
  if (ayuda) {
    hijos.push(ui.h("p", { class: "campo__ayuda", id: `${nombre}-ayuda`, texto: ayuda }));
  }
  hijos.push(
    ui.h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true })
  );

  return { nodo: ui.h("div", { class: "campo" }, ...hijos), control };
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
      requerido
        ? ui.h("span", { class: "requerido", texto: "*", "aria-hidden": "true" })
        : null
    ),
    control,
  ];
  if (ayuda) hijos.push(ui.h("p", { class: "campo__ayuda", texto: ayuda }));
  hijos.push(
    ui.h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true })
  );

  return { nodo: ui.h("div", { class: "campo" }, ...hijos), control };
}

async function abrirFormulario(rutaExistente) {
  const esEdicion = Boolean(rutaExistente);

  const campoNombre = crearCampo({
    nombre: "nombre",
    etiqueta: "Nombre de la ruta",
    requerido: true,
    ayuda: `Máximo ${MAX.nombre} caracteres.`,
  });
  campoNombre.control.maxLength = MAX.nombre;

  const campoDuracion = crearCampo({
    nombre: "duracion_horas",
    etiqueta: "Duración (horas)",
    requerido: true,
    ayuda: "Debe ser mayor que 0 (admite decimales).",
  });
  campoDuracion.control.type = "number";
  campoDuracion.control.min = "0.5";
  campoDuracion.control.step = "0.5";
  campoDuracion.control.inputMode = "decimal";

  const campoDescripcion = crearTextarea({
    nombre: "descripcion",
    etiqueta: "Descripción",
    ayuda: `Máximo ${MAX.descripcion} caracteres.`,
    maximo: MAX.descripcion,
  });

  const botonCancelar = ui.h(
    "button",
    { type: "button", class: "boton boton--suave", texto: "Cancelar" }
  );
  const botonGuardar = ui.h(
    "button",
    { type: "submit", class: "boton boton--primario" },
    ui.icono("save"),
    ui.h("span", { texto: esEdicion ? "Guardar cambios" : "Crear ruta" })
  );

  const formulario = ui.h(
    "form",
    { class: "formulario", novalidate: true },
    ui.h(
      "div",
      { class: "formulario__rejilla" },
      campoNombre.nodo,
      campoDuracion.nodo
    ),
    campoDescripcion.nodo,
    ui.h("div", { class: "formulario__acciones" }, botonCancelar, botonGuardar)
  );

  if (esEdicion) {
    campoNombre.control.value = rutaExistente.nombre ?? "";
    campoDuracion.control.value = rutaExistente.duracion_horas ?? "";
    campoDescripcion.control.value = rutaExistente.descripcion ?? "";
  }

  const entrada = ui.abrirModal({
    titulo: esEdicion ? "Editar ruta" : "Nueva ruta",
    cuerpo: formulario,
  });

  ui.vigilarErrores(formulario);
  botonCancelar.addEventListener("click", () => entrada.cerrar());

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const datos = leerFormulario(formulario);
    const errores = validarRuta(datos, rutaExistente);
    ui.mostrarErrores(formulario, errores);
    if (Object.values(errores).some(Boolean)) return;

    const textoOriginal = botonGuardar.textContent;
    botonGuardar.disabled = true;
    botonGuardar.textContent = "Guardando…";
    botonCancelar.disabled = true;

    try {
      if (esEdicion) {
        await api.actualizarRuta(rutaExistente.id_ruta, datos);
        ui.toast("Ruta actualizada correctamente.", "exito");
      } else {
        await api.crearRuta(datos);
        ui.toast("Ruta creada correctamente.", "exito");
      }
      entrada.cerrar();
      await recargar();
    } catch (error) {
      ui.toast(ui.traducirError(error), "error");
      botonGuardar.disabled = false;
      botonGuardar.textContent = textoOriginal;
      botonCancelar.disabled = false;
    }
  });
}

function leerFormulario(formulario) {
  const valor = (nombre) => formulario.elements[nombre].value;
  const duracion = valor("duracion_horas").trim();

  return {
    nombre: valor("nombre").trim(),
    // El CHECK ck_ruta_duracion exige > 0: nunca se envía "" ni 0.
    duracion_horas: duracion === "" ? null : Number(duracion),
    descripcion: valor("descripcion").trim(),
  };
}

// Validaciones del cliente ANTES de consultar a Supabase.
function validarRuta(datos, rutaExistente) {
  const v = ui.validacion;
  const idActual = rutaExistente ? Number(rutaExistente.id_ruta) : null;

  // uq_ruta_nombre: se comprueba en el cliente para avisar antes.
  const nombreRepetido = rutas.some(
    (r) =>
      Number(r.id_ruta) !== idActual &&
      r.nombre.trim().toLowerCase() === datos.nombre.toLowerCase()
  );

  return {
    nombre:
      v.requerido(datos.nombre, "nombre") ||
      v.longitudMaxima(datos.nombre, MAX.nombre, "El nombre") ||
      (nombreRepetido ? "Ya existe una ruta con ese nombre." : null),
    duracion_horas:
      (datos.duracion_horas === null
        ? "Indica la duración de la ruta en horas."
        : null) ||
      v.numeroPositivo(datos.duracion_horas, "La duración"),
    descripcion: v.longitudMaxima(datos.descripcion, MAX.descripcion, "La descripción"),
  };
}

/* ---------- Eliminar ---------- */

async function eliminarRuta(item) {
  const paradas = paradasDe(item.id_ruta).length;
  const confirmado = await ui.confirmar({
    titulo: "Eliminar ruta",
    mensaje: `Se eliminará "${item.nombre}"${
      paradas ? ` junto con sus ${paradas} parada(s)` : ""
    }. Esta acción no se puede deshacer.`,
    textoAceptar: "Sí, eliminar",
  });
  if (!confirmado) return;

  try {
    await api.eliminarRuta(item.id_ruta);
    ui.toast(`Se eliminó "${item.nombre}".`, "exito");
    await recargar();
  } catch (error) {
    // 23503 (si alguien referenció la ruta) se traduce aquí.
    ui.toast(ui.traducirError(error), "error");
  }
}

/* ---------- Paradas (detalle_ruta) ---------- */

async function abrirParadas(ruta) {
  let paradas = [];
  let atractivos = [];

  try {
    [paradas, atractivos] = await Promise.all([
      api.obtenerParadas(ruta.id_ruta),
      api.obtenerAtractivos(),
    ]);
  } catch (error) {
    ui.toast(ui.traducirError(error), "error");
    return;
  }
  if (destruido) return;

  const cuerpo = ui.h("div", { class: "panel-paradas" });
  const entrada = ui.abrirModal({
    titulo: `Paradas · ${ruta.nombre}`,
    cuerpo,
  });

  // Evita repintar cuando el usuario ya cerró la ventana.
  let abierto = true;
  entrada.alCerrar = () => {
    abierto = false;
  };

  // Vuelve a leer la ruta en la caché por si cambió mientras tanto.
  const refrescarFondo = () => recargar();

  const pintar = () => {
    if (destruido || !abierto) return;
    ui.limpiar(cuerpo);
    cuerpo.append(
      crearResumenParadas(ruta, paradas),
      crearListaParadas(ruta, paradas, pintar),
      crearFormularioParada(ruta, paradas, atractivos, async (nueva) => {
        await aplicarCambio(async () => {
          paradas = await api.obtenerParadas(ruta.id_ruta);
        });
        const nombreNuevo =
          nueva.atractivo?.nombre ||
          atractivos.find((a) => Number(a.id_atractivo) === Number(nueva.id_atractivo))
            ?.nombre ||
          "nueva parada";
        ui.toast(`Parada agregada: ${nombreNuevo}.`, "exito");
      })
    );
  };

  // Ejecuta una operación y repinta el modal + la tarjeta de fondo.
  const aplicarCambio = async (operacion) => {
    try {
      await operacion();
      pintar();
      refrescarFondo();
    } catch (error) {
      // 23505: atractivo repetido u orden ocupado (uq_detalle_ruta_*).
      ui.toast(mensajeParada(error), "error");
      // Reconcilia el modal con lo que quedó realmente en la base.
      try {
        paradas = await api.obtenerParadas(ruta.id_ruta);
        pintar();
      } catch {
        /* si no se pudo releer, se conserva la lista actual */
      }
    }
  };

  pintar();
}

// Mensajes específicos para las restricciones únicas de detalle_ruta.
function mensajeParada(error) {
  const texto = `${error?.message || ""}`;
  if (texto.includes("uq_detalle_ruta_atractivo")) {
    return "Ese atractivo ya forma parte de la ruta.";
  }
  if (texto.includes("uq_detalle_ruta_orden")) {
    return "Ese orden ya está ocupado por otra parada de la ruta.";
  }
  return ui.traducirError(error);
}

function crearResumenParadas(ruta, paradas) {
  const horas = Number(ruta.duracion_horas);
  return ui.h(
    "div",
    { class: "paradas-resumen" },
    ui.h(
      "span",
      { class: "badge-mono" },
      ui.icono("route"),
      ui.h("span", {
        class: "mono",
        texto: `RT-${String(ruta.id_ruta).padStart(3, "0")} · ${paradas.length} parada(s) · ${
          horas % 1 === 0 ? horas : horas.toFixed(1)
        } h`,
      })
    ),
    ui.h("p", {
      class: "paradas-resumen__ayuda texto-tenue",
      texto: "El orden debe ser mayor que 0 y no puede repetirse dentro de la misma ruta.",
    })
  );
}

function crearListaParadas(ruta, paradas, repintar) {
  if (!paradas.length) {
    return ui.h("div", {
      class: "estado estado--vacio",
      texto: "Esta ruta todavía no tiene paradas. Agrega el primer atractivo abajo.",
    });
  }

  const lista = ui.h("div", { class: "paradas-lista" });

  paradas.forEach((parada, indice) => {
    const nombre = parada.atractivo?.nombre || `Atractivo ${parada.id_atractivo}`;
    const distrito = parada.atractivo?.distrito?.nombre || "";

    const botonSubir = ui.h(
      "button",
      {
        type: "button",
        class: "boton-icono boton-icono--pequeno",
        "aria-label": `Subir ${nombre}`,
        title: "Subir",
        disabled: indice === 0 || undefined,
      },
      ui.icono("arrow_upward")
    );
    botonSubir.addEventListener("click", () =>
      moverParada(ruta, paradas, indice, indice - 1, repintar)
    );

    const botonBajar = ui.h(
      "button",
      {
        type: "button",
        class: "boton-icono boton-icono--pequeno",
        "aria-label": `Bajar ${nombre}`,
        title: "Bajar",
        disabled: indice === paradas.length - 1 || undefined,
      },
      ui.icono("arrow_downward")
    );
    botonBajar.addEventListener("click", () =>
      moverParada(ruta, paradas, indice, indice + 1, repintar)
    );

    const botonEliminar = ui.h(
      "button",
      {
        type: "button",
        class: "boton-icono boton-icono--pequeno boton-icono--peligro",
        "aria-label": `Quitar ${nombre} de la ruta`,
        title: "Quitar de la ruta",
      },
      ui.icono("delete")
    );
    botonEliminar.addEventListener("click", () =>
      quitarParada(ruta, paradas, parada, repintar)
    );

    lista.append(
      ui.h(
        "div",
        { class: "parada-fila" },
        ui.h(
          "div",
          { class: "parada-fila__izquierda" },
          ui.h("span", {
            class: "parada-fila__orden",
            texto: String(parada.orden_visita),
            "aria-hidden": "true",
          }),
          ui.h(
            "div",
            { class: "parada-fila__texto" },
            ui.h("p", { class: "parada-fila__nombre", texto: nombre }),
            distrito
              ? ui.h("p", { class: "parada-fila__subtitulo", texto: distrito })
              : null
          )
        ),
        ui.h(
          "div",
          { class: "parada-fila__acciones" },
          botonSubir,
          botonBajar,
          botonEliminar
        )
      )
    );
  });

  return lista;
}

// Formulario para agregar una parada (atractivo + orden).
function crearFormularioParada(ruta, paradas, atractivos, alAgregar) {
  const usados = new Set(paradas.map((p) => Number(p.id_atractivo)));
  const disponibles = atractivos.filter((a) => !usados.has(Number(a.id_atractivo)));

  const siguienteOrden =
    paradas.length === 0
      ? 1
      : Math.max(...paradas.map((p) => Number(p.orden_visita) || 0)) + 1;

  const selectAtractivo = ui.h(
    "select",
    { id: "parada-atractivo", class: "control", name: "id_atractivo" },
    ui.h("option", {
      value: "",
      texto: disponibles.length
        ? "Seleccione un atractivo…"
        : "Sin atractivos disponibles",
    }),
    ...disponibles.map((a) =>
      ui.h("option", { value: String(a.id_atractivo), texto: a.nombre })
    )
  );

  const inputOrden = ui.h("input", {
    type: "number",
    id: "parada-orden",
    class: "control",
    name: "orden_visita",
    min: "1",
    step: "1",
    value: String(siguienteOrden),
    "aria-label": "Orden de visita",
  });

  const errorParada = ui.h("p", {
    class: "campo__error",
    id: "parada-error",
    hidden: true,
  });

  const botonAgregar = ui.h(
    "button",
    { type: "submit", class: "boton boton--primario boton--pequeno" },
    ui.icono("add"),
    ui.h("span", { texto: "Agregar parada" })
  );
  botonAgregar.disabled = !disponibles.length;

  const formulario = ui.h(
    "form",
    { class: "paradas-agregar", novalidate: true },
    ui.h(
      "div",
      { class: "campo" },
      ui.h("label", { class: "campo__etiqueta", for: "parada-atractivo" },
        ui.icono("pin_drop"),
        ui.h("span", { texto: "Atractivo" })
      ),
      selectAtractivo
    ),
    ui.h(
      "div",
      { class: "campo campo--estrecho" },
      ui.h("label", { class: "campo__etiqueta", for: "parada-orden" },
        ui.icono("sort"),
        ui.h("span", { texto: "Orden" })
      ),
      inputOrden
    ),
    ui.h("div", { class: "paradas-agregar__accion" }, botonAgregar),
    errorParada
  );

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const idAtractivo = Number(selectAtractivo.value);
    const orden = Number(inputOrden.value);

    // Validaciones contra las restricciones reales de la base.
    let mensaje = null;
    if (!idAtractivo) {
      mensaje = "Selecciona un atractivo.";
    } else if (!Number.isInteger(orden) || orden < 1) {
      mensaje = "El orden debe ser un número entero mayor que 0.";
    } else if (paradas.some((p) => Number(p.orden_visita) === orden)) {
      mensaje = `El orden ${orden} ya está ocupado en esta ruta.`;
    }

    errorParada.hidden = !mensaje;
    errorParada.textContent = mensaje || "";
    if (mensaje) return;

    botonAgregar.disabled = true;
    const textoOriginal = botonAgregar.textContent;
    botonAgregar.textContent = "Agregando…";

    try {
      const nueva = await api.agregarParada({
        id_ruta: ruta.id_ruta,
        id_atractivo: idAtractivo,
        orden_visita: orden,
      });
      await alAgregar(nueva);
    } catch (error) {
      ui.toast(mensajeParada(error), "error");
      botonAgregar.disabled = false;
      botonAgregar.textContent = textoOriginal;
    }
  });

  return formulario;
}

// Mueve una parada a la posición vecina usando un orden temporal,
// para no violar uq_detalle_ruta_orden durante el intercambio.
async function moverParada(ruta, paradas, desde, hacia, repintar) {
  if (hacia < 0 || hacia >= paradas.length) return;

  const origen = paradas[desde];
  const destino = paradas[hacia];
  // Se capturan los valores ANTES de tocar la base: si la lectura
  // posterior devolviera objetos vivos, no se leerían ya modificados.
  const ordenOrigen = Number(origen.orden_visita);
  const ordenDestino = Number(destino.orden_visita);
  const temporal = Math.max(...paradas.map((p) => Number(p.orden_visita) || 0)) + 1000;

  try {
    await api.actualizarOrdenParada(origen.id_detalle, temporal);
    await api.actualizarOrdenParada(destino.id_detalle, ordenOrigen);
    await api.actualizarOrdenParada(origen.id_detalle, ordenDestino);

    // Relee el orden real desde la base y repinta el modal.
    const actualizadas = await api.obtenerParadas(ruta.id_ruta);
    paradas.splice(0, paradas.length, ...actualizadas);
    repintar();
    recargar();
  } catch (error) {
    ui.toast(mensajeParada(error), "error");
    try {
      const actualizadas = await api.obtenerParadas(ruta.id_ruta);
      paradas.splice(0, paradas.length, ...actualizadas);
      repintar();
    } catch {
      /* se conserva la lista actual */
    }
  }
}

async function quitarParada(ruta, paradas, parada, repintar) {
  const nombre = parada.atractivo?.nombre || "este atractivo";
  const confirmado = await ui.confirmar({
    titulo: "Quitar parada",
    mensaje: `Se quitará "${nombre}" del recorrido. El resto de paradas se renumera en pantalla.`,
    textoAceptar: "Quitar",
  });
  if (!confirmado) return;

  try {
    await api.eliminarParada(parada.id_detalle);
    ui.toast(`Se quitó "${nombre}" de la ruta.`, "exito");
    const actualizadas = await api.obtenerParadas(ruta.id_ruta);
    paradas.splice(0, paradas.length, ...actualizadas);
    repintar();
    recargar();
  } catch (error) {
    ui.toast(mensajeParada(error), "error");
  }
}
