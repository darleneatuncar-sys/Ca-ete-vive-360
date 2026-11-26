// =========================================================
// js/modules/dashboard.js
// Pantalla inicial con indicadores calculados desde datos
// reales de Supabase: totales, atractivo más visitado,
// visitas por atractivo, atractivos por distrito y últimas
// visitas registradas.
// =========================================================

import * as api from "../api.js";
import * as ui from "../ui.js";

let raiz = null;
let cuerpo = null;
let destruido = false;

/* ---------- Ciclo de vida ---------- */

export async function init(contenedor) {
  raiz = contenedor;
  destruido = false;
  ui.limpiar(raiz);

  raiz.append(crearHero());

  cuerpo = ui.h("div", { id: "dashboard-cuerpo", "aria-live": "polite" });
  raiz.append(cuerpo);

  configurarBotonActualizar();

  ui.reemplazar(cuerpo, ui.contenedorCargando("Cargando indicadores…"));
  await cargarDatos();
}

// Botón "Actualizar indicadores" de la cabecera.
function configurarBotonActualizar() {
  const boton = document.getElementById("btn-actualizar-dashboard");
  if (!boton) return;

  boton.addEventListener("click", async () => {
    if (destruido) return;
    boton.disabled = true;
    ui.reemplazar(cuerpo, ui.contenedorCargando("Actualizando indicadores…"));
    await cargarDatos();
    if (destruido) return;
    boton.disabled = false;
    ui.toast("Indicadores actualizados desde Supabase.", "exito");
  });
}

export function destroy() {
  destruido = true;
}

/* ---------- Cabecera visual ---------- */

function crearHero() {
  return ui.h(
    "section",
    { class: "hero hero--panorama" },
    ui.h(
      "div",
      { class: "hero__contenido" },
      ui.h(
        "span",
        { class: "badge-mono" },
        ui.icono("hub"),
        ui.h("span", { texto: "SIGTUR · Región Cañete" })
      ),
      ui.h("h2", { class: "hero__titulo", texto: "Panorama provincial" }),
      ui.h("p", {
        class: "hero__texto",
        texto: "Indicadores calculados en tiempo real desde las tablas y vistas del proyecto Cañete Vive 360.",
      }),
      ui.h(
        "div",
        { class: "hero__acciones" },
        ui.h(
          "span",
          { class: "badge-mono" },
          ui.icono("my_location"),
          ui.h("span", { class: "mono", texto: "12°57'S 76°23'O" })
        ),
        ui.h(
          "button",
          { type: "button", class: "boton boton--suave", id: "btn-actualizar-dashboard" },
          ui.icono("refresh"),
          ui.h("span", { texto: "Actualizar indicadores" })
        )
      )
    )
  );
}

/* ---------- Carga de datos ---------- */

async function cargarDatos() {
  if (destruido || !cuerpo) return;

  try {
    const [totales, resumen, atractivos, distritos, recientes] = await Promise.all([
      api.obtenerTotales(),
      api.obtenerResumenAtractivos(),
      api.obtenerAtractivos(),
      api.obtenerDistritos(),
      api.obtenerVisitasRecientes(5),
    ]);

    if (destruido) return;

    ui.limpiar(cuerpo);
    cuerpo.append(
      crearMetricas(totales, distritos.length),
      crearFilaPrincipal(resumen, atractivos),
      crearFilaSecundaria(atractivos, distritos, recientes)
    );

    animarBarras();
  } catch (error) {
    if (destruido) return;
    console.error(error);
    ui.reemplazar(
      cuerpo,
      ui.contenedorError(ui.traducirError(error), () => {
        ui.reemplazar(cuerpo, ui.contenedorCargando("Cargando indicadores…"));
        cargarDatos();
      })
    );
  }
}

/* ---------- Tarjetas de totales ---------- */

function crearMetricas(totales, totalDistritos) {
  const datos = [
    { etiqueta: "Atractivos", valor: totales.atractivos, clase: "" },
    { etiqueta: "Turistas", valor: totales.turistas, clase: "metrica__valor--oliva" },
    { etiqueta: "Visitas", valor: totales.visitas, clase: "metrica__valor--terracota" },
    { etiqueta: "Rutas", valor: totales.rutas, clase: "" },
    { etiqueta: "Servicios", valor: totales.servicios, clase: "metrica__valor--oliva" },
    { etiqueta: "Distritos", valor: totalDistritos, clase: "" },
  ];

  return ui.h(
    "div",
    { class: "rejilla-metricas" },
    ...datos.map((d) =>
      ui.h(
        "div",
        { class: "metrica" },
        ui.h("span", { class: "metrica__etiqueta", texto: d.etiqueta }),
        ui.h(
          "span",
          { class: `metrica__valor ${d.clase}`.trim(), texto: String(d.valor).padStart(2, "0") }
        )
      )
    )
  );
}

/* ---------- Fila principal: destacado + visitas por atractivo ---------- */

function crearFilaPrincipal(resumen, atractivos) {
  return ui.h(
    "div",
    { class: "rejilla--2" },
    crearDestacado(resumen, atractivos),
    crearPanelVisitas(resumen)
  );
}

// Panel oscuro con el atractivo más visitado (v_atractivo_resumen).
function crearDestacado(resumen, atractivos) {
  const primero = resumen[0];
  const panel = ui.h("div", { class: "destacado" });

  panel.append(
    ui.h("span", { class: "destacado__etiqueta", texto: "Atractivo más visitado" })
  );

  if (!primero || Number(primero.total_visitas) === 0) {
    panel.append(
      ui.h("p", {
        class: "destacado__valor",
        texto: "Sin visitas registradas",
      }),
      ui.h("p", {
        class: "destacado__meta",
        texto: "Registra visitas en el módulo Visitas para ver el ranking.",
      })
    );
    return panel;
  }

  const ficha = atractivos.find((a) => a.id_atractivo === primero.id_atractivo);

  panel.append(
    ui.h("p", { class: "destacado__valor", texto: primero.atractivo }),
    ui.h(
      "div",
      { class: "destacado__meta" },
      ui.h("span", { texto: `${primero.distrito || "—"}` }),
      ui.h("span", { texto: `${primero.categoria || "—"}` }),
      ui.h("span", {
        texto: `${Number(primero.total_visitas)} visita(s)`,
      })
    )
  );

  if (ficha) {
    panel.append(
      ui.h(
        "div",
        { class: "destacado__meta" },
        ui.h("span", {
          class: "mono",
          texto: ui.formatearCoordenadas(ficha.latitud, ficha.longitud),
        })
      )
    );
  }

  return panel;
}

// Gráfico de barras horizontales: visitas por atractivo.
function crearPanelVisitas(resumen) {
  const conVisitas = resumen.filter((r) => Number(r.total_visitas) > 0);

  const cuerpo = conVisitas.length
    ? crearBarras(
        conVisitas.slice(0, 8).map((r) => ({
          etiqueta: r.atractivo,
          valor: Number(r.total_visitas),
        }))
      )
    : ui.h("p", {
        class: "texto-tenue",
        texto: "Todavía no hay visitas registradas en la base.",
      });

  return crearPanel({
    titulo: "Visitas por atractivo",
    subtitulo: "Vista v_atractivo_resumen · ordenado por total de visitas",
    etiqueta: "Gráfico de barras",
    cuerpo,
  });
}

/* ---------- Fila secundaria: distritos + últimos registros ---------- */

function crearFilaSecundaria(atractivos, distritos, recientes) {
  return ui.h(
    "div",
    { class: "rejilla--2" },
    crearPanelDistritos(atractivos, distritos),
    crearPanelRecientes(recientes)
  );
}

// Atractivos agrupados por distrito.
function crearPanelDistritos(atractivos, distritos) {
  const nombres = new Map(distritos.map((d) => [d.id_distrito, d.nombre]));
  const conteo = new Map();

  for (const a of atractivos) {
    const clave = a.id_distrito;
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  }

  const datos = [...conteo.entries()]
    .map(([id, valor]) => ({
      etiqueta: nombres.get(id) || `Distrito ${id}`,
      valor,
    }))
    .sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta));

  const cuerpo = datos.length
    ? crearBarras(datos)
    : ui.h("p", {
        class: "texto-tenue",
        texto: "No hay atractivos registrados por distrito.",
      });

  return crearPanel({
    titulo: "Atractivos por distrito",
    subtitulo: `${atractivos.length} atractivo(s) repartidos en ${datos.length} distrito(s)`,
    etiqueta: "Inventario",
    cuerpo,
  });
}

// Últimas visitas con nombres (turista + atractivo + fecha).
function crearPanelRecientes(recientes) {
  let contenido;

  if (!recientes.length) {
    contenido = ui.h("p", {
      class: "texto-tenue",
      texto: "Aún no se han registrado visitas.",
    });
  } else {
    const lista = ui.h("div", { class: "lista-datos" });
    for (const visita of recientes) {
      const turista = visita.turista
        ? `${visita.turista.nombres} ${visita.turista.apellidos}`
        : "Turista sin nombre";
      const atractivo = visita.atractivo?.nombre || "Atractivo";

      lista.append(
        ui.h(
          "div",
          { class: "dato-fila" },
          ui.h(
            "div",
            { class: "dato-fila__izquierda" },
            ui.h(
              "span",
              { class: "dato-fila__indice", "aria-hidden": "true" },
              ui.icono("travel_explore")
            ),
            ui.h(
              "div",
              { class: "dato-fila__texto" },
              ui.h("p", { class: "dato-fila__titulo", texto: turista }),
              ui.h("p", { class: "dato-fila__subtitulo", texto: atractivo })
            )
          ),
          ui.h("span", {
            class: "dato-fila__valor",
            texto: ui.formatearFecha(visita.fecha_visita),
          })
        )
      );
    }
    contenido = lista;
  }

  return crearPanel({
    titulo: "Últimos registros",
    subtitulo: "Visitas validadas en la base de datos",
    etiqueta: "Tiempo real",
    cuerpo: contenido,
  });
}

/* ---------- Auxiliares de presentación ---------- */

function crearPanel({ titulo, subtitulo, etiqueta, cuerpo }) {
  return ui.h(
    "section",
    { class: "panel" },
    ui.h(
      "div",
      { class: "panel__cabecera" },
      ui.h(
        "div",
        {},
        ui.h("h3", { class: "panel__titulo", texto: titulo }),
        ui.h("p", { class: "panel__subtitulo", texto: subtitulo })
      ),
      ui.h("span", { class: "panel__etiqueta", texto: etiqueta })
    ),
    cuerpo
  );
}

// Barras horizontales con la de mayor valor resaltada en terracota.
function crearBarras(datos) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1);
  const contenedor = ui.h("div", { class: "barras" });

  for (const dato of datos) {
    const destacado = dato.valor === maximo && maximo > 0;
    const relleno = ui.h("div", { class: "barra-dato__relleno", style: "width: 0%" });

    relleno.dataset.ancho = String(Math.max(4, Math.round((dato.valor / maximo) * 100)));

    contenedor.append(
      ui.h(
        "div",
        { class: `barra-dato${destacado ? " barra-dato--destacado" : ""}` },
        ui.h("span", {
          class: "barra-dato__etiqueta",
          texto: dato.etiqueta,
          title: dato.etiqueta,
        }),
        ui.h("div", { class: "barra-dato__pista" }, relleno),
        ui.h("span", { class: "barra-dato__valor", texto: String(dato.valor) })
      )
    );
  }

  return contenedor;
}

// Anima el ancho de las barras después de insertarlas en el DOM.
function animarBarras() {
  const rellenos = document.querySelectorAll(".barra-dato__relleno[data-ancho]");
  const aplicar = () => {
    rellenos.forEach((relleno) => {
      relleno.style.width = `${relleno.dataset.ancho}%`;
    });
  };

  const raf = window.requestAnimationFrame;
  if (typeof raf === "function") {
    raf(() => raf(aplicar));
  } else {
    aplicar();
  }
}
