import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { connection } from "next/server";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

// The title never includes a street name: it shows in tabs and history.
export const metadata: Metadata = {
  title: "ICEPik",
  description: "Report and verify ICE sightings in real time.",
};

// "cover" lets the page reach under a phone's notch and home indicator, and
// makes env(safe-area-inset-*) report their sizes: globals.css pads the tab
// bar and the edges with them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Render every page per request, so Next.js can add proxy.ts's fresh
  // Content-Security-Policy nonce to its scripts.
  await connection();

  return (
    <html lang="en" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
