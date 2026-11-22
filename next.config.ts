import type { NextConfig } from "next";

// The CARTO key is built into the page, so a production build without it would
// ship a map that reads "API KEY REQUIRED". Stop the build instead; Vercel then
// keeps the current deployment live.
if (process.env.VERCEL_ENV === "production" && !process.env.NEXT_PUBLIC_CARTO_KEY?.trim()) {
  throw new Error(
    "NEXT_PUBLIC_CARTO_KEY is missing. Add it in Vercel (Settings > Environment Variables), then redeploy.",
  );
}

// CAPTCHA is required in Supabase. ICEPik's Turnstile site key is built into
// app/_components/captcha.tsx, and NEXT_PUBLIC_TURNSTILE_SITE_KEY set to an
// empty value turns the check off (for local checks). In production that
// would make every sign-in fail, so stop the build instead.
if (
  process.env.VERCEL_ENV === "production" &&
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined &&
  !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim()
) {
  throw new Error(
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY is set to an empty value, which turns the CAPTCHA check off. Delete it in Vercel (Settings > Environment Variables) to use the built-in key, then redeploy.",
  );
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // MapLibre's worker, which loads the vector map's tiles, is a static
        // file, so the page's Content-Security-Policy (proxy.ts) doesn't
        // reach it. Give it its own: it may only contact CARTO's vector map
        // hosts.
        source: "/_next/static/media/:file(maplibre-gl-worker\\..*\\.mjs)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; connect-src https://basemaps.cartocdn.com https://tiles.basemaps.cartocdn.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
