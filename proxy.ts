import type { NextRequest } from "next/server";
import { supabaseUrl } from "@/lib/supabase/config";
import { updateSession } from "@/lib/supabase/proxy";

// Content-Security-Policy: scripts, data and frames may come only from this
// site, the Supabase project, CARTO's tile servers and the CAPTCHA provider. No analytics, ads or other third-party code can load or send data
// anywhere else.
function contentSecurityPolicy(nonce: string) {
  const supabase = supabaseUrl ? new URL(supabaseUrl) : null;
  const supabaseSources = supabase
    ? `${supabase.origin} ${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`
    : "";
  const captcha = "https://challenges.cloudflare.com";
  const isDev = process.env.NODE_ENV === "development";

  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${captcha}${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://*.basemaps.cartocdn.com;
    font-src 'self';
    connect-src 'self' ${supabaseSources} ${captcha};
    frame-src ${captcha};
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  // Next.js reads the nonce from the request's policy and adds it to its own
  // scripts while rendering.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  // The browser default, set explicitly: other sites get only this site's
  // origin, never the page path. Not "no-referrer": a CARTO key restricted
  // to our website is checked against the Referer.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip Next.js assets, images, the map search API and
    // link prefetches.
    {
      source:
        "/((?!_next/static|_next/image|api/|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
