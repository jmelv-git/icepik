"use client";

import { createContext, use } from "react";

// true inside the demo at /demo: a separate database with sample sightings,
// where anyone can confirm or dispute from anywhere and one confirmation is
// enough to verify a sighting (database/icepik_demo_changes.sql).
export const DemoContext = createContext(false);

export function useDemo() {
  return use(DemoContext);
}

// What the demo says about itself, wherever it explains the looser rules.
export const DEMO_ABOUT =
  "This is the ICEPik demo. Its reports are samples, kept apart from the real map. Here you can confirm or dispute a sighting from anywhere, and one confirmation marks it Verified.";
