import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para uso en el SERVIDOR (API Routes, Server Components).
 * Usa el service_role key para bypass de RLS. Singleton para proteger RAM.
 */
let serverClient = null;

export function createAdminClient() {
  if (serverClient) return serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[LukeDelivery] Supabase server env vars missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  serverClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverClient;
}
