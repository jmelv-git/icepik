// Vercel's Supabase integration sets these. Newer projects get a publishable
// key; older ones an anon key. Either works for signing users in.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// The map works without Supabase, so a missing config turns login off
// instead of breaking the site.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
