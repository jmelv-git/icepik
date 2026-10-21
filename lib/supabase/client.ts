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
