// =========================================================
// js/app.js
// Arranque de la aplicación y navegación entre módulos
// SIN recargar la página (carga diferida de módulos ES).
// =========================================================

import { configurada } from "./config.js";
import * as ui from "./ui.js";

// Registro de módulos: cada uno exporta init(contenedor)
// y opcionalmente destroy().
const MODULOS = {
  dashboard: {
    titulo: "Dashboard",
    cargar: () => import("./modules/dashboard.js"),
  },
  atractivos: {
    titulo: "Atractivos",
    cargar: () => import("./modules/atractivos.js"),
  },
  rutas: {
    titulo: "Rutas",
    cargar: () => import("./modules/rutas.js"),
  },
  visitas: {
    titulo: "Visitas",
    cargar: () => import("./modules/visitas.js"),
  },
  turistas: {
    titulo: "Turistas",
    cargar: () => import("./modules/turistas.js"),
  },
  servicios: {
    titulo: "Servicios",
    cargar: () => import("./modules/servicios.js"),
  },
  catalogos: {
    titulo: "Catálogos",
    cargar: () => import("./modules/catalogos.js"),
  },
};

const RUTA_INICIAL = "dashboard";

let moduloActual = null;
let nombreModuloActual = null;
let navegacionPendiente = 0; // evita carreras entre cargas

/* ---------- Utilidades de navegación ---------- */

function leerRuta() {
  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  if (!hash) return RUTA_INICIAL;
  return MODULOS[hash] ? hash : RUTA_INICIAL;
}

function resaltarEnlace(ruta) {
  document
    .querySelectorAll(".nav__enlace, .barra-inferior__enlace")
    .forEach((enlace) => {
      if (enlace.dataset.ruta === ruta) {
        enlace.setAttribute("aria-current", "page");
      } else {
        enlace.removeAttribute("aria-current");
      }
    });
}

function cerrarMenuMovil() {
  document.body.classList.remove("menu-abierto");
  const boton = document.getElementById("btn-menu");
  if (boton) boton.setAttribute("aria-expanded", "false");
}

function abrirMenuMovil() {
  document.body.classList.add("menu-abierto");
  const boton = document.getElementById("btn-menu");
  if (boton) {
    boton.setAttribute("aria-expanded", "true");
    document.getElementById("sidebar")?.querySelector(".nav__enlace")?.focus();
  }
}

/* ---------- Carga de módulos ---------- */

async function navegar() {
  const ruta = leerRuta();
  const configuracion = MODULOS[ruta];
  const miNavegacion = ++navegacionPendiente;

  // Destruir el módulo anterior (limpia temporizadores y listeners).
  if (moduloActual && typeof moduloActual.destroy === "function") {
    try {
      moduloActual.destroy();
    } catch (error) {
      console.warn("No se pudo destruir el módulo anterior:", error);
    }
  }
  moduloActual = null;
  ui.cerrarTodosLosModales();

  resaltarEnlace(ruta);
  cerrarMenuMovil();

  // Cada módulo empieza en la parte superior de la página.
  try {
    window.scrollTo({ top: 0 });
  } catch {
    /* entornos sin soporte de desplazamiento */
  }

  const titulo = configuracion.titulo;
  document.getElementById("titulo-modulo").textContent = titulo;
  document.getElementById("ruta-actual").textContent = `#/${ruta}`;
  document.title = `${titulo} · CAÑETE VIVE 360`;

  const contenedor = document.getElementById("contenido");
  ui.reemplazar(contenedor, ui.contenedorCargando(`Cargando ${titulo.toLowerCase()}…`));

  try {
    const modulo = await configuracion.cargar();
    // Si el usuario ya navegó otra vez, descartamos esta carga.
    if (miNavegacion !== navegacionPendiente) return;

    ui.limpiar(contenedor);
    await modulo.init(contenedor);
    if (miNavegacion !== navegacionPendiente) return;

    moduloActual = modulo;
    nombreModuloActual = ruta;
    // El botón de filtros solo se muestra si el módulo tiene buscador.
    const botonFiltros = document.getElementById("btn-filtros");
    if (botonFiltros) botonFiltros.hidden = !document.getElementById("filtro-busqueda");
    // Devuelve el foco al inicio del contenido para lectores de pantalla.
    contenedor.focus({ preventScroll: true });
  } catch (error) {
    if (miNavegacion !== navegacionPendiente) return;
    console.error(error);
    // Si falló la carga de la librería por CDN, mostramos ese detalle.
    const falloLibreria = /librería de Supabase|CDN/i.test(error.message || "");
    const mensaje = falloLibreria
      ? error.message
      : configurada
        ? ui.traducirError(error)
        : "No se pudo iniciar el módulo. Revisa que los placeholders de js/config.js hayan sido reemplazados con tus credenciales de Supabase.";
    ui.reemplazar(contenedor, ui.contenedorError(mensaje, () => navegar()));
  }
}

/* ---------- Menú lateral (móvil) ---------- */

function configurarMenuMovil() {
  const boton = document.getElementById("btn-menu");
  const botonInferior = document.getElementById("btn-menu-inferior");
  const botonCerrar = document.getElementById("btn-cerrar-menu");
  const botonFiltros = document.getElementById("btn-filtros");
  const overlay = document.getElementById("overlay");

  boton?.addEventListener("click", () => {
    const abierto = document.body.classList.toggle("menu-abierto");
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto ? "Cerrar menú de navegación" : "Abrir menú de navegación");
  });

  botonInferior?.addEventListener("click", abrirMenuMovil);
  botonCerrar?.addEventListener("click", () => {
    cerrarMenuMovil();
    document.getElementById("btn-menu")?.focus();
  });

  // Atajo: lleva el foco al buscador del módulo actual.
  botonFiltros?.addEventListener("click", () => {
    const buscador = document.getElementById("filtro-busqueda");
    if (buscador) {
      buscador.focus();
      buscador.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      document.getElementById("contenido")?.scrollIntoView({ behavior: "smooth" });
    }
  });

  overlay?.addEventListener("click", cerrarMenuMovil);

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && document.body.classList.contains("menu-abierto")) {
      cerrarMenuMovil();
      boton?.focus();
    }
  });
}

/* ---------- Estado de la conexión y datos del panel ---------- */

// Consulta ligera para mostrar el estado real de Supabase en la barra.
async function verificarConexion() {
  const pista = document.getElementById("estado-conexion");
  if (!pista) return;

  try {
    const { obtenerDistritos } = await import("./api.js");
    const distritos = await obtenerDistritos();
    pista.classList.add("conexion--ok");
    const texto = pista.querySelector(".conexion__texto");
    if (texto) texto.textContent = "Supabase sincronizado";

    const ficha = document.getElementById("ficha-distritos");
    if (ficha) ficha.textContent = `${distritos.length} distritos registrados`;
  } catch (error) {
    console.error("Sin conexión con Supabase:", error);
    pista.classList.add("conexion--error");
    const texto = pista.querySelector(".conexion__texto");
    if (texto) texto.textContent = "Sin conexión";
    const ficha = document.getElementById("ficha-distritos");
    if (ficha) ficha.textContent = "Supabase no responde";
  }
}

// Si la fuente de iconos no carga, ocultamos los iconos (evita texto suelto).
function comprobarFuenteIconos() {
  if (!document.fonts || !document.fonts.ready) return;
  document.fonts.ready.then(() => {
    const disponible = document.fonts.check('24px "Material Symbols Outlined"');
    if (!disponible) document.body.classList.add("iconos-no-disponibles");
  });
}

/* ---------- Arranque ---------- */

function iniciar() {
  // Aviso de credenciales pendientes (no bloquea la aplicación).
  if (!configurada) {
    const aviso = document.getElementById("aviso-config");
    if (aviso) aviso.hidden = false;
  }

  configurarMenuMovil();
  comprobarFuenteIconos();

  window.addEventListener("hashchange", navegar);

  // Primera carga (si no hay hash, mostramos el dashboard).
  if (!window.location.hash) {
    window.history.replaceState(null, "", `#/${RUTA_INICIAL}`);
  }
  navegar();
  verificarConexion();
}

iniciar();
