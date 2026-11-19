import type { NextConfig } from "next";

// The CARTO key is built into the page, so a production build without it would
// ship a map that reads "API KEY REQUIRED". Stop the build instead; Vercel then
// keeps the current deployment live.
if (process.env.VERCEL_ENV === "production" && !process.env.NEXT_PUBLIC_CARTO_KEY?.trim()) {
  throw new Error(
    "NEXT_PUBLIC_CARTO_KEY is missing. Add it in Vercel (Settings > Environment Variables), then redeploy.",
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
