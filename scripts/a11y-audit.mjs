// Checks ICEPik against the measurable lines of its WCAG 2.2 AA checklist
// (docs/accessibility-checklist.md), on every screen state, at the seven
// sizes of scripts/capture-layout.mjs, in light and dark mode:
//
//   1. Contrast on opaque surfaces (1.4.3, 1.4.11): text 4.5:1 (3:1 when
//      large), icons 3:1, and the edges of text boxes and choice cards 3:1.
//      Surfaces you can see through (glass, the lava lamp) can't be measured
//      from the page: scripts/glass-contrast.mjs proves them, and this script
//      runs it first. Text over the map is measured over white and over black.
//   2. Target size (2.5.8): every pointer target is at least 24x24 CSS px,
//      or a 24px circle on its centre touches no other target and no other
//      small target's circle. Exceptions, as in the W3C Understanding page:
//      map pins (essential: their place is the information) and the map
//      credits' links (inline, in a line of text).
//   3. Reflow (1.4.10): no sideways scroll at 320 CSS px wide, at 320x568 and
//      at 320x200 (1280x800 at 400% zoom).
//   4. Text spacing (1.4.12): with line height 1.5, paragraph spacing 2,
//      letter spacing 0.12 and word spacing 0.16 (times the font size), no
//      text is cut off that wasn't already. Text cut short on purpose at rest
//      (an ellipsis) is listed, not failed; so is the alert card's heading
//      when its button to show the rest is there.
//
//   node scripts/a11y-audit.mjs                  everything; exit 1 on a failure
//   Options: --sizes 1280x800,390x844  --schemes light,dark  --states home,alert
//            --url http://127.0.0.1:3000  --skip-glass  --verbose
//
// Needs the app on --url, built and started against the stand-in database
// (scripts/mock-supabase.mjs on port 54321), like scripts/capture-layout.mjs.
// Map tiles are blocked, and the place search and reverse lookup are stubbed,
// so nothing here reaches CARTO or Nominatim. Nothing about the network is
// recorded: the output names elements by their classes, never by HTML or URL.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = dirname(fileURLToPath(import.meta.url));

const SIZES = ["1280x800", "1024x768", "820x1180", "768x1024", "390x844", "360x667", "844x390"];
// Reflow sizes: checked in light mode only (the scheme changes no layout).
const NARROW = ["320x568", "320x200"];
const SCHEMES = ["light", "dark"];
const STATES = [
  "consent",
  "home",
  "map-only",
  "alert",
  "reports-nearby",
  "reports-selected",
  "reports-search",
  "search-results",
  "pick",
  "name",
  "report-form",
  "report-nearby",
  "report-error",
  "settings",
  "policy",
  "clear",
  "delete",
  "login",
  "login-error",
  "save",
  "save-error",
  "rights",
  "starter",
];

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 ? process.argv[at + 1] : fallback;
}
const list = (value, all) => (value ? value.split(",").filter((v) => all.includes(v)) : all);

const url = option("url", "http://127.0.0.1:3000");
const sizes = list(option("sizes"), [...SIZES, ...NARROW]);
const schemes = list(option("schemes"), SCHEMES);
const states = list(option("states"), STATES);
const verbose = process.argv.includes("--verbose");

// Errors print their first line only: Playwright's call logs can hold
// request headers.
const firstLine = (error) => String(error?.message ?? error).split("\n")[0];
process.on("unhandledRejection", (error) => {
  console.error(firstLine(error));
  process.exit(2);
});

// --- 0. Glass and lamp contrast --------------------------------------------

let glassFailed = false;
if (!process.argv.includes("--skip-glass")) {
  const run = spawnSync(process.execPath, [join(here, "glass-contrast.mjs")], { encoding: "utf8" });
  const summary = run.stdout.trim().split("\n").at(-1);
  glassFailed = run.status !== 0;
  console.log(`Glass and lamp contrast (scripts/glass-contrast.mjs): ${summary}`);
  if (glassFailed) console.log("  FAIL: run scripts/glass-contrast.mjs for the details.");
}

// --- Driving the app (as in scripts/capture-layout.mjs) --------------------

const SEARCH_RESULTS = [
  { display_name: "City Hall, Philadelphia, Pennsylvania", lat: "39.9524", lon: "-75.1636" },
  {
    display_name: "Rittenhouse Square, Philadelphia, Pennsylvania",
    lat: "39.9496",
    lon: "-75.1718",
  },
];

async function guard(page) {
  await page.route("**/*cartocdn.com/**", (route) => route.abort());
  await page.route("**/api/search**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(SEARCH_RESULTS) }),
  );
  await page.route("**/api/reverse**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ label: "Market Street" }) }),
  );
}

async function settle(page) {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}));
    await Promise.race([Promise.all(running), new Promise((r) => setTimeout(r, 3000))]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(300);
}

async function passConsent(page) {
  await page.waitForSelector(".consent-text");
  await page.waitForFunction(
    () => {
      const box = document.querySelector(".consent-text");
      box.scrollTop = 0;
      box.scrollTop = box.scrollHeight;
      return document.querySelector(".consent-agree")?.getAttribute("aria-disabled") === "false";
    },
    null,
    { polling: 250 },
  );
  await page.click(".consent-agree");
}

async function openApp(page) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pin-icon", { state: "attached" });
  await page.waitForFunction(() => !document.querySelector(".starter"));
  await settle(page);
}

const visible = (page, selector) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
    return Boolean(el && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none");
  }, selector);

async function openSettings(page) {
  const button = (await visible(page, ".rail-settings")) ? ".rail-settings" : ".panel-settings";
  await page.click(button);
  await page.waitForSelector(".modal .settings");
}

async function mapPoint(page) {
  return page.evaluate(() => {
    const map = document.querySelector(".map").getBoundingClientRect();
    const free = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el && el.closest(".leaflet-container") && !el.closest(".leaflet-control-container, .leaflet-marker-icon");
    };
    for (const fy of [0.45, 0.35, 0.55, 0.25, 0.65]) {
      for (const fx of [0.7, 0.6, 0.8, 0.5, 0.4, 0.3]) {
        const x = map.left + map.width * fx;
        const y = map.top + map.height * fy;
        if (free(x, y)) return { x, y };
      }
    }
    // A very small window (400% zoom): any free spot will do.
    for (let y = map.top + 4; y < map.bottom; y += 4)
      for (let x = map.left + 4; x < map.right; x += 4) if (free(x, y)) return { x, y };
    throw new Error("No free point on the map");
  });
}

async function openReports(page, compact) {
  if (compact) await page.click(".rail-reports");
  await page.waitForSelector(".report-list .report-row");
}

async function startReportAt(page, onPin) {
  await page.click(".report-button");
  await page.waitForSelector(".pick-banner");
  if (onPin) {
    // In pick mode a tap on a pin places the new pin there: the form then
    // lists the sightings already reported nearby.
    const pin = await page.evaluate(() => {
      for (const el of document.querySelectorAll(".pin-icon")) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        if (top && el.contains(top)) return { x, y };
      }
      return null;
    });
    if (pin) await page.mouse.click(pin.x, pin.y);
    else {
      // No pin in sight (400% zoom): place it at the map's center with the
      // keyboard. The sightings are around the center.
      await page.focus(".map-shell .leaflet-container");
      await page.keyboard.press("Enter");
    }
  } else {
    const { x, y } = await mapPoint(page);
    await page.mouse.click(x, y);
  }
  await page.getByRole("button", { name: "Use this spot" }).click();
  await page.waitForSelector(".modal .report-form");
}

const STEPS = {
  async home() {},
  async "map-only"(page, { compact }) {
    await page.click(compact ? ".rail-home" : ".rail-reports");
  },
  async alert(page, { compact }) {
    await openReports(page, compact);
    await page.click(".report-list .report-row");
    await page.waitForSelector(".detail-card");
  },
  async "reports-nearby"(page, { compact }) {
    await openReports(page, compact);
  },
  // A row stays pressed while its card is open (phones: open the list again).
  async "reports-selected"(page, { compact, layout }) {
    if (layout === "tablet") return false;
    await openReports(page, compact);
    await page.click(".report-list .report-row");
    await page.waitForSelector(".detail-card");
    if (compact) await page.click(".rail-reports");
    await page.waitForSelector('.report-row[aria-pressed="true"]');
  },
  async "reports-search"(page, { layout }) {
    if (layout !== "phone") return false;
    await openReports(page, true);
    await page.click(".panel-tabs button:nth-child(2)");
    await page.waitForSelector(".search-pane", { state: "visible" });
  },
  async "search-results"(page, { layout }) {
    if (layout === "phone") {
      await openReports(page, true);
      await page.click(".panel-tabs button:nth-child(2)");
    }
    await page.fill(".search input", "city hall");
    await page.press(".search input", "Enter");
    await page.waitForSelector(".search-results button");
  },
  async pick(page) {
    await page.click(".report-button");
    await page.waitForSelector(".pick-banner");
  },
  async name(page) {
    await openSettings(page);
    await page.getByRole("button", { name: "Add a place" }).click();
    await page.waitForSelector(".pick-banner");
    const { x, y } = await mapPoint(page);
    await page.mouse.click(x, y);
    await page.waitForSelector(".place-form");
  },
  async "report-form"(page) {
    await startReportAt(page, false);
  },
  async "report-nearby"(page) {
    await startReportAt(page, true);
    await page.waitForSelector(".modal .nearby");
  },
  async "report-error"(page) {
    await startReportAt(page, false);
    await page.click(".report-submit");
    await page.waitForSelector(".modal .form-error");
  },
  async settings(page) {
    await openSettings(page);
  },
  async policy(page) {
    await openSettings(page);
    await page.click('[data-opens="policy"]');
    await page.waitForSelector(".modal .policy");
  },
  async clear(page) {
    await openSettings(page);
    await page.click('[data-opens="clear"]');
    await page.waitForSelector(".modal .form");
  },
  async delete(page) {
    await openSettings(page);
    await page.click('[data-opens="delete"]');
    await page.waitForSelector(".modal .form");
  },
  async login(page) {
    await openSettings(page);
    await page.click('[data-opens="login"]');
    await page.waitForSelector(".account-form");
  },
  async "login-error"(page) {
    await STEPS.login(page);
    await page.click('.account-form button[type="submit"]');
    await page.waitForSelector(".account-form .form-error");
  },
  async save(page) {
    await openSettings(page);
    await page.click('[data-opens="save"]');
    await page.waitForSelector(".account-form");
  },
  async "save-error"(page) {
    await STEPS.save(page);
    await page.click('.account-form button[type="submit"]');
    await page.waitForSelector(".account-form .form-error");
  },
  async rights(page) {
    await page.click(".rail-rights");
    await page.waitForSelector(".modal .resource-list");
  },
};

// --- The checks, run in the page -------------------------------------------

// Contrast, targets and reflow. Returns { contrast, targets, reflow, counts }.
function inPageChecks() {
  const parse = (text) => {
    if (!text || text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    let m = text.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] ?? 1 };
    }
    m = text.match(/^color\(srgb ([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
    }
    return null;
  };
  const over = (top, bottom) => {
    const ch = (c) => top.a * top[c] + (1 - top.a) * bottom[c];
    return { r: ch("r"), g: ch("g"), b: ch("b"), a: 1 };
  };
  const lum = ({ r, g, b }) => {
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (fg, bg) => {
    const solid = fg.a < 1 ? over(fg, bg) : fg;
    const [a, b] = [lum(solid), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  const WHITE = { r: 1, g: 1, b: 1, a: 1 };
  const BLACK = { r: 0, g: 0, b: 0, a: 1 };

  const name = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) {
      const cls = typeof e.className === "string" ? e.className.trim().split(/\s+/)[0] : "";
      parts.unshift(cls ? `${e.tagName.toLowerCase()}.${cls}` : e.tagName.toLowerCase());
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  };
  const shown = (el) => {
    if (!el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (el.closest(".visually-hidden, [aria-hidden='true'] .visually-hidden")) return false;
    if (s.clipPath && s.clipPath.startsWith("inset(50%")) return false;
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  // Is el what you see at its own centre (not under a dialog or a sheet)?
  const onTop = (el, rect = el.getBoundingClientRect()) => {
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    return Boolean(top && (top === el || el.contains(top) || top.contains(el) || top.closest("label")?.contains(el)));
  };
  const inactive = (el) =>
    Boolean(el.closest("[inert], [aria-disabled='true'], :disabled, fieldset:disabled"));

  // What's behind el: an opaque colour, or { see: "glass" | "map", layers }.
  // Glass (a gradient or backdrop filter on the way) is proved by
  // glass-contrast.mjs. The map is measured over white and over black.
  const backdrop = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (e.classList.contains("leaflet-container") || e.classList.contains("map-shell"))
        return { see: "map", layers };
      if (e.classList.contains("lava") || e.querySelector(":scope > .lava")) {
        const bg = parse(s.backgroundColor);
        if (!bg || bg.a < 1) return { see: "glass" };
      }
      const filter = s.backdropFilter || s.webkitBackdropFilter;
      if ((filter && filter !== "none") || (s.backgroundImage !== "none" && !s.backgroundImage.startsWith("url(")))
        return { see: "glass" };
      const bg = parse(s.backgroundColor);
      if (bg === null) return { see: "glass" };
      if (bg.a > 0) layers.push(bg);
      if (bg.a >= 1) break;
    }
    let color = layers.length && layers.at(-1).a >= 1 ? layers.at(-1) : null;
    if (!color) return { see: "map", layers };
    for (let i = layers.length - 2; i >= 0; i--) color = over(layers[i], color);
    return { color };
  };
  const ratios = (fg, back) => {
    if (back.color) return [ratio(fg, back.color)];
    const flat = (base) => back.layers.reduceRight((c, layer) => over(layer, c), base);
    return [ratio(fg, flat(WHITE)), ratio(fg, flat(BLACK))];
  };

  const contrast = [];
  const counts = { text: 0, icon: 0, edge: 0, glass: 0, targets: 0 };
  const report = (kind, el, value, need, extra) =>
    contrast.push({ kind, at: name(el), value: Math.round(value * 100) / 100, need, extra });

  // Text: every element with its own visible text.
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("script, style, noscript, svg, .visually-hidden")) continue;
    if (!shown(el) || inactive(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || !onTop(el, rect)) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) continue;
    const back = backdrop(el);
    if (back.see === "glass") {
      counts.glass++;
      continue;
    }
    counts.text++;
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const value = Math.min(...ratios({ ...fg, a: fg.a * parseFloat(s.opacity) }, back));
    if (value < need) report("text", el, value, need, back.color ? "" : "over the map");
  }

  // Icons: SVGs in controls and the status chips and dots.
  for (const svg of document.querySelectorAll("svg")) {
    // Icons that carry meaning: the only content of a control, or a status
    // or place chip. An icon beside a control's words is decoration.
    const chip = svg.closest(".row-icon, .list-empty-icon, .place-icon, .rights-card-icon");
    const control = svg.closest("button, a");
    const words = control
      ? [...control.childNodes].some((n) => (n.nodeType === 3 ? n.textContent.trim() : n.matches?.(":not(svg):not(.visually-hidden)") && n.textContent.trim()))
      : false;
    if (!chip && (!control || words)) continue;
    if (!shown(svg) || inactive(svg) || !onTop(svg)) continue;
    if (svg.closest(".leaflet-marker-icon, .leaflet-container .leaflet-pane")) continue;
    const shape = svg.querySelector("path, circle, rect");
    const ss = shape ? getComputedStyle(shape) : null;
    const paint =
      ss && ss.stroke !== "none" && parse(ss.stroke)?.a ? ss.stroke : ss && ss.fill !== "none" ? ss.fill : getComputedStyle(svg).color;
    const fg = parse(paint) ?? parse(getComputedStyle(svg).color);
    const back = backdrop(svg.parentElement);
    if (!fg || back.see === "glass") {
      counts.glass++;
      continue;
    }
    counts.icon++;
    const value = Math.min(...ratios(fg, back));
    if (value < 3) report("icon", svg, value, 3, back.color ? "" : "over the map");
  }
  for (const dot of document.querySelectorAll(".stat-dot")) {
    if (!shown(dot) || !onTop(dot)) continue;
    const back = backdrop(dot.parentElement);
    if (back.see === "glass") {
      counts.glass++;
      continue;
    }
    counts.icon++;
    const value = Math.min(...ratios(parse(getComputedStyle(dot).backgroundColor), back));
    if (value < 3) report("icon", dot, value, 3);
  }

  // Edges of text boxes, choice cards, the search box and the switch: an
  // edge (border or shadow) or the box's own fill must reach 3:1 against
  // what's around it.
  const edgeColors = (s) => {
    const out = [];
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none") {
        const c = parse(s[`border${side}Color`]);
        if (c?.a) out.push(c);
      }
    }
    if (s.boxShadow !== "none") {
      for (const part of s.boxShadow.split(/,(?![^(]*\))/)) {
        const color = part.match(/(rgba?\([^)]*\)|color\([^)]*\))/)?.[1];
        const lengths = part.replace(/(rgba?\([^)]*\)|color\([^)]*\))/, "").match(/-?[\d.]+px/g) ?? [];
        const spread = parseFloat(lengths[3] ?? "0");
        if (color && spread > 0) {
          const c = parse(color);
          if (c?.a) out.push(c);
        }
      }
    }
    return out;
  };
  const fields = document.querySelectorAll(
    'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), textarea, select, .report-form .choice, .search-field, .switch-track',
  );
  for (const field of fields) {
    if (!shown(field) || inactive(field) || !onTop(field)) continue;
    if (field.closest(".search-field") && field !== field.closest(".search-field")) continue;
    const around = backdrop(field.parentElement);
    if (around.see === "glass") {
      counts.glass++;
      continue;
    }
    counts.edge++;
    const s = getComputedStyle(field);
    const fill = parse(s.backgroundColor);
    const candidates = [...edgeColors(s)];
    if (fill?.a) candidates.push(fill);
    const best = candidates.length ? Math.max(...candidates.map((c) => Math.min(...ratios(c, around)))) : 1;
    if (best < 3) report("edge", field, best, 3, around.color ? "" : "over the map");
  }

  // Targets (2.5.8).
  const targets = [];
  const candidates = document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), textarea, select, [role="button"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])',
  );
  for (const el of candidates) {
    if (inactive(el)) continue;
    if (el.matches(".leaflet-marker-icon, .leaflet-container, .consent-text, .skip-link:not(:focus)")) continue;
    // Map credits: links inside a line of text (the inline exception).
    if (el.closest(".leaflet-control-attribution")) continue;
    let rect = el.getBoundingClientRect();
    // A field inside its label: the label takes the tap too.
    const label = el.closest("label");
    if (label && el.matches("input, textarea, select")) {
      const l = label.getBoundingClientRect();
      if (getComputedStyle(el).opacity === "0" || el.closest(".switch")) rect = l;
      else
        rect = new DOMRect(
          Math.min(rect.left, l.left),
          Math.min(rect.top, l.top),
          Math.max(rect.right, l.right) - Math.min(rect.left, l.left),
          Math.max(rect.bottom, l.bottom) - Math.min(rect.top, l.top),
        );
    }
    const probe = label && getComputedStyle(el).opacity === "0" ? label : el;
    if (!shown(probe) || !onTop(probe, rect)) continue;
    // Inline: a link or button in a sentence (a <p> with other text).
    const sentence = el.closest("p, li");
    const inline =
      el.matches("a, button") &&
      sentence &&
      sentence.textContent.trim().length > el.textContent.trim().length + 3 &&
      getComputedStyle(el).display.startsWith("inline");
    targets.push({ el, rect, inline });
  }
  counts.targets = targets.length;
  const small = targets.filter((t) => !t.inline && (t.rect.width < 23.95 || t.rect.height < 23.95));
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const circleHitsRect = (c, r) => {
    const x = Math.max(r.left, Math.min(c.x, r.right));
    const y = Math.max(r.top, Math.min(c.y, r.bottom));
    return Math.hypot(c.x - x, c.y - y) < 12 - 0.01;
  };
  const targetFails = [];
  for (const t of small) {
    const c = centre(t.rect);
    const clash = targets.find((o) => {
      if (o === t || o.el.contains(t.el) || t.el.contains(o.el)) return false;
      if (circleHitsRect(c, o.rect)) return true;
      const isSmall = small.includes(o);
      return isSmall && Math.hypot(c.x - centre(o.rect).x, c.y - centre(o.rect).y) < 24 - 0.01;
    });
    targetFails.push({
      at: name(t.el),
      size: `${Math.round(t.rect.width * 10) / 10}x${Math.round(t.rect.height * 10) / 10}`,
      spaced: !clash,
      clash: clash ? `${name(clash.el)} [${clash.el.tagName} ${Math.round(clash.rect.width)}x${Math.round(clash.rect.height)}]` : "",
    });
  }

  // Reflow: the page and every scroll box with sideways overflow.
  const reflow = [];
  const doc = document.scrollingElement;
  if (doc.scrollWidth > innerWidth + 1) reflow.push(`page ${doc.scrollWidth}px wide in ${innerWidth}px`);
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest(".leaflet-container")) continue;
    const s = getComputedStyle(el);
    if (!["auto", "scroll"].includes(s.overflowX)) continue;
    if (el.scrollWidth > el.clientWidth + 1 && shown(el))
      reflow.push(`${name(el)} scrolls sideways (${el.scrollWidth}px in ${el.clientWidth}px)`);
  }

  return { contrast, small: targetFails, reflow, counts };
}

// Text that is cut off by its own box or by a box around it that doesn't
// scroll. Returns { key: description } for every cut-off text element.
function clippedText() {
  const out = {};
  const name = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 3; e = e.parentElement) {
      const cls = typeof e.className === "string" ? e.className.trim().split(/\s+/)[0] : "";
      parts.unshift(cls ? `${e.tagName.toLowerCase()}.${cls}` : e.tagName.toLowerCase());
    }
    return parts.join(" > ");
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const done = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || done.has(el) || el.closest("script, style, svg, .visually-hidden, .skip-link:not(:focus), .leaflet-container")) continue;
    done.add(el);
    if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden") continue;
    if (el.closest("[inert]")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    if (text.width < 1) continue;
    // Cut short with a button that shows the rest (the alert card's
    // heading): nothing is lost.
    if (el.closest(".detail-head")?.querySelector('.detail-title-toggle[aria-expanded="false"]')) continue;
    // Its own box: an ellipsis or a line clamp.
    const own = getComputedStyle(el);
    if (["hidden", "clip"].includes(own.overflowX) || ["hidden", "clip"].includes(own.overflowY)) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
        out[`${name(el)}|${node.textContent.trim().slice(0, 24)}`] = "cut off by its own box";
        continue;
      }
    }
    // A box around it that hides what spills over and doesn't scroll.
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      const hides = (v) => v === "hidden" || v === "clip";
      if (!hides(s.overflowX) && !hides(s.overflowY)) continue;
      const box = a.getBoundingClientRect();
      const cut =
        (hides(s.overflowX) && (text.left < box.left - 1 || text.right > box.right + 1)) ||
        (hides(s.overflowY) && (text.top < box.top - 1 || text.bottom > box.bottom + 1));
      if (cut) out[`${name(el)}|${node.textContent.trim().slice(0, 24)}`] = `cut off by ${name(a)}`;
      break;
    }
  }
  return out;
}

const SPACING = `
  *:not(.leaflet-container):not(.leaflet-container *) {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

// --- Running ---------------------------------------------------------------

const problems = [];
const notes = new Map();
const totals = { states: 0, text: 0, icon: 0, edge: 0, glass: 0, targets: 0 };

async function audit(page, where) {
  await settle(page);
  totals.states++;
  const note = (text) => {
    if (!notes.has(text)) notes.set(text, where);
  };
  const result = await page.evaluate(inPageChecks);
  for (const key of ["text", "icon", "edge", "glass", "targets"]) totals[key] += result.counts[key];
  for (const c of result.contrast)
    problems.push(`${where}: contrast ${c.kind} ${c.value}:1 (needs ${c.need}:1) ${c.at}${c.extra ? `, ${c.extra}` : ""}`);
  for (const t of result.small) {
    if (t.spaced) note(`target ${t.at} ${t.size}, spaced (2.5.8 spacing exception)`);
    else problems.push(`${where}: target ${t.size} ${t.at}, its 24px circle touches ${t.clash}`);
  }
  for (const r of result.reflow) {
    if (where.includes(" 320x")) problems.push(`${where}: reflow: ${r}`);
    else note(`reflow: ${r}`);
  }

  // Text spacing.
  const before = await page.evaluate(clippedText);
  const style = await page.addStyleTag({ content: SPACING });
  // Long enough for the alert card to notice its heading is cut short.
  await page.waitForTimeout(400);
  const after = await page.evaluate(clippedText);
  await style.evaluate((node) => node.remove());
  for (const [key, how] of Object.entries(after)) {
    if (!(key in before))
      problems.push(`${where}: text spacing cuts off "${key.split("|")[1]}" (${key.split("|")[0]}, ${how})`);
  }
  for (const [key, how] of Object.entries(before))
    note(`cut short at rest: "${key.split("|")[1]}…" ${key.split("|")[0]} (${how})`);
}

async function auditSize(browser, size, scheme) {
  const [width, height] = size.split("x").map(Number);
  const contextOptions = {
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: scheme,
    hasTouch: width < 1280,
    timezoneId: "UTC",
    locale: "en-US",
  };
  const context = await browser.newContext(contextOptions);
  await context.addInitScript(() => localStorage.setItem("icepik.location", "denied"));
  const page = await context.newPage();
  await guard(page);
  page.on("pageerror", (error) => console.error(`  ${size} ${scheme}: page error: ${firstLine(error)}`));

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".consent-card");
  if (states.includes("consent")) await audit(page, `${size} ${scheme} consent`);
  await passConsent(page);
  await page.waitForSelector(".pin-icon", { state: "attached" });
  const layout = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue("--layout").trim() || "desktop",
  );
  const compact = layout !== "desktop";

  for (const state of states) {
    if (state === "consent" || state === "starter") continue;
    await openApp(page);
    try {
      if ((await STEPS[state](page, { layout, compact })) === false) continue;
      await audit(page, `${size} ${scheme} ${state}`);
    } catch (error) {
      problems.push(`${size} ${scheme} ${state}: state could not be reached (${firstLine(error)})`);
    }
  }
  const storage = await context.storageState();
  await context.close();

  if (states.includes("starter")) {
    const policy = storage.origins
      .flatMap((o) => o.localStorage)
      .find((item) => item.name === "icepik.policy-version");
    const starter = await browser.newContext(contextOptions);
    await starter.addInitScript(
      ({ version }) => {
        localStorage.setItem("icepik.policy-version", version);
        localStorage.setItem("icepik.location", "denied");
      },
      { version: policy?.value ?? "" },
    );
    const sp = await starter.newPage();
    await guard(sp);
    await sp.route("**/auth/v1/signup**", () => {});
    await sp.goto(url, { waitUntil: "domcontentloaded" });
    await sp.waitForSelector(".starter");
    await audit(sp, `${size} ${scheme} starter`);
    await starter.close();
  }
}

for (const [name, target] of [
  ["app", url],
  ["stand-in database", "http://127.0.0.1:54321/rest/v1/sightings"],
]) {
  try {
    await fetch(target);
  } catch {
    console.error(`The ${name} isn't running on ${target}. See the top of this file.`);
    process.exit(2);
  }
}

const browser = await chromium.launch();
const jobs = sizes.flatMap((size) =>
  (NARROW.includes(size) ? schemes.slice(0, 1) : schemes).map((scheme) => [size, scheme]),
);
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      await auditSize(browser, ...job);
      console.log(`checked ${job[0]} ${job[1]}`);
    }
  }),
);
await browser.close();

console.log(
  `\n${totals.states} screen states: ${totals.text} text elements, ${totals.icon} icons and ` +
    `${totals.edge} field edges measured on opaque surfaces (${totals.glass} on glass, ` +
    `proved by glass-contrast.mjs); ${totals.targets} pointer targets.`,
);
if (notes.size && verbose) {
  console.log(`\nNotes (not failures):`);
  for (const [note, where] of notes) console.log(`  ${note}  [first seen: ${where}]`);
} else if (notes.size) {
  console.log(`${notes.size} notes (not failures); --verbose lists them.`);
}
if (problems.length || glassFailed) {
  console.log(`\n${problems.length + (glassFailed ? 1 : 0)} failure(s):`);
  for (const line of problems) console.log(`  ${line}`);
  process.exit(1);
}
console.log("\nNo failures.");
