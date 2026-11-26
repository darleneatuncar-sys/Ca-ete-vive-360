// =========================================================
// js/supabaseClient.js
// Crea una única instancia del cliente de Supabase usando
// la librería cargada por CDN en index.html (window.supabase).
// =========================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error(
    "No se cargó la librería de Supabase desde el CDN. Revisa tu conexión a internet."
  );
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Faltan las credenciales en js/config.js.");
}

// Cliente compartido por todos los módulos.
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
