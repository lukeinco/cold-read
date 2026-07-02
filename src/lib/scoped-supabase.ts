import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Returns a Supabase client that attaches the caller's session token to every
 * request (via the `x-session-token` header). Server-side RLS policies read
 * this header through `public.current_session_token()` and only allow writes
 * that match `sessions.client_token`.
 */
export function createScopedSupabase(sessionToken: string): SupabaseClient<Database> {
  const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL || (globalThis as any).process?.env?.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (globalThis as any).process?.env?.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { "x-session-token": sessionToken } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}
