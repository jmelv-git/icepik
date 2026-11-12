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

// The project for the real map (demo false) or the demo (demo true).
export function projectFor(demo: boolean) {
  return demo
    ? { url: demoSupabaseUrl, key: demoSupabaseKey, configured: isDemoConfigured }
    : { url: supabaseUrl, key: supabaseKey, configured: isSupabaseConfigured };
}
