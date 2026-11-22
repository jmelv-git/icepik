// CARTO, for the local checks (a11y-audit.mjs, capture-layout.mjs): nothing
// reaches it. blockCarto(page) stops every request to *.cartocdn.com in the
// browser, as the checks always have, with one difference: the pin-spot
// check's vector tiles (lib/pinnable.ts, ".../vectortiles/....mvt") are
// answered here with a stand-in tile instead of failing, so "Submit a report"
// can place a pin and its form can be checked. Map images (whose URLs carry
// the CARTO key), CARTO's style file and everything else are still aborted,
// and no URL is printed or recorded.
//
// The stand-in is a valid Mapbox Vector Tile (spec 2.1) in the layers the
// check reads: `earth` covering the whole tile (land) and `roads`, a grid of
// minor roads every 256 units (about 60 m at zoom 15), so every spot is
// pinnable. It has no `water`.

const EXTENT = 4096;

function varint(n, out) {
  while (n > 127) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}
const zigzag = (n) => (n << 1) ^ (n >> 31);
const command = (id, count) => (id & 7) | (count << 3);
function lengthDelimited(field, bytes, out) {
  varint((field << 3) | 2, out);
  varint(bytes.length, out);
  out.push(...bytes);
}
function uint(field, value, out) {
  varint(field << 3, out);
  varint(value, out);
}
const utf8 = (text) => [...Buffer.from(text, "utf8")];

// Geometry for lines or one ring, from absolute tile coordinates.
function geometry(paths, closed) {
  const out = [];
  let x = 0;
  let y = 0;
  for (const points of paths) {
    const step = ([px, py]) => {
      out.push(zigzag(px - x), zigzag(py - y));
      x = px;
      y = py;
    };
    out.push(command(1, 1));
    step(points[0]);
    out.push(command(2, points.length - 1));
    points.slice(1).forEach(step);
    if (closed) out.push(command(7, 1));
  }
  return out;
}

function packed(numbers) {
  const out = [];
  for (const n of numbers) varint(n, out);
  return out;
}

function feature({ type, tags = [], geom }) {
  const out = [];
  if (tags.length) lengthDelimited(2, packed(tags), out);
  uint(3, type, out);
  lengthDelimited(4, packed(geom), out);
  return out;
}

function layer(name, features, keys = [], values = []) {
  const out = [];
  uint(15, 2, out); // version
  lengthDelimited(1, utf8(name), out);
  for (const f of features) lengthDelimited(2, feature(f), out);
  for (const k of keys) lengthDelimited(3, utf8(k), out);
  for (const v of values) {
    const value = [];
    lengthDelimited(1, utf8(v), value); // string_value
    lengthDelimited(4, value, out);
  }
  uint(5, EXTENT, out);
  return out;
}

function buildTile() {
  // Land over the whole tile: an exterior ring, clockwise with y down.
  const earth = layer("earth", [
    {
      type: 3,
      geom: geometry(
        [
          [
            [0, 0],
            [EXTENT, 0],
            [EXTENT, EXTENT],
            [0, EXTENT],
          ],
        ],
        true,
      ),
    },
  ]);
  // Roads across the tile both ways, every 256 units.
  const lines = [];
  for (let at = 128; at < EXTENT; at += 256) {
    lines.push([
      [0, at],
      [EXTENT, at],
    ]);
    lines.push([
      [at, 0],
      [at, EXTENT],
    ]);
  }
  const roads = layer("roads", [{ type: 2, tags: [0, 0], geom: geometry(lines, false) }], ["kind"], ["minor_road"]);
  const tile = [];
  lengthDelimited(3, earth, tile);
  lengthDelimited(3, roads, tile);
  return Buffer.from(tile);
}

export const STAND_IN_TILE = buildTile();

export async function blockCarto(page) {
  await page.route("**/*cartocdn.com/**", (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.includes("/vectortiles/") && pathname.endsWith(".mvt")) {
      return route.fulfill({
        status: 200,
        contentType: "application/x-protobuf",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: STAND_IN_TILE,
      });
    }
    return route.abort();
  });
}
