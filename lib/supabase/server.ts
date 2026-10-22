import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/database.types";
import { supabaseKey, supabaseUrl } from "./config";

/**
 * Supabase client for server code (server actions, route handlers).
 * Same as Supabase's official Next.js example, plus the generated types.
 *
 * Don't put this client in a global variable. Create a new one inside each
 * function that uses it.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, which can't set cookies.
          // Safe to ignore while proxy.ts refreshes user sessions.
        }
      },
    },
  });
}
