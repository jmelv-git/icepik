import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { supabaseUrl } from "./config";

/**
 * Supabase client with the SECRET key. It skips every database rule, so it is
 * used in exactly one place: the password reset in app/actions/recovery.ts.
 * Never import it anywhere else, and never give the key a NEXT_PUBLIC_ name.
 *
 * SUPABASE_SECRET_KEY is set in Vercel's Production environment only, marked
 * Sensitive. Preview deployments don't get it, so there this returns null and
 * the reset says it isn't available.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) return null;
  return createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
