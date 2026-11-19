// Where ICEPik takes reports: the places U.S. immigration law calls the
// "United States" (8 U.S.C. 1101(a)(38)), which is where ICE enforces it. That
// is the 50 states, DC, Puerto Rico, the U.S. Virgin Islands, Guam and the
// Northern Mariana Islands. Not American Samoa or Swains Island (they run
// their own immigration system; see INCLUDE_AMERICAN_SAMOA in
// lib/service-area-shape.ts), the uninhabited minor outlying islands, the base
// at Guantanamo Bay, or any other country. No state is left out: none can keep
// ICE out (README, section 6).
//
// service-area.json is OpenStreetMap's outline of the United States (relation
// 148838, which reaches 12 nautical miles out to sea, so coasts, piers and
// ferries are inside), less the minor outlying islands, simplified so no
// border moves by more than 25 m. TopoJSON, about 290 KB (about 95 KB
// gzipped). Data © OpenStreetMap contributors, ODbL. How to rebuild it:
// README, section 6.
//
// The browser loads this module with import() once the map has started, so
// the outline isn't part of the page's first download; the map uses it to stay
// on these places (sightings-map.tsx), and pins to check their spot. The
// search API and the server action that posts a sighting import it directly.

import outline from "./service-area.json";
import { makeArea, type Area } from "./service-area-shape";

let area: Area | null = null;

/** Whether a point is in a place where ICE works (see the top of this file). */
export function inServiceArea(point: { lat: number; lng: number }): boolean {
  area ??= makeArea(outline);
  return area.contains(point);
}

/** Whether the outline of those places has a corner in the box (a coast, border or island). */
export function serviceAreaCornerIn(box: { south: number; west: number; north: number; east: number }): boolean {
  area ??= makeArea(outline);
  return area.hasCornerIn(box);
}
