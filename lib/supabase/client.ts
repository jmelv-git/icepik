import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/database.types";
import { projectFor, sessionCookieName } from "./config";

// Supabase client for Client Components. Call only when the project is
// configured (projectFor(demo).configured). The browser only reads: posting,
// voting and deleting go through the server actions in app/actions/sightings.ts.
// demo: the demo project at /demo. Its session has its own cookie.
// @supabase/ssr keeps one browser client per page and returns it whatever
// project is asked for next, so a client for the other project (to sign it out
// too) must pass shared = false.
export function createClient(demo = false, shared = true) {
  const { url, key, cookieName } = projectFor(demo);
  return createBrowserClient<Database>(url!, key!, {
    isSingleton: shared,
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
  });
}

export type Client = ReturnType<typeof createClient>;

// Deletes this device's session cookies directly. signOut() returns an error
// and keeps the session when it can't load it, for example when the access
// token has expired and can't be refreshed offline.
export function forgetSession(demo = false) {
  // The browser client keeps the session in a cookie with this name, split
  // into ".0", ".1"… chunks when it's long.
  const name = sessionCookieName(demo);
  for (const cookie of document.cookie.split("; ")) {
    const key = cookie.split("=")[0];
    if (key === name || key.startsWith(`${name}.`) || key === `${name}-code-verifier`) {
      document.cookie = `${key}=; Max-Age=0; path=/`;
    }
  }
}
