import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { projectFor } from "./config";

// Refreshes the signed-in user's session before the page renders, so server
// actions see valid auth cookies. The anonymous session is the user's account,
// so keeping its cookie fresh keeps their account. On /demo it's the demo
// project's session.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const demo = request.nextUrl.pathname === "/demo" || request.nextUrl.pathname.startsWith("/demo/");
  const { url, key, configured } = projectFor(demo);
  if (!configured) return response;

  const supabase = createServerClient(url!, key!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Stops CDNs from caching one user's session for another.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Don't put code between createServerClient and getClaims: getClaims is
  // what refreshes an expired session.
  await supabase.auth.getClaims();

  return response;
}
