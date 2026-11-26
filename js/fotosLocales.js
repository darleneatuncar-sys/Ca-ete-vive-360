// Fotos solo visuales: se almacenan localmente en este navegador y nunca
// se envían a Supabase ni se guardan en las tablas de la base de datos.

const PREFIJO = "canete-vive:fotos:";
const MAXIMO_BYTES = 1.5 * 1024 * 1024;

function clave(tipo, id) {
  return `${PREFIJO}${tipo}:${id}`;
}

export function obtenerFotoLocal(tipo, id) {
  try {
    return localStorage.getItem(clave(tipo, id));
  } catch {
    return null;
  }
}

export function validarFotoLocal(archivo) {
  if (!archivo) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
    return "Selecciona una imagen JPG, PNG o WebP.";
  }
  if (archivo.size > MAXIMO_BYTES) {
    return "Para guardarla solo en este navegador, la foto no puede superar 1.5 MB.";
  }
  return null;
}

export function guardarFotoLocal(tipo, id, archivo) {
  if (!archivo) return Promise.resolve();
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        localStorage.setItem(clave(tipo, id), String(lector.result));
        resolver();
      } catch {
        rechazar(new Error("No hubo espacio local para guardar la foto."));
      }
    };
    lector.onerror = () => rechazar(new Error("No se pudo leer la foto seleccionada."));
    lector.readAsDataURL(archivo);
  });
}
