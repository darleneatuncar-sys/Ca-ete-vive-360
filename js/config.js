// =========================================================
// js/config.js
// Único archivo con las credenciales del proyecto Supabase.
//   Supabase > Project Settings > API
// Usa SOLO la URL del proyecto y la clave ANON / publishable.
// NUNCA coloques aquí la service_role: esa clave no debe
// viajar nunca al navegador.
// =========================================================

export const SUPABASE_URL = "https://fibxgptsxhtrdoqxvbsx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_PL3rb4-A9L3KYtVuCPvKIA_z-tqJlpm";

// Indica si los placeholders siguen sin reemplazar (para avisar en pantalla).
export const configurada =
  !SUPABASE_URL.includes("TU-PROYECTO") &&
  !SUPABASE_ANON_KEY.startsWith("TU_");
