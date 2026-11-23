// Adds a white backing to every logo in design/logos/ that has the ice cube,
// so the see-through ice reads as ice on dark backgrounds too.
//
//   node scripts/white-backing.mjs           write <name>-white-backing.svg
//                                            next to each logo with the cube
//   node scripts/white-backing.mjs --check   exit 1 if any of those files is
//                                            missing or out of date
//
// The backing is the cube's own outline: the first path of the cube's
// luminance mask (id "ice-alpha", or "alpha" in ice_cube_clean), which is
// solid white and covers everything the mask lets through. It is copied as a
// plain white path and drawn just before the camera and the cube, in the same
// coordinate system as the mask, so it sits exactly under them. The text of
// the lockups gets no backing. No filters, so design tools draw it too.
//
// The source files are never changed. Logos without the cube (the wordmarks,
// ICE, PIK and the camera on its own) are skipped. No dependencies.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("../design/logos/", import.meta.url).pathname;
const SUFFIX = "-white-backing.svg";
const WHITE = "#ffffff";
const check = process.argv.includes("--check");

async function svgFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return svgFiles(path);
      return entry.name.endsWith(".svg") && !entry.name.endsWith(SUFFIX) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

// The cube's outline: the first path in the cube's mask, which must be solid
// white with a single outline. Anything else means the file has changed shape,
// so stop instead of guessing.
function cubeOutline(svg, file) {
  const mask = /<mask id="(ice-alpha|alpha)"[^>]*>([\s\S]*?)<\/mask>/.exec(svg);
  if (!mask) return null;
  const first = /<path fill="#FFFFFF" fill-rule="(evenodd|nonzero)" d="([^"]+)"\s*\/>/.exec(mask[2]);
  if (!first || mask[2].indexOf(first[0]) !== 0) {
    throw new Error(`${file}: the cube mask doesn't start with a solid white outline`);
  }
  if ((first[2].match(/[Mm]/g) ?? []).length !== 1) {
    throw new Error(`${file}: the cube outline has more than one shape`);
  }
  return { maskId: mask[1], fillRule: first[1], d: first[2] };
}

// Where the backing goes: just before the camera (which comes first, under the
// cube), or, in ice_cube_clean, just before the masked cube itself. Both sit in
// the same coordinate system as the element that uses the mask.
function insertionPoint(svg, maskId, file) {
  for (const marker of ['<g id="camera"', `<g mask="url(#${maskId})">`]) {
    const at = svg.indexOf(marker);
    if (at !== -1) {
      if (svg.indexOf(marker, at + 1) !== -1) throw new Error(`${file}: ${marker} appears twice`);
      return at;
    }
  }
  throw new Error(`${file}: no camera or masked cube to put the backing under`);
}

function withBacking(svg, file) {
  const outline = cubeOutline(svg, file);
  if (!outline) return null;
  if (svg.includes('id="white-backing"')) throw new Error(`${file}: already has a white backing`);
  const at = insertionPoint(svg, outline.maskId, file);
  const backing = `<path id="white-backing" fill="${WHITE}" fill-rule="${outline.fillRule}" d="${outline.d}"/>`;
  return svg.slice(0, at) + backing + svg.slice(at);
}

let written = 0;
let stale = 0;
for (const file of await svgFiles(ROOT)) {
  const svg = await readFile(file, "utf8");
  const out = withBacking(svg, relative(ROOT, file));
  if (out === null) continue;
  const target = file.slice(0, -".svg".length) + SUFFIX;
  const name = relative(ROOT, target);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== out) {
      stale++;
      console.log(`out of date: ${name}`);
    }
  } else {
    await writeFile(target, out);
    written++;
    console.log(`wrote ${name}`);
  }
}

if (check) {
  console.log(stale ? `${stale} file(s) out of date: run node scripts/white-backing.mjs` : "all white-backing files are up to date");
  process.exit(stale ? 1 : 0);
}
console.log(`${written} file(s) written`);
