import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para uso en el BROWSER (componentes cliente).
 * Usa la anon key pública. Singleton para evitar múltiples instancias.
 */
let browserClient = null;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false, // Sin sesiones de auth, es una mini-app pública vía WhatsApp
      },
    }
  );

  return browserClient;
}
