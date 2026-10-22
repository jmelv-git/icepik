import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/database.types";
import { supabaseKey, supabaseUrl } from "./config";

// Supabase client for Client Components. Call only when isSupabaseConfigured.
// The browser only reads: posting, voting and deleting go through the server
// actions in app/actions/sightings.ts.
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl!, supabaseKey!);
}

export type Client = ReturnType<typeof createClient>;

// Deletes this device's session cookies directly. signOut() returns an error
// and keeps the session when it can't load it, for example when the access
// token has expired and can't be refreshed offline.
export function forgetSession() {
  // supabase-js's default storage key. The browser client keeps the session
  // in a cookie with this name, split into ".0", ".1"… chunks when it's long.
  const name = `sb-${new URL(supabaseUrl!).hostname.split(".")[0]}-auth-token`;
  for (const cookie of document.cookie.split("; ")) {
    const key = cookie.split("=")[0];
    if (key === name || key.startsWith(`${name}.`) || key === `${name}-code-verifier`) {
      document.cookie = `${key}=; Max-Age=0; path=/`;
    }
  }
}
