// Leaflet with the leaflet-providers plugin, so one dynamic import downloads
// both at once. leaflet-providers extends the global L that Leaflet sets, so
// Leaflet has to be imported first.
import * as L from "leaflet";
import "leaflet-providers";
import type { StyleSpecification } from "maplibre-gl";

export { L };

// Whether MapLibre can draw the map here: it needs WebGL2, which some
// browsers turn off (privacy settings, old or blocked graphics drivers). The
// test context is released at once.
export function hasWebGL2() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

// MapLibre GL, its stylesheet and the bridge that draws a MapLibre map as a
// Leaflet layer, for the vector map. A separate download, fetched only when
// the browser has WebGL2, so the raster fallback never loads it.
export async function loadVectorMap() {
  const [maplibre, bridge] = await Promise.all([
    import("maplibre-gl"),
    import("@maplibre/maplibre-gl-leaflet"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]);
  // MapLibre works out its worker's address from import.meta.url, which the
  // bundle turns into a file:// path, so its workers fail to load. Point it
  // at the worker file the build copies to this site's static files instead.
  // A worker from this site is allowed by the CSP (worker-src 'self').
  maplibre.setWorkerUrl(
    new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
  );
  return { MaplibreGL: bridge.MaplibreGL };
}

// A MapLibre style transform (transformStyle) that makes every name on the
// map readable against anything it can be drawn on: the land, streets and
// buildings, and the water for water names. CARTO's Dark Matter draws most
// names dim grey on near-black (the reason the raster map lightens its label
// tiles), and Positron's pale greys fall a little short of 4.5:1 too. Each
// name keeps its hue and moves just far enough towards white (dark map) or
// black (light map). Small text loses some of its colour to smoothing, light
// text on dark the most, so the colours aim higher than WCAG AA's 4.5:1
// (7:1 on the dark map, 5:1 on the light one) to reach 4.5:1 as drawn.
export function readableLabels(
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  const under: Record<"land" | "roads" | "water" | "buildings", RGBA[]> = {
    land: [],
    roads: [],
    water: [],
    buildings: [],
  };
  for (const layer of next.layers) {
    const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
    const sourceLayer = (layer as { "source-layer"?: string })["source-layer"];
    if (layer.type === "background") collectColors(paint["background-color"], under.land);
    else if (layer.type === "fill" && sourceLayer === "landuse")
      collectColors(paint["fill-color"], under.land);
    else if (layer.type === "fill" && sourceLayer === "water")
      collectColors(paint["fill-color"], under.water);
    else if (layer.type === "fill" && sourceLayer === "buildings")
      collectColors(paint["fill-color"], under.buildings);
    else if (layer.type === "line" && sourceLayer === "roads" && layer.id.includes("_fill"))
      collectColors(paint["line-color"], under.roads);
  }
  const dark = under.land.length > 0 && luminance(under.land[0]) < 0.5;
  const target = dark ? 7 : 5;
  const ground = [...under.land, ...under.roads, ...under.buildings];

  return {
    ...next,
    layers: next.layers.map((layer) => {
      if (layer.type !== "symbol" || !layer.paint?.["text-color"]) return layer;
      const backdrops = layer["source-layer"] === "water" ? [...ground, ...under.water] : ground;
      const textColor = mapColors(layer.paint["text-color"], (color) =>
        readableOn(color, backdrops, dark, target),
      ) as typeof layer.paint["text-color"];
      return { ...layer, paint: { ...layer.paint, "text-color": textColor } };
    }),
  };
}

type RGBA = [number, number, number, number];

// The colour moved towards white (dark map) or black (light map), just far
// enough to reach the target contrast against every backdrop.
function readableOn(color: RGBA, backdrops: RGBA[], dark: boolean, target: number): RGBA {
  const towards = (t: number): RGBA => [
    ...(color.slice(0, 3).map((c) => (dark ? c + (255 - c) * t : c * (1 - t))) as [
      number,
      number,
      number,
    ]),
    color[3],
  ];
  const readable = (c: RGBA) => backdrops.every((b) => contrast(c, b) >= target);
  if (readable(color)) return color;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i++) {
    const t = (low + high) / 2;
    if (readable(towards(t))) high = t;
    else low = t;
  }
  return towards(high);
}

function luminance([r, g, b]: RGBA) {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: RGBA, b: RGBA) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(); anything else is null.
function parseColor(value: string): RGBA | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    if (full.length !== 6 && full.length !== 8) return null;
    const byte = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return [byte(0), byte(2), byte(4), full.length === 8 ? byte(6) / 255 : 1];
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(text)?.[1];
  if (rgb) {
    const parts = rgb.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.length > 4 || parts.some(Number.isNaN)) return null;
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  return null;
}

function formatColor([r, g, b, a]: RGBA) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

// Every colour in a style value (a colour, zoom stops or an expression), with
// fn applied.
function mapColors(value: unknown, fn: (color: RGBA) => RGBA): unknown {
  if (typeof value === "string") {
    const color = parseColor(value);
    return color ? formatColor(fn(color)) : value;
  }
  if (Array.isArray(value)) return value.map((item) => mapColors(item, fn));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapColors(v, fn)]));
  return value;
}

// The solid colours in a style value: see-through ones don't hide what's
// under them, so they don't count as backdrops.
function collectColors(value: unknown, into: RGBA[]) {
  mapColors(value, (color) => {
    if (color[3] >= 0.9) into.push(color);
    return color;
  });
}
