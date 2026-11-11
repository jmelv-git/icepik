import { useSyncExternalStore } from "react";

// Which layout the stylesheet is showing. globals.css sets --layout on the
// root element inside the media queries that lay the page out, so the
// breakpoints are written once, there. Desktop is anything it doesn't name.
export type Layout = "phone" | "tablet" | "desktop";

export function readLayout(): Layout {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--layout").trim();
  return value === "phone" || value === "tablet" ? value : "desktop";
}

function subscribe(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

// Only for components that mount in the browser (everything under MapApp).
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, readLayout, () => "desktop");
}
