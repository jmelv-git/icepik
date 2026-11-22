import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { demoSupabaseUrl, supabaseUrl } from "./config";

/**
 * Supabase clients with a SECRET key. They skip every database rule, so they
 * are used in exactly one place: the password reset in app/actions/recovery.ts.
 * Never import this file anywhere else, and never give a secret key a
 * NEXT_PUBLIC_ name.
 */

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * The real project. SUPABASE_SECRET_KEY is set in Vercel's Production
 * environment only, marked Sensitive. Preview deployments don't get it, so
 * there this returns null and the reset says it isn't available.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) return null;
  return createClient<Database>(supabaseUrl, secretKey, options);
}

/**
 * The demo project at /demo, for its demo-only reset. It is built only from
 * the demo's URL and DEMO_SUPABASE_SECRET_KEY, so it can never reach the real
 * project. As a second guard it returns null when the demo's URL points at
 * the real project's host. DEMO_SUPABASE_SECRET_KEY is server-only, like
 * SUPABASE_SECRET_KEY.
 */
export function createDemoAdminClient() {
  const secretKey = process.env.DEMO_SUPABASE_SECRET_KEY;
  if (!demoSupabaseUrl || !secretKey) return null;
  if (supabaseUrl && new URL(demoSupabaseUrl).host === new URL(supabaseUrl).host) return null;
  return createClient<Database>(demoSupabaseUrl, secretKey, options);
}
