// Vercel's Supabase integration sets these. Newer projects get a publishable
// key; older ones an anon key. Either works for signing users in.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// The map works without Supabase, so a missing config turns login off
// instead of breaking the site.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// The demo at /demo uses a second Supabase project, with its own sample
// sightings and looser rules (database/icepik_demo_changes.sql). Without
// these, /demo shows the app as "not connected".
export const demoSupabaseUrl = process.env.NEXT_PUBLIC_DEMO_SUPABASE_URL;
export const demoSupabaseKey =
  process.env.NEXT_PUBLIC_DEMO_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_DEMO_SUPABASE_ANON_KEY;
export const isDemoConfigured = Boolean(demoSupabaseUrl && demoSupabaseKey);

// The demo's session cookie has a name of its own, so it can never be read as
// the real map's session, even when both projects' hostnames start alike
// (two local stand-ins on 127.0.0.1, or custom domains). The real map keeps
// supabase-js's default name, sb-<project ref>-auth-token: renaming it would
// sign everyone out, and an unsaved account can't be recovered.
const DEMO_COOKIE_NAME = "sb-icepik-demo-auth-token";

// The project for the real map (demo false) or the demo (demo true).
// cookieName: undefined means supabase-js's default.
export function projectFor(demo: boolean) {
  return demo
    ? { url: demoSupabaseUrl, key: demoSupabaseKey, configured: isDemoConfigured, cookieName: DEMO_COOKIE_NAME }
    : { url: supabaseUrl, key: supabaseKey, configured: isSupabaseConfigured, cookieName: undefined };
}

// The name of the session cookie for that project.
export function sessionCookieName(demo: boolean) {
  const { url, cookieName } = projectFor(demo);
  return cookieName ?? `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
}
