import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./config";

// Supabase client for Client Components. Call only when isSupabaseConfigured.
export function createClient() {
  return createBrowserClient(supabaseUrl!, supabaseKey!);
}
