// Where ICEPik takes reports: the places U.S. immigration law calls the
// "United States" (8 U.S.C. 1101(a)(38)), which is where ICE enforces it. That
// is the 50 states, DC, Puerto Rico, the U.S. Virgin Islands, Guam and the
// Northern Mariana Islands. Not American Samoa or Swains Island (they run
// their own immigration system), the uninhabited minor outlying islands, the
// base at Guantanamo Bay, or any other country. No state is left out: none can
// keep ICE out (README, "Where pins can go").
//
// service-area.json is OpenStreetMap's outline of the United States (relation
// 148838, which reaches 12 nautical miles out to sea, so coasts, piers and
// ferries are inside), less the minor outlying islands, simplified so no
// border moves by more than 25 m. TopoJSON, about 290 KB (about 95 KB
// gzipped), with two objects: `area` (allowed) and `american_samoa` (off; see
// INCLUDE_AMERICAN_SAMOA). Data © OpenStreetMap contributors, ODbL. How to
// rebuild it: README.
//
// The browser loads this module with import() the first time a pin is placed,
// so the outline isn't part of the page's first download. The server action
// that posts a sighting imports it directly.

import outline from "./service-area.json";

// American Samoa runs its own immigration system and ICE has no office there,
// but its Attorney General warned in 2026 that federal control may come. If
// ICE starts working there, set this to true.
const INCLUDE_AMERICAN_SAMOA = false;

type LatLng = { lat: number; lng: number };
type Ring = { points: number[]; west: number; south: number; east: number; north: number };

let rings: Ring[] | null = null;

// Decodes the TopoJSON arcs (quantized, delta-encoded) into rings of
// [lng, lat, lng, lat, ...], each with its bounding box.
function decode(): Ring[] {
  const { scale, translate } = outline.transform;
  const arcs = outline.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    const out: number[] = [];
    for (const [dx, dy] of arc) {
      x += dx;
      y += dy;
      out.push(x * scale[0] + translate[0], y * scale[1] + translate[1]);
    }
    return out;
  });
  const result: Ring[] = [];
  const objects = [outline.objects.area];
  if (INCLUDE_AMERICAN_SAMOA) objects.push(outline.objects.american_samoa);
  for (const geometry of objects.flatMap((object) => object.geometries)) {
    const polygons = geometry.type === "MultiPolygon" ? geometry.arcs : [geometry.arcs];
    for (const polygon of polygons as number[][][]) {
      for (const arcIds of polygon) {
        const points: number[] = [];
        arcIds.forEach((id, k) => {
          const arc = id < 0 ? reversed(arcs[~id]) : arcs[id];
          // Consecutive arcs share their joining point.
          points.push(...(k ? arc.slice(2) : arc));
        });
        result.push(withBounds(points));
      }
    }
  }
  return result;
}

function reversed(arc: number[]) {
  const out: number[] = [];
  for (let i = arc.length - 2; i >= 0; i -= 2) out.push(arc[i], arc[i + 1]);
  return out;
}

function withBounds(points: number[]): Ring {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    west = Math.min(west, points[i]);
    east = Math.max(east, points[i]);
    south = Math.min(south, points[i + 1]);
    north = Math.max(north, points[i + 1]);
  }
  return { points, west, south, east, north };
}

/** Whether a point is in a place where ICE works (see the top of this file). */
export function inServiceArea(point: LatLng): boolean {
  const x = point.lng;
  const y = point.lat;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  rings ??= decode();
  // Even-odd ray casting over every ring, so holes work too.
  let inside = false;
  for (const ring of rings) {
    if (y < ring.south || y > ring.north || x < ring.west || x > ring.east) continue;
    const p = ring.points;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i];
      const yi = p[i + 1];
      const xj = p[j];
      const yj = p[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
