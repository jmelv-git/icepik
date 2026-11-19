// Reading the outline of the places ICEPik covers (lib/service-area.json:
// OpenStreetMap's outline of the United States in TopoJSON, with two objects,
// `area` (the 50 states, DC, Puerto Rico, the U.S. Virgin Islands, Guam and
// the Northern Mariana Islands) and `american_samoa` (off; see
// INCLUDE_AMERICAN_SAMOA). README, section 6. No imports, so the search API
// can use the settings below without loading the outline.

// American Samoa runs its own immigration system and ICE has no office there,
// but its Attorney General warned in 2026 that federal control may come. If
// ICE starts working there, set this to true.
export const INCLUDE_AMERICAN_SAMOA = false;

// The same places, as the address search's country codes (OpenStreetMap
// files the territories under their own codes).
export const SEARCH_COUNTRY_CODES = ["us", "pr", "vi", "gu", "mp", ...(INCLUDE_AMERICAN_SAMOA ? ["as"] : [])];

type LatLng = { lat: number; lng: number };
type TopoObject = { geometries: { type: string; arcs: number[][][] | number[][][][] }[] };
type Topology = {
  transform: { scale: number[]; translate: number[] };
  arcs: number[][][];
  objects: { area: TopoObject; american_samoa: TopoObject };
};

// Edges are grouped by bands of latitude, so a point is tested only against
// the edges that cross its latitude.
const BAND = 0.1; // degrees

type Box = { south: number; west: number; north: number; east: number };
type Ring = Box & { points: number[] };

export type Area = {
  /** Whether a point is inside the outline (even-odd, so holes work). */
  contains: (point: LatLng) => boolean;
  /**
   * Whether a corner of the outline lies in the box: a coast, a border or a
   * small island shows there. The box may run past 180 degrees.
   */
  hasCornerIn: (box: Box) => boolean;
};

export function makeArea(topology: Topology): Area {
  const all: Ring[] = rings(topology).map(withBounds);
  return { contains: makeContains(all), hasCornerIn: (box) => hasCornerIn(all, box) };
}

function hasCornerIn(all: Ring[], box: Box) {
  // The box as the map gives it, and shifted a world either way.
  for (const shift of [0, 360, -360]) {
    const west = box.west + shift;
    const east = box.east + shift;
    for (const ring of all) {
      if (ring.north < box.south || ring.south > box.north || ring.east < west || ring.west > east) continue;
      const p = ring.points;
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] >= west && p[i] <= east && p[i + 1] >= box.south && p[i + 1] <= box.north) return true;
      }
    }
  }
  return false;
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

function makeContains(all: Ring[]): (point: LatLng) => boolean {
  const bands = new Map<number, number[]>();
  for (const { points: ring } of all) {
    for (let i = 2; i < ring.length; i += 2) {
      const x1 = ring[i - 2];
      const y1 = ring[i - 1];
      const x2 = ring[i];
      const y2 = ring[i + 1];
      const last = Math.floor(Math.max(y1, y2) / BAND);
      for (let band = Math.floor(Math.min(y1, y2) / BAND); band <= last; band++) {
        let edges = bands.get(band);
        if (!edges) bands.set(band, (edges = []));
        edges.push(x1, y1, x2, y2);
      }
    }
  }
  return ({ lat: y, lng }) => {
    if (!Number.isFinite(lng) || !Number.isFinite(y)) return false;
    // The map can show the world more than once: bring the longitude into
    // -180..180.
    const x = ((((lng + 180) % 360) + 360) % 360) - 180;
    const edges = bands.get(Math.floor(y / BAND));
    if (!edges) return false;
    let inside = false;
    for (let i = 0; i < edges.length; i += 4) {
      const x1 = edges[i];
      const y1 = edges[i + 1];
      const x2 = edges[i + 2];
      const y2 = edges[i + 3];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
    }
    return inside;
  };
}

// Decodes the TopoJSON arcs (quantized, delta-encoded) into closed rings of
// [lng, lat, lng, lat, ...].
function rings(topology: Topology): number[][] {
  const { scale, translate } = topology.transform;
  const arcs = topology.arcs.map((arc) => {
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
  const objects = [topology.objects.area];
  if (INCLUDE_AMERICAN_SAMOA) objects.push(topology.objects.american_samoa);
  const result: number[][] = [];
  for (const geometry of objects.flatMap((object) => object.geometries)) {
    const polygons = (geometry.type === "MultiPolygon" ? geometry.arcs : [geometry.arcs]) as number[][][];
    for (const polygon of polygons) {
      for (const arcIds of polygon) {
        const points: number[] = [];
        arcIds.forEach((id, k) => {
          const arc = id < 0 ? reversed(arcs[~id]) : arcs[id];
          // Consecutive arcs share their joining point. (A loop, not
          // push(...arc): an arc can hold more numbers than a call takes.)
          for (let i = k ? 2 : 0; i < arc.length; i++) points.push(arc[i]);
        });
        result.push(points);
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
