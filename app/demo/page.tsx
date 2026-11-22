import type { Metadata } from "next";
import { IcepikApp } from "../_components/icepik-app";

// The demo: the same app on a separate database with looser rules for
// verifying sightings. Kept out of search results.
export const metadata: Metadata = {
  title: "ICEPik demo",
  robots: { index: false, follow: false },
};

export default function Demo() {
  return <IcepikApp demo />;
}
