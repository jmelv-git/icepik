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
  /* config options here */
};

export default nextConfig;
