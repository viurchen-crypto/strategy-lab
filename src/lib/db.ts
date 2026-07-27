import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase handle. Both tables have RLS enabled with no policies,
 * so the service role is the only way in and the key must never reach the client.
 *
 * Persistence is optional by design: without credentials the app degrades to an
 * in-process cache and simply stops recording run history.
 */
let cached: SupabaseClient | null | undefined;

export function getDatabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return cached;
}

export const isDatabaseConfigured = () => getDatabase() !== null;
