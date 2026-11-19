// Where a sighting pin may go (PLAN.md, change 4, option B: CARTO vector tiles).
//
// Pins sit on the same 0.001-degree grid the database rounds to (about 100 m;
// lib/geo.ts roundCoord). A grid point is pinnable when, in CARTO's vector
// tiles (OpenStreetMap data, Protomaps schema, zoom 15):
//   - it is inside an `earth` polygon (land; a tile without one is all sea),
//   - it is not inside a `water` polygon (lake, river area, sea, pond, pool...),
//   - and it is within ROAD_RANGE_M of a line in the `roads` layer that a
//     person can be on: streets of every class, service roads, tracks, paths,
//     footways, steps, pedestrian streets, cycleways, piers and platforms. Not
//     rail of any kind, aerialways, ferries, runways or taxiways, ways under
//     construction or only proposed, and nothing in a tunnel (a pin marks a
//     place on the surface; a road tunnel through a ridge is not a way onto it).
// snapToPinnable() tries every grid point within SNAP_RANGE_M of the exact
// point, nearest first, and returns the first pinnable one. With `inArea`
// (lib/service-area.ts: where ICE works), it tries only grid points inside
// that area, and when there are none it answers "outside" without reading
// any tiles.
//
// Privacy: the exact point never leaves this module. It requests only whole
// zoom-15 tiles (about 940 m across in Philadelphia) by their tile numbers,
// from the URL template the map draws with (setTileTemplate), so in the
// browser they are answered from the HTTP cache when the map has shown that
// area at zoom 15 data. If no template was set, it first reads the template
// from CARTO's Positron style, once. Nothing here logs anything.
//
// Self-contained on purpose (no imports), so Node can run it directly in tests.
//
// Distances use a local flat projection, which is exact enough (centimetres)
// at Philadelphia's latitude. Not handled, because the map never goes there:
// above about 80 degrees the nearest-first order can be off by a few
// centimetres, and near the 180-degree meridian distances across it are wrong.

export const SNAP_RANGE_M = 300; // how far a pin may move from where it was put
export const ROAD_RANGE_M = 200; // a pinnable spot is within this of a road or footpath

export type LatLng = { lat: number; lng: number };
export type SnapResult =
  | { ok: true; spot: LatLng } // a 0.001-degree grid point
  | { ok: false; reason: "none-nearby" | "unavailable" | "outside" };

// inArea: only grid points it accepts may get a pin.
type CheckOptions = { signal?: AbortSignal; inArea?: (point: LatLng) => boolean };

const ZOOM = 15; // CARTO's deepest data zoom (16 answers 404)
const DEFAULT_TEMPLATE =
  "https://tiles.basemaps.cartocdn.com/v/20261026-01/vectortiles/carto.streets/v2/{z}/{x}/{y}.mvt";
const STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CACHED_TILES = 64; // a check needs 4 to 9 tiles at Philadelphia's latitude
const EARTH_RADIUS_M = 6371000; // as in lib/geo.ts
const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;
const MAX_LAT = 85.05112878; // the edge of the Web Mercator world

// Must equal lib/geo.ts roundCoord exactly.
function roundCoord(value: number) {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Moves `point` to the nearest pinnable grid point within SNAP_RANGE_M.
 * The first candidate is always roundCoord(point), the spot a pin got before
 * this check existed; the others follow by distance (ties: north, then east,
 * first). With `inArea`, candidates outside it are skipped, and "outside"
 * comes back, with no tile read, when none is inside. Returns "none-nearby"
 * when no candidate passes (also for a point off the map: not finite, or
 * beyond 85.05 degrees or 180 degrees), and "unavailable" when the tiles
 * can't be fetched or decoded, or none of them exists at the URL template.
 * If `signal` aborts, the promise rejects with `signal.reason` (an
 * AbortError DOMException unless the caller gave another reason); tile
 * downloads already started keep going and stay cached.
 */
export async function snapToPinnable(point: LatLng, options: CheckOptions = {}): Promise<SnapResult> {
  const { signal, inArea } = options;
  throwIfAborted(signal);
  if (!isValid(point)) return { ok: false, reason: "none-nearby" };
  const all = candidates(point);
  const allowed = inArea ? all.filter((spot) => inArea(spot)) : all;
  if (!allowed.length) return { ok: false, reason: "outside" };
  const [nearest, ...others] = allowed;
  let area: CheckArea;
  try {
    // One template for the whole check, so a failed style lookup isn't
    // repeated within it.
    const template = await abortable(currentTemplate(), signal);
    // Most pins are put somewhere pinnable. The nearest grid point needs only
    // the tiles within ROAD_RANGE_M of it, which the map is most likely
    // showing, so check it before reading the whole box (tilesAround).
    const near = await abortable(loadArea(template, nearest, ROAD_RANGE_M), signal);
    throwIfAborted(signal);
    if (near.isPinnable(nearest)) return { ok: true, spot: nearest };
    area = await abortable(loadArea(template, point, SNAP_RANGE_M + ROAD_RANGE_M), signal);
  } catch {
    throwIfAborted(signal); // the caller's abort; a fetch timeout is "unavailable"
    return { ok: false, reason: "unavailable" };
  }
  throwIfAborted(signal);
  for (const spot of others) {
    if (area.isPinnable(spot)) return { ok: true, spot };
  }
  return { ok: false, reason: "none-nearby" };
}

/**
 * Whether a pin may sit at `gridPoint`. The point is rounded to the grid
 * first (roundCoord), so isPinnable(p) says whether snapToPinnable(p) keeps
 * the pin where it is. Rejects with an Error when the tiles can't be fetched
 * or decoded, and with `signal.reason` when `signal` aborts.
 */
export async function isPinnable(gridPoint: LatLng, options: CheckOptions = {}): Promise<boolean> {
  const { signal, inArea } = options;
  throwIfAborted(signal);
  if (!isValid(gridPoint)) return false;
  const spot = { lat: roundCoord(gridPoint.lat), lng: roundCoord(gridPoint.lng) };
  if (inArea && !inArea(spot)) return false;
  const template = await abortable(currentTemplate(), signal);
  const area = await abortable(loadArea(template, spot, ROAD_RANGE_M), signal);
  throwIfAborted(signal);
  return area.isPinnable(spot);
}

/**
 * Whether any grid point a snapToPinnable(point) check would try is inside
 * `inArea`. Reads no tiles: callers use it to say "outside" before showing
 * the spot or reading any map data.
 */
export function anySpotIn(point: LatLng, inArea: (point: LatLng) => boolean): boolean {
  return isValid(point) && candidates(point).some((spot) => inArea(spot));
}

/**
 * The map calls this with its vector style's tile URL template (the style's
 * sources.*.tiles[0]), so checks fetch the very URLs the map has loaded.
 * Anything that isn't an http(s) URL with {z}, {x} and {y} is ignored.
 */
export function setTileTemplate(template: string): void {
  if (isTemplate(template)) tileTemplate = template;
}

/**
 * The zoom-15 tiles a snapToPinnable(point) check may read, north-west first:
 * every tile within SNAP_RANGE_M + ROAD_RANGE_M of the point. A check whose
 * nearest grid point is pinnable reads only the tiles within ROAD_RANGE_M of
 * that grid point.
 */
export function tilesAround(point: LatLng): { z: number; x: number; y: number }[] {
  return isValid(point) ? tilesInBox(point, SNAP_RANGE_M + ROAD_RANGE_M) : [];
}

// ---------------------------------------------------------------------------
// Candidates and tile maths

function isValid(p: LatLng) {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= MAX_LAT &&
    Math.abs(p.lng) <= 180
  );
}

// Grid points within SNAP_RANGE_M of `point`, nearest first. Each coordinate
// is an integer divided by 1000: the same number roundCoord returns.
function candidates(point: LatLng): LatLng[] {
  const kLat = Math.round(point.lat * 1000);
  const kLng = Math.round(point.lng * 1000);
  const mPerDegLng = M_PER_DEG * Math.cos((point.lat * Math.PI) / 180);
  const stepsLat = Math.ceil((SNAP_RANGE_M / M_PER_DEG) * 1000) + 1;
  const stepsLng = Math.ceil((SNAP_RANGE_M / mPerDegLng) * 1000) + 1;
  const list: { spot: LatLng; d: number }[] = [];
  for (let i = -stepsLat; i <= stepsLat; i++) {
    const lat = (kLat + i) / 1000;
    if (Math.abs(lat) > MAX_LAT) continue;
    const dy = (lat - point.lat) * M_PER_DEG;
    for (let j = -stepsLng; j <= stepsLng; j++) {
      const lng = (kLng + j) / 1000;
      if (Math.abs(lng) > 180) continue;
      const dx = (lng - point.lng) * mPerDegLng;
      const d = Math.hypot(dx, dy);
      // roundCoord(point) goes first even if rounding error puts a tied
      // neighbour a hair closer.
      if (i === 0 && j === 0) list.push({ spot: { lat, lng }, d: -1 });
      else if (d <= SNAP_RANGE_M) list.push({ spot: { lat, lng }, d });
    }
  }
  list.sort((a, b) => a.d - b.d || b.spot.lat - a.spot.lat || b.spot.lng - a.spot.lng);
  return list.map((c) => c.spot);
}

// Global tile coordinates (fractional) at ZOOM.
function tileX(lng: number) {
  return ((lng + 180) / 360) * 2 ** ZOOM;
}
function tileY(lat: number) {
  const r = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM;
}

function tilesInBox(center: LatLng, rangeM: number) {
  const n = 2 ** ZOOM;
  const dLat = rangeM / M_PER_DEG;
  const dLng = rangeM / (M_PER_DEG * Math.cos((center.lat * Math.PI) / 180));
  const x0 = Math.floor(tileX(center.lng - dLng));
  const x1 = Math.floor(tileX(center.lng + dLng));
  const y0 = Math.max(0, Math.floor(tileY(center.lat + dLat)));
  const y1 = Math.min(n - 1, Math.floor(tileY(center.lat - dLat)));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) tiles.push({ z: ZOOM, x: ((x % n) + n) % n, y });
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// A loaded area: the tiles around one check, with the usable roads projected
// to metres in a local equirectangular projection around its centre.

type Ring = { pts: Int32Array; minX: number; minY: number; maxX: number; maxY: number };
type Area = { extent: number; rings: Ring[]; minX: number; minY: number; maxX: number; maxY: number };
type Line = { pts: Float64Array; minLat: number; maxLat: number; minLng: number; maxLng: number }; // lat, lng pairs
type Tile = { earth: Area[]; water: Area[]; roads: Line[] };

const ROAD_RANGE_SQ = ROAD_RANGE_M * ROAD_RANGE_M;

class CheckArea {
  private readonly tiles: Map<string, Tile>;
  private readonly lat0: number;
  private readonly lng0: number;
  private readonly kx: number;
  private readonly segs: Float64Array; // x1, y1, x2, y2 in metres from the centre

  constructor(center: LatLng, rangeM: number, tiles: Map<string, Tile>) {
    this.tiles = tiles;
    this.lat0 = center.lat;
    this.lng0 = center.lng;
    this.kx = M_PER_DEG * Math.cos((center.lat * Math.PI) / 180);
    // Only lines that come near the box this check can reach.
    const reach = rangeM + 50;
    const dLat = reach / M_PER_DEG;
    const dLng = reach / this.kx;
    const out: number[] = [];
    for (const tile of tiles.values()) {
      for (const line of tile.roads) {
        if (
          line.maxLat < center.lat - dLat ||
          line.minLat > center.lat + dLat ||
          line.maxLng < center.lng - dLng ||
          line.minLng > center.lng + dLng
        )
          continue;
        const p = line.pts;
        let px = (p[1] - this.lng0) * this.kx;
        let py = (p[0] - this.lat0) * M_PER_DEG;
        for (let i = 2; i < p.length; i += 2) {
          const x = (p[i + 1] - this.lng0) * this.kx;
          const y = (p[i] - this.lat0) * M_PER_DEG;
          out.push(px, py, x, y);
          px = x;
          py = y;
        }
      }
    }
    this.segs = Float64Array.from(out);
  }

  isPinnable(spot: LatLng) {
    return this.isOpenLand(spot) && this.nearRoad(spot);
  }

  // Inside `earth` and outside every `water` polygon, in the tile holding it.
  private isOpenLand(spot: LatLng) {
    const n = 2 ** ZOOM;
    const fx = tileX(spot.lng);
    const fy = tileY(spot.lat);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const tile = this.tiles.get(`${((tx % n) + n) % n}/${ty}`);
    if (!tile) return false;
    const u = fx - tx;
    const v = fy - ty;
    if (!tile.earth.some((a) => contains(a, u * a.extent, v * a.extent))) return false;
    return !tile.water.some((a) => contains(a, u * a.extent, v * a.extent));
  }

  private nearRoad(spot: LatLng) {
    const x = (spot.lng - this.lng0) * this.kx;
    const y = (spot.lat - this.lat0) * M_PER_DEG;
    const s = this.segs;
    const r = ROAD_RANGE_M;
    for (let i = 0; i < s.length; i += 4) {
      const x1 = s[i];
      const y1 = s[i + 1];
      const x2 = s[i + 2];
      const y2 = s[i + 3];
      if ((x1 < x2 ? x1 : x2) - r > x || (x1 > x2 ? x1 : x2) + r < x) continue;
      if ((y1 < y2 ? y1 : y2) - r > y || (y1 > y2 ? y1 : y2) + r < y) continue;
      if (segmentDistSq(x, y, x1, y1, x2, y2) <= ROAD_RANGE_SQ) return true;
    }
    return false;
  }
}

function segmentDistSq(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  let t = len > 0 ? ((x - x1) * dx + (y - y1) * dy) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = x1 + t * dx - x;
  const ey = y1 + t * dy - y;
  return ex * ex + ey * ey;
}

// Even-odd rule over all of a feature's rings. MVT 2.1 polygons are exterior
// rings (positive area) each followed by their holes (negative area), so a
// point inside an odd number of rings is inside the feature whatever the
// winding; a ring whose box misses the point can't change the count.
function contains(a: Area, x: number, y: number) {
  if (x < a.minX || x > a.maxX || y < a.minY || y > a.maxY) return false;
  let inside = false;
  for (const ring of a.rings) {
    if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) continue;
    const p = ring.pts;
    const n = p.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const yi = p[i + 1];
      const yj = p[j + 1];
      if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Fetching, with a promise cache keyed by URL (least recently used dropped).

let tileTemplate: string | null = null;
let styleTemplate: Promise<string> | null = null;
const tileCache = new Map<string, Promise<Tile | null>>();

function isTemplate(t: unknown): t is string {
  return (
    typeof t === "string" &&
    /^https?:\/\/[^\s]+$/.test(t) &&
    t.includes("{z}") &&
    t.includes("{x}") &&
    t.includes("{y}")
  );
}

async function currentTemplate(): Promise<string> {
  if (tileTemplate) return tileTemplate;
  if (!styleTemplate) styleTemplate = templateFromStyle();
  return styleTemplate;
}

// The first vector source's tile URL in CARTO's Positron GL style. Falls back
// to the constant; a failed lookup is retried by the next check.
async function templateFromStyle(): Promise<string> {
  try {
    const res = await fetchBytes(STYLE_URL);
    if (res.ok) {
      const style = JSON.parse(readString(new Uint8Array(res.body), 0, res.body.byteLength)) as {
        sources?: Record<string, { type?: string; tiles?: unknown[] }>;
      };
      for (const source of Object.values(style?.sources ?? {})) {
        const first = source?.tiles?.[0];
        if (source?.type === "vector" && isTemplate(first)) return first;
      }
    }
  } catch {
    // fall through
  }
  styleTemplate = null;
  return DEFAULT_TEMPLATE;
}

async function loadArea(template: string, center: LatLng, rangeM: number): Promise<CheckArea> {
  const wanted = tilesInBox(center, rangeM);
  const loaded = await Promise.all(
    wanted.map((t) =>
      loadTile(
        template.replace(/\{z\}/g, String(t.z)).replace(/\{x\}/g, String(t.x)).replace(/\{y\}/g, String(t.y)),
        t.x,
        t.y,
      ),
    ),
  );
  // An empty tile (204, or no body) counts as sea. But CARTO serves the open
  // sea as a tile with an ocean polygon, so when every tile is empty the
  // template is probably wrong, and the place isn't known to be sea.
  if (loaded.every((t) => t === null)) throw new Error("No tiles at this URL template");
  const tiles = new Map<string, Tile>();
  wanted.forEach((t, i) => tiles.set(`${t.x}/${t.y}`, loaded[i] ?? EMPTY_TILE));
  return new CheckArea(center, rangeM, tiles);
}

const EMPTY_TILE: Tile = { earth: [], water: [], roads: [] };

function loadTile(url: string, x: number, y: number): Promise<Tile | null> {
  const cached = tileCache.get(url);
  if (cached) {
    tileCache.delete(url);
    tileCache.set(url, cached);
    return cached;
  }
  const promise = fetchTile(url, x, y);
  tileCache.set(url, promise);
  promise.catch(() => {
    if (tileCache.get(url) === promise) tileCache.delete(url);
  });
  while (tileCache.size > MAX_CACHED_TILES) {
    const oldest = tileCache.keys().next().value;
    if (oldest === undefined) break;
    tileCache.delete(oldest);
  }
  return promise;
}

// null for an empty tile (204, or no body): treated as sea. A missing tile
// (404) is an error, not sea: CARTO serves every tile of the world, sea
// included, so a 404 means a CDN or template problem, and the check answers
// "unavailable" rather than refusing the spot.
async function fetchTile(url: string, x: number, y: number): Promise<Tile | null> {
  const res = await fetchBytes(url);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Tile request failed (${res.status})`);
  return res.body.byteLength ? decodeTile(new Uint8Array(res.body), x, y) : null;
}

// A plain GET, like the map's own tile requests, so the browser's HTTP cache
// answers it. The body is read within the time limit too.
async function fetchBytes(url: string): Promise<{ ok: boolean; status: number; body: ArrayBuffer }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { ok: res.ok, status: res.status, body: await res.arrayBuffer() };
  } finally {
    clearTimeout(timer);
  }
}

function abortError() {
  return typeof DOMException === "function"
    ? new DOMException("The check was aborted.", "AbortError")
    : Object.assign(new Error("The check was aborted."), { name: "AbortError" });
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw signal.reason ?? abortError();
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? abortError());
      return;
    }
    const onAbort = () => reject(signal.reason ?? abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Mapbox Vector Tile decoding (spec 2.1), only what the check needs: polygons
// of `earth` and `water`, and usable lines of `roads`. Other layers are skipped
// without decoding their features.

type Pbf = { buf: Uint8Array; pos: number };
type Value = string | number | boolean | null;

// Kinds of the Protomaps `roads` layer a person can walk or drive on. Others
// (rail, aerialway, aeroway, ferry, and any kind added later) don't count.
const ROAD_KINDS = new Set(["highway", "major_road", "minor_road", "path", "other"]);
// highway=* values for ways nobody uses (yet, or any more). Only exact
// matches: kind_detail "disused_tram" on a major_road is a street whose old
// tram tracks are disused, and still a street.
const NOT_IN_USE = new Set([
  "construction",
  "proposed",
  "planned",
  "abandoned",
  "disused",
  "razed",
  "dismantled",
  "removed",
  "bus_guideway",
  "raceway",
]);

function isUsableRoad(kind: Value, detail: Value, tunnel: Value) {
  if (typeof kind !== "string" || !ROAD_KINDS.has(kind)) return false;
  if (tunnel === true || tunnel === "yes" || tunnel === 1) return false;
  return !(typeof detail === "string" && NOT_IN_USE.has(detail));
}

let textDecoder: TextDecoder | null = null;
function readString(buf: Uint8Array, start: number, end: number) {
  textDecoder ??= new TextDecoder();
  return textDecoder.decode(buf.subarray(start, end));
}

function readVarint(p: Pbf): number {
  const buf = p.buf;
  let value = 0;
  let scale = 1;
  for (let i = 0; i < 10; i++) {
    if (p.pos >= buf.length) throw new RangeError("Truncated tile");
    const b = buf[p.pos++];
    value += (b & 0x7f) * scale;
    if (b < 0x80) return value;
    scale *= 128;
  }
  throw new RangeError("Bad varint in tile");
}

function skipField(p: Pbf, wire: number) {
  if (wire === 0) readVarint(p);
  else if (wire === 1) p.pos += 8;
  else if (wire === 2) p.pos += readVarint(p);
  else if (wire === 5) p.pos += 4;
  else throw new RangeError("Bad wire type in tile");
  if (p.pos > p.buf.length) throw new RangeError("Truncated tile");
}

// Length-delimited field: returns its end and leaves pos at its start.
function readLength(p: Pbf) {
  const end = readVarint(p) + p.pos;
  if (end > p.buf.length) throw new RangeError("Truncated tile");
  return end;
}

const zigzag32 = (n: number) => (n >>> 1) ^ -(n & 1);
const zigzag64 = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

function decodeTile(buf: Uint8Array, tx: number, ty: number): Tile {
  const tile: Tile = { earth: [], water: [], roads: [] };
  const p: Pbf = { buf, pos: 0 };
  while (p.pos < buf.length) {
    const tag = readVarint(p);
    if (tag === 26) {
      // field 3 (layers), length-delimited
      const end = readLength(p);
      readLayer(p, end, tile, tx, ty);
      p.pos = end;
    } else skipField(p, tag & 7);
  }
  return tile;
}

function readLayer(p: Pbf, end: number, tile: Tile, tx: number, ty: number) {
  let name = "";
  let extent = 4096;
  const keys: [number, number][] = [];
  const values: [number, number][] = [];
  const features: [number, number][] = [];
  while (p.pos < end) {
    const tag = readVarint(p);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 2 && field >= 1 && field <= 4) {
      const fieldEnd = readLength(p);
      if (field === 1) name = readString(p.buf, p.pos, fieldEnd);
      else if (field === 2) features.push([p.pos, fieldEnd]);
      else if (field === 3) keys.push([p.pos, fieldEnd]);
      else values.push([p.pos, fieldEnd]);
      p.pos = fieldEnd;
    } else if (field === 5 && wire === 0) extent = readVarint(p) || 4096;
    else skipField(p, wire);
  }
  if (name === "earth" || name === "water") {
    const into = name === "earth" ? tile.earth : tile.water;
    for (const [start, stop] of features) {
      const f = readFeature(p, start, stop);
      if (f.type !== 3) continue; // water also has river lines and label points
      const area = readArea(p, f.geometry, extent);
      if (area) into.push(area);
    }
  } else if (name === "roads") {
    const keyIndex = (wanted: string) =>
      keys.findIndex(([s, e]) => e - s === wanted.length && readString(p.buf, s, e) === wanted);
    const kindKey = keyIndex("kind");
    const detailKey = keyIndex("kind_detail");
    const tunnelKey = keyIndex("is_tunnel");
    const decoded = new Map<number, Value>();
    const value = (i: number): Value => {
      if (!decoded.has(i)) {
        const range = values[i];
        decoded.set(i, range ? readValue(p, range[0], range[1]) : null);
      }
      return decoded.get(i) ?? null;
    };
    for (const [start, stop] of features) {
      const f = readFeature(p, start, stop);
      if (f.type !== 2) continue;
      let kind: Value = null;
      let detail: Value = null;
      let tunnel: Value = null;
      const t = f.tags;
      for (let i = 0; i + 1 < t.length; i += 2) {
        if (t[i] === kindKey) kind = value(t[i + 1]);
        else if (t[i] === detailKey) detail = value(t[i + 1]);
        else if (t[i] === tunnelKey) tunnel = value(t[i + 1]);
      }
      if (isUsableRoad(kind, detail, tunnel)) readLines(p, f.geometry, extent, tx, ty, tile.roads);
    }
  }
}

function readFeature(p: Pbf, start: number, end: number) {
  let type = 0;
  let geometry: [number, number] = [0, 0];
  const tags: number[] = [];
  p.pos = start;
  while (p.pos < end) {
    const tag = readVarint(p);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 3 && wire === 0) type = readVarint(p);
    else if ((field === 2 || field === 4) && wire === 2) {
      const fieldEnd = readLength(p);
      if (field === 4) {
        geometry = [p.pos, fieldEnd];
        p.pos = fieldEnd;
      } else while (p.pos < fieldEnd) tags.push(readVarint(p));
    } else skipField(p, wire);
  }
  return { type, tags, geometry };
}

function readValue(p: Pbf, start: number, end: number): Value {
  let value: Value = null;
  p.pos = start;
  while (p.pos < end) {
    const tag = readVarint(p);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const fieldEnd = readLength(p);
      value = readString(p.buf, p.pos, fieldEnd);
      p.pos = fieldEnd;
    } else if (field === 7 && wire === 0) value = readVarint(p) !== 0;
    else if ((field === 4 || field === 5) && wire === 0) value = readVarint(p);
    else if (field === 6 && wire === 0) value = zigzag64(readVarint(p));
    else skipField(p, wire); // float and double: not needed
  }
  return value;
}

// Calls `point` for every MoveTo/LineTo vertex, and `close` for ClosePath.
function walkGeometry(
  p: Pbf,
  [start, end]: [number, number],
  point: (x: number, y: number, moveTo: boolean) => void,
  close: () => void,
) {
  let x = 0;
  let y = 0;
  p.pos = start;
  while (p.pos < end) {
    const command = readVarint(p);
    const id = command & 7;
    const count = Math.floor(command / 8);
    if (id === 1 || id === 2) {
      for (let i = 0; i < count; i++) {
        x += zigzag32(readVarint(p));
        y += zigzag32(readVarint(p));
        point(x, y, id === 1);
      }
      if (p.pos > end) throw new RangeError("Bad geometry in tile");
    } else if (id === 7) close();
    else throw new RangeError("Bad geometry command in tile");
  }
}

function readArea(p: Pbf, geometry: [number, number], extent: number): Area | null {
  const rings: Ring[] = [];
  let current: number[] = [];
  const finish = () => {
    if (current.length >= 6) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < current.length; i += 2) {
        const x = current[i];
        const y = current[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      rings.push({ pts: Int32Array.from(current), minX, minY, maxX, maxY });
    }
    current = [];
  };
  walkGeometry(
    p,
    geometry,
    (x, y, moveTo) => {
      if (moveTo) finish();
      current.push(x, y);
    },
    finish,
  );
  finish();
  if (!rings.length) return null;
  const area: Area = { extent, rings, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const r of rings) {
    area.minX = Math.min(area.minX, r.minX);
    area.minY = Math.min(area.minY, r.minY);
    area.maxX = Math.max(area.maxX, r.maxX);
    area.maxY = Math.max(area.maxY, r.maxY);
  }
  return area;
}

// Line vertices go straight to latitude and longitude.
function readLines(p: Pbf, geometry: [number, number], extent: number, tx: number, ty: number, into: Line[]) {
  const n = 2 ** ZOOM;
  let current: number[] = [];
  const finish = () => {
    if (current.length >= 4) {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (let i = 0; i < current.length; i += 2) {
        const lat = current[i];
        const lng = current[i + 1];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      into.push({ pts: Float64Array.from(current), minLat, maxLat, minLng, maxLng });
    }
    current = [];
  };
  walkGeometry(
    p,
    geometry,
    (x, y, moveTo) => {
      if (moveTo) finish();
      const lng = ((tx + x / extent) / n) * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + y / extent)) / n))) * 180) / Math.PI;
      current.push(lat, lng);
    },
    finish,
  );
  finish();
}
