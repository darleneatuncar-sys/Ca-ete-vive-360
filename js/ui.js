// =========================================================
// js/ui.js
// Helpers de interfaz: DOM seguro, toasts, modales, tablas,
// estados de carga, validación y traducción de errores.
// Regla: los datos del usuario NUNCA se insertan con
// innerHTML; se usan nodos creados con createElement y
// textContent / createTextNode para evitar XSS.
// =========================================================

/* ---------------------------------------------------------
   1. Manipulación segura del DOM
   --------------------------------------------------------- */

// Elimina todos los hijos de un nodo.
export function limpiar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

// Crea un elemento con atributos y hijos de forma declarativa.
// props: class, texto (textContent), dataset, on<Event> y atributos.
export function h(tag, props = {}, ...hijos) {
  const elemento = document.createElement(tag);

  for (const [clave, valor] of Object.entries(props)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === "class") {
      elemento.className = valor;
    } else if (clave === "texto") {
      elemento.textContent = String(valor);
    } else if (clave === "dataset") {
      Object.assign(elemento.dataset, valor);
    } else if (clave.startsWith("on") && typeof valor === "function") {
      elemento.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (valor === true) {
      elemento.setAttribute(clave, "");
    } else {
      elemento.setAttribute(clave, String(valor));
    }
  }

  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    elemento.append(
      hijo instanceof Node ? hijo : document.createTextNode(String(hijo))
    );
  }
  return elemento;
}

// Escapa caracteres especiales (por si hace falta interpolar texto).
export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Icono monolineal del sistema de diseño (Material Symbols).
export function icono(nombre, clase = "") {
  return h("span", {
    class: `material-symbols-outlined ${clase}`.trim(),
    "aria-hidden": "true",
    texto: nombre,
  });
}

// Iniciales para las miniaturas de las tarjetas (máx. 2 letras).
export function iniciales(texto) {
  const partes = String(texto ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "—";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// Reemplaza todo el contenido de un contenedor por un nodo.
export function reemplazar(contenedor, nodo) {
  limpiar(contenedor);
  contenedor.append(nodo);
}

/* ---------------------------------------------------------
   2. Toasts (mensajes flotantes)
   --------------------------------------------------------- */

const TIPOS_TOAST = ["exito", "error", "aviso", "info"];

export function toast(mensaje, tipo = "info") {
  const raiz = document.getElementById("toasts");
  if (!raiz) return;

  const tipoValido = TIPOS_TOAST.includes(tipo) ? tipo : "info";
  const nodo = h(
    "div",
    { class: `toast toast--${tipoValido}` },
    h("span", { class: "toast__texto", texto: String(mensaje) })
  );

  raiz.append(nodo);

  // Como máximo 4 toasts en pantalla a la vez.
  while (raiz.children.length > 4) raiz.firstElementChild.remove();

  let retirado = false;
  const retirar = () => {
    if (retirado) return;
    retirado = true;
    clearTimeout(temporizador);
    nodo.classList.add("toast--salir");
    setTimeout(() => nodo.remove(), 300);
  };
  const temporizador = setTimeout(retirar, 4500);
  // El usuario también puede descartar el aviso con un clic.
  nodo.addEventListener("click", retirar);
}

/* ---------------------------------------------------------
   3. Modales (con pila, foco y cierre con Escape)
   --------------------------------------------------------- */

const pilaModales = [];

function elementosFocables(panel) {
  return Array.from(
    panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.closest("[hidden]"));
}

function manejarTeclaModal(evento, panel) {
  if (evento.key === "Escape") {
    evento.preventDefault();
    cerrarModal();
    return;
  }
  if (evento.key !== "Tab") return;

  const focables = elementosFocables(panel);
  if (focables.length === 0) return;

  const primero = focables[0];
  const ultimo = focables[focables.length - 1];

  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
}

// Abre una ventana modal. Devuelve una entrada con:
//   entrada.cerrar()      -> cierra este modal
//   entrada.alCerrar      -> callback opcional al cerrar
export function abrirModal({ titulo, cuerpo, estrecho = false }) {
  const raiz = document.getElementById("modal-raiz");
  const focoPrevio = document.activeElement;

  const botonCerrar = h("button", {
    type: "button",
    class: "modal__cerrar",
    "aria-label": "Cerrar ventana",
    texto: "×",
  });

  const panel = h(
    "div",
    {
      class: `modal__panel${estrecho ? " modal__panel--estrecho" : ""}`,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": titulo,
      tabindex: "-1",
    },
    h(
      "div",
      { class: "modal__cabecera" },
      h("h2", { class: "modal__titulo", texto: titulo }),
      botonCerrar
    ),
    h("div", { class: "modal__cuerpo" }, cuerpo)
  );

  const entrada = { alCerrar: null, cerrar: null };
  const tecla = (evento) => manejarTeclaModal(evento, panel);

  const cerrar = () => {
    const indice = pilaModales.findIndex((item) => item.panel === panel);
    if (indice === -1) return;
    pilaModales.splice(indice, 1);
    document.removeEventListener("keydown", tecla);
    raiz.removeChild(panel);

    if (pilaModales.length === 0) {
      raiz.hidden = true;
      document.body.classList.remove("modal-abierto");
    }
    if (entrada.alCerrar) entrada.alCerrar();
    if (focoPrevio && typeof focoPrevio.focus === "function") focoPrevio.focus();
  };

  botonCerrar.addEventListener("click", cerrar);

  entrada.cerrar = cerrar;
  pilaModales.push({ panel, cerrar, tecla });
  document.addEventListener("keydown", tecla);

  raiz.hidden = false;
  document.body.classList.add("modal-abierto");
  raiz.append(panel);
  panel.focus();

  return entrada;
}

// Cierra el modal que está en la cima de la pila.
export function cerrarModal() {
  const tope = pilaModales[pilaModales.length - 1];
  if (tope) tope.cerrar();
}

// Cierra todos los modales (por ejemplo, al cambiar de módulo).
export function cerrarTodosLosModales() {
  while (pilaModales.length > 0) cerrarModal();
}

// Cierra al hacer clic fuera del panel.
document.getElementById("modal-raiz")?.addEventListener("click", (evento) => {
  if (evento.target.id === "modal-raiz") cerrarModal();
});

/* Confirmación antes de acciones destructivas. */
export function confirmar({
  titulo,
  mensaje,
  textoAceptar = "Sí, eliminar",
  textoCancelar = "Cancelar",
}) {
  return new Promise((resolve) => {
    let resuelto = false;
    const finalizar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
    };

    const botonCancelar = h(
      "button",
      { type: "button", class: "boton boton--suave", texto: textoCancelar },
      []
    );
    const botonAceptar = h(
      "button",
      { type: "button", class: "boton boton--peligro", texto: textoAceptar },
      []
    );

    botonCancelar.addEventListener("click", () => {
      finalizar(false);
      cerrarModal();
    });
    botonAceptar.addEventListener("click", () => {
      finalizar(true);
      cerrarModal();
    });

    const cuerpo = h(
      "div",
      { class: "confirmar" },
      h("p", { texto: mensaje }),
      h("div", { class: "modal__acciones" }, botonCancelar, botonAceptar)
    );

    const entrada = abrirModal({ titulo, cuerpo, estrecho: true });
    // Si se cierra con Escape o clic fuera: respuesta negativa.
    entrada.alCerrar = () => finalizar(false);
  });
}

/* ---------------------------------------------------------
   4. Estados de carga, vacío y error
   --------------------------------------------------------- */

export function contenedorCargando(texto = "Cargando…") {
  return h(
    "div",
    { class: "estado estado--cargando", role: "status" },
    h("span", { class: "spinner", "aria-hidden": "true" }),
    h("span", { texto })
  );
}

export function contenedorVacio(texto = "No hay registros.") {
  return h(
    "div",
    { class: "estado estado--vacio" },
    h(
      "svg",
      {
        class: "estado__icono",
        viewBox: "0 0 24 24",
        width: "42",
        height: "42",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "1.6",
        "stroke-linecap": "round",
        "aria-hidden": "true",
      },
      h("circle", { cx: "12", cy: "12", r: "9" }),
      h("path", { d: "M8.5 12h7" })
    ),
    h("p", { class: "estado__texto", texto })
  );
}

export function contenedorError(mensaje, alReintentar = null) {
  const hijos = [
    h(
      "svg",
      {
        class: "estado__icono",
        viewBox: "0 0 24 24",
        width: "42",
        height: "42",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "1.6",
        "stroke-linecap": "round",
        "aria-hidden": "true",
      },
      h("circle", { cx: "12", cy: "12", r: "9" }),
      h("path", { d: "M12 7.5v5M12 16h.01" })
    ),
    h("p", { class: "estado__texto", texto: String(mensaje) }),
  ];

  if (alReintentar) {
    const boton = h("button", {
      type: "button",
      class: "boton boton--suave",
      texto: "Reintentar",
    });
    boton.addEventListener("click", alReintentar);
    hijos.push(boton);
  }

  return h("div", { class: "estado estado--error" }, ...hijos);
}

/* ---------------------------------------------------------
   5. Tablas
   --------------------------------------------------------- */

// Pinta una tabla a partir de datos planos.
// - columnas: [{ clave, etiqueta }] (la etiqueta se usa como
//   data-label para las tarjetas en móvil)
// - renderCeldas(item) devuelve un arreglo de nodos o textos
export function pintarTabla({
  contenedor,
  columnas,
  datos,
  renderCeldas,
  textoVacio = "No hay registros.",
  caption = "",
}) {
  limpiar(contenedor);

  if (!datos || datos.length === 0) {
    contenedor.append(contenedorVacio(textoVacio));
    return;
  }

  const encabezado = h("tr", {}, ...columnas.map((col) =>
    h("th", { scope: "col", texto: col.etiqueta })
  ));

  const cuerpo = h("tbody");
  for (const item of datos) {
    const celdas = renderCeldas(item);
    const fila = h(
      "tr",
      {},
      ...columnas.map((col, i) => {
        const td = h("td", { "data-label": col.etiqueta });
        const contenido = celdas[i];
        if (contenido instanceof Node) td.append(contenido);
        else td.append(document.createTextNode(String(contenido ?? "")));
        return td;
      })
    );
    cuerpo.append(fila);
  }

  const tabla = h(
    "table",
    { class: "tabla" },
    caption ? h("caption", { texto: caption }) : null,
    h("thead", {}, encabezado),
    cuerpo
  );

  // El envoltorio es quien aporta el scroll horizontal en escritorio.
  contenedor.append(h("div", { class: "tabla-scroll" }, tabla));
}

// Pinta una rejilla de tarjetas (misma filosofía que pintarTabla:
// los datos nunca se insertan como HTML).
export function pintarTarjetas({
  contenedor,
  datos,
  renderTarjeta,
  textoVacio = "No hay registros.",
}) {
  limpiar(contenedor);

  if (!datos || datos.length === 0) {
    contenedor.append(contenedorVacio(textoVacio));
    return;
  }

  const rejilla = h("div", { class: "lista-tarjetas" });
  for (const item of datos) {
    const tarjeta = renderTarjeta(item);
    if (tarjeta instanceof Node) rejilla.append(tarjeta);
  }
  contenedor.append(rejilla);
}

/* ---------------------------------------------------------
   6. Validación (se ejecuta ANTES de enviar a Supabase)
   --------------------------------------------------------- */

// Límites REALES medidos en la base de datos del proyecto
// (los valores de texto con "5000" son columnas TEXT: se usa
// 5000 como límite práctico de la interfaz).
export const LIMITES = {
  distrito: { nombre: 80, descripcion: 5000 },
  categoria: { nombre: 60 },
  atractivo: { nombre: 120, direccion: 180, descripcion: 5000, imagenUrl: 500, decimales: 7 },
  servicio: { nombre: 120, tipoServicio: 40, telefono: 20, direccion: 180, telefonoMin: 7, imagenUrl: 500 },
  turista: { nombres: 100, apellidos: 100, imagenUrl: 500 },
  ruta: { nombre: 120, descripcion: 5000 },
  visita: { comentario: 5000 },
  detalle_ruta: { orden: "entero > 0" },
};

export const validacion = {
  requerido(valor, etiqueta) {
    if (valor === null || valor === undefined || String(valor).trim() === "") {
      return `El campo ${etiqueta} es obligatorio.`;
    }
    return null;
  },

  longitudMaxima(valor, maximo, etiqueta) {
    if (valor && String(valor).length > maximo) {
      return `${etiqueta} no puede superar los ${maximo} caracteres.`;
    }
    return null;
  },

  // Formato aceptado por el CHECK ck_servicio_telefono de la base.
  telefono(valor, etiqueta = "teléfono") {
    if (!valor) return null;
    const texto = String(valor).trim();
    if (!/^[0-9()+\-\s.]+$/.test(texto)) {
      return `El ${etiqueta} solo puede contener números, espacios, paréntesis, guiones o puntos.`;
    }
    const digitos = texto.replace(/\D/g, "").length;
    if (digitos < 7) {
      return `El ${etiqueta} debe tener al menos 7 dígitos.`;
    }
    return null;
  },

  correo(valor, etiqueta = "correo") {
    if (!valor) return null;
    // Mismo criterio que el CHECK ck_turista_correo de la base:
    // algo antes de la arroba, algo después, y al menos un punto en el dominio.
    const patron = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!patron.test(String(valor).trim())) {
      return `El ${etiqueta} no tiene un formato válido.`;
    }
    return null;
  },

  rangoNumerico(valor, minimo, maximo, etiqueta) {
    if (valor === "" || valor === null || valor === undefined) return null;
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return `${etiqueta} debe ser un número.`;
    if (numero < minimo || numero > maximo) {
      return `${etiqueta} debe estar entre ${minimo} y ${maximo}.`;
    }
    return null;
  },

  numeroPositivo(valor, etiqueta) {
    if (valor === "" || valor === null || valor === undefined) return null;
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return `${etiqueta} debe ser un número.`;
    if (numero <= 0) return `${etiqueta} debe ser mayor que 0.`;
    return null;
  },

  decimalesMaximos(valor, maximo, etiqueta) {
    if (!valor) return null;
    const texto = String(valor).trim();
    if (!/^-?\d+(\.\d+)?$/.test(texto)) return `${etiqueta} debe ser un número.`;
    const partes = texto.split(".");
    if (partes.length > 1 && partes[1].length > maximo) {
      return `${etiqueta} admite como máximo ${maximo} decimales.`;
    }
    return null;
  },

  fechaNoFutura(valor, etiqueta = "La fecha") {
    if (!valor) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) return `${etiqueta} no es válida.`;
    if (fecha > hoy) return `${etiqueta} no puede ser futura.`;
    return null;
  },
};

/* ---------------------------------------------------------
   6b. Campos de formulario reutilizables
   --------------------------------------------------------- */

// Campo de texto (o tipo "date"/"number"…): etiqueta, control,
// ayuda opcional y espacio reservado para el error.
// Devuelve { nodo, control } igual que los helpers locales de
// los módulos, para que todos los formularios sean idénticos.
export function campo({
  nombre,
  etiqueta,
  tipo = "text",
  requerido = false,
  ayuda = null,
  maximo = null,
  ...atributos
}) {
  const errorId = `${nombre}-error`;
  const control = h("input", {
    type: tipo,
    id: nombre,
    name: nombre,
    class: "control",
    required: requerido || undefined,
    "aria-describedby": errorId,
    ...atributos,
  });
  if (maximo !== null && maximo !== undefined) control.maxLength = maximo;

  const hijos = [
    h(
      "label",
      { class: "campo__etiqueta", for: nombre },
      etiqueta,
      requerido ? h("span", { class: "requerido", texto: "*", "aria-hidden": "true" }) : null
    ),
    control,
  ];
  if (ayuda) hijos.push(h("p", { class: "campo__ayuda", id: `${nombre}-ayuda`, texto: ayuda }));
  hijos.push(h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true }));

  return { nodo: h("div", { class: "campo" }, ...hijos), control };
}

// Selector con lista de opciones (la primera es el valor vacío).
export function campoSelect({
  nombre,
  etiqueta,
  requerido = false,
  opciones = [],
  vacio = "Seleccione…",
}) {
  const errorId = `${nombre}-error`;
  const control = h(
    "select",
    { id: nombre, name: nombre, class: "control", required: requerido || undefined, "aria-describedby": errorId },
    h("option", { value: "", texto: vacio }),
    ...opciones.map((op) => h("option", { value: String(op.valor), texto: op.texto }))
  );

  return {
    nodo: h(
      "div",
      { class: "campo" },
      h(
        "label",
        { class: "campo__etiqueta", for: nombre },
        etiqueta,
        requerido ? h("span", { class: "requerido", texto: "*", "aria-hidden": "true" }) : null
      ),
      control,
      h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true })
    ),
    control,
  };
}

// Área de texto multilínea con límite de caracteres.
export function campoTextarea({
  nombre,
  etiqueta,
  requerido = false,
  ayuda = null,
  maximo = 500,
}) {
  const errorId = `${nombre}-error`;
  const control = h("textarea", {
    id: nombre,
    name: nombre,
    class: "control",
    maxlength: String(maximo),
    required: requerido || undefined,
    "aria-describedby": errorId,
  });

  const hijos = [
    h(
      "label",
      { class: "campo__etiqueta", for: nombre },
      etiqueta,
      requerido ? h("span", { class: "requerido", texto: "*", "aria-hidden": "true" }) : null
    ),
    control,
  ];
  if (ayuda) hijos.push(h("p", { class: "campo__ayuda", texto: ayuda }));
  hijos.push(h("p", { class: "campo__error", id: errorId, "data-error-para": nombre, hidden: true }));

  return { nodo: h("div", { class: "campo" }, ...hijos), control };
}

// Muestra los mensajes de error debajo de cada campo.
export function mostrarErrores(formulario, errores) {
  let primerCampoInvalido = null;

  for (const [campo, mensaje] of Object.entries(errores)) {
    const control = formulario.querySelector(`[name="${campo}"]`);
    const errorNodo = formulario.querySelector(`[data-error-para="${campo}"]`);

    if (mensaje) {
      if (control) control.setAttribute("aria-invalid", "true");
      if (errorNodo) {
        errorNodo.textContent = mensaje;
        errorNodo.hidden = false;
      }
      if (!primerCampoInvalido) primerCampoInvalido = control;
    } else {
      limpiarErrorCampo(formulario, campo);
    }
  }

  if (primerCampoInvalido) primerCampoInvalido.focus();
}

function limpiarErrorCampo(formulario, campo) {
  const control = formulario.querySelector(`[name="${campo}"]`);
  const errorNodo = formulario.querySelector(`[data-error-para="${campo}"]`);
  if (control) control.removeAttribute("aria-invalid");
  if (errorNodo) {
    errorNodo.textContent = "";
    errorNodo.hidden = true;
  }
}

export function limpiarErrores(formulario) {
  formulario.querySelectorAll("[data-error-para]").forEach((nodo) => {
    nodo.textContent = "";
    nodo.hidden = true;
  });
  formulario.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
    control.removeAttribute("aria-invalid");
  });
}

// Borra el error de un campo mientras el usuario lo corrige.
export function vigilarErrores(formulario) {
  formulario.addEventListener("input", (evento) => {
    const nombre = evento.target.name;
    if (nombre) limpiarErrorCampo(formulario, nombre);
  });
  formulario.addEventListener("change", (evento) => {
    const nombre = evento.target.name;
    if (nombre) limpiarErrorCampo(formulario, nombre);
  });
}

/* ---------------------------------------------------------
   7. Traducción de errores de PostgreSQL / Supabase
   --------------------------------------------------------- */

const MENSAJES_ERROR = {
  "23505": "Ya existe un registro con ese valor.",
  "23503": "No se puede completar la operación: tiene registros relacionados.",
  "23514": "Algún valor está fuera del rango permitido.",
  "23502": "Falta un valor obligatorio.",
  "22001": "El texto supera la longitud máxima permitida.",
  "22P02": "El formato de uno de los datos no es válido.",
  "42501": "No tienes permisos para realizar esta operación.",
};

const TABLAS_ES = {
  distrito: "distritos",
  categoria: "categorías",
  atractivo: "atractivos",
  servicio: "servicios",
  turista: "turistas",
  ruta: "rutas",
  detalle_ruta: "detalles de ruta",
  visita: "visitas",
};

// Intenta extraer "table \"atractivo\"" del detalle del error.
function tablaRelacionada(error) {
  const detalle = `${error.details || ""} ${error.message || ""}`;
  const coincidencia = /table "(\w+)"/i.exec(detalle);
  if (coincidencia) return TABLAS_ES[coincidencia[1]] || coincidencia[1];
  return null;
}

// Nombres de columnas en español, para los mensajes UNIQUE.
const COLUMNAS_ES = {
  id_distrito: "distrito",
  id_categoria: "categoría",
  tipo_servicio: "tipo de servicio",
  id_atractivo: "atractivo",
  id_turista: "turista",
  id_ruta: "ruta",
  id_visita: "visita",
  id_servicio: "servicio",
  id_detalle: "parada",
  nombre: "nombre",
  orden_visita: "orden de visita",
};

// Intenta extraer los campos "(id_distrito, nombre)" del error UNIQUE.
function columnasUnicas(error) {
  const detalle = `${error.details || ""} ${error.message || ""}`;
  const coincidencia = /Key \(([^)]+)\)/i.exec(detalle);
  if (!coincidencia) return null;
  return coincidencia[1]
    .split(",")
    .map((col) => {
      const clave = col.trim();
      return COLUMNAS_ES[clave] || TABLAS_ES[clave] || clave;
    })
    .join(", ");
}

export function traducirError(error) {
  if (!error) return "Ocurrió un error desconocido.";

  const codigo = String(error.code || error.codigo || "");

  if (codigo === "23505") {
    const columnas = columnasUnicas(error);
    return columnas
      ? `Ya existe un registro con ese valor (${columnas}).`
      : MENSAJES_ERROR["23505"];
  }

  if (codigo === "23503") {
    const tabla = tablaRelacionada(error);
    return tabla
      ? `No se puede eliminar: existen registros relacionados en "${tabla}". Elimina o modifica esos registros primero.`
      : MENSAJES_ERROR["23503"];
  }

  if (MENSAJES_ERROR[codigo]) return MENSAJES_ERROR[codigo];

  if (error.message) {
    // Fallos de red o de la API del navegador.
    if (/Failed to fetch|NetworkError|fetch failed/i.test(error.message)) {
      return "No se pudo conectar con Supabase. Verifica tu conexión a internet y las credenciales en js/config.js.";
    }
    return error.message;
  }

  return "Ocurrió un error inesperado.";
}

/* ---------------------------------------------------------
   8. Utilidades de formato
   --------------------------------------------------------- */

export function formatearFecha(iso) {
  if (!iso) return "—";
  const fecha = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return String(iso);
  return fecha.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatearCoordenadas(latitud, longitud) {
  if (latitud === null || latitud === undefined || longitud === null || longitud === undefined) {
    return "Sin coordenadas";
  }
  const lat = Number(latitud);
  const lng = Number(longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Sin coordenadas";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
