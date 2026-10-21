import type { ActionResult } from "@/app/actions/sightings";

// Server actions return their errors as values. They throw only when the
// request itself fails: most often Vercel's firewall rate limit, or no
// connection.
export async function runAction<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return {
      ok: false,
      message: navigator.onLine
        ? "Too many tries. Wait a minute."
        : "You're offline. Check your connection and try again.",
    };
  }
}
