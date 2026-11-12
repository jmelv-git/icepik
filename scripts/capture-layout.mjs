// Records where the key elements of ICEPik sit, so a style change can prove
// that nothing moved or changed size.
//
//   node scripts/capture-layout.mjs              write scripts/layout-baseline.json
//   node scripts/capture-layout.mjs --compare    compare with it; exit 1 on any
//                                                difference above 1 px
//
// Options: --sizes 1280x800,390x844  --schemes light,dark  --states home,alert
//          --url http://127.0.0.1:3000  --shots <dir>  --tolerance 1
//
// Needs the app on --url, built and started against the stand-in database
// (scripts/mock-supabase.mjs on port 54321); see "Verification setup" in
// PLAN.md. Map tiles are blocked (a blank map is the worst case for
// contrast, and it saves the map's quota), and the place search and reverse
// lookup are stubbed, so nothing here reaches CARTO or Nominatim. Nothing
// about the network is recorded: only element boxes. Screenshots go outside
// the repo (to --shots, default <tmp>/icepik-capture/<baseline|current>).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(here, "layout-baseline.json");

const SIZES = ["1280x800", "1024x768", "820x1180", "768x1024", "390x844", "360x667", "844x390"];
const SCHEMES = ["light", "dark"];
const STATES = [
  "consent",
  "home",
  "map-only",
  "alert",
  "reports-nearby",
  "reports-search",
  "pick",
  "name",
  "report-form",
  "settings",
  "login",
  "save",
  "rights",
  "starter",
];

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 ? process.argv[at + 1] : fallback;
}
const list = (value, all) => (value ? value.split(",").filter((v) => all.includes(v)) : all);

const compare = process.argv.includes("--compare");
const url = option("url", "http://127.0.0.1:3000");
const sizes = list(option("sizes"), SIZES);
const schemes = list(option("schemes"), SCHEMES);
const states = list(option("states"), STATES);
const tolerance = Number(option("tolerance", "1"));
const shots = option("shots", join(tmpdir(), "icepik-capture", compare ? "current" : "baseline"));

// Key elements: [name, selector, how many (1 = first only, Infinity = all)].
const KEYS = [
  ["map", ".map", 1],
  ["rail", ".rail", 1],
  ["rail-item", ".rail-item", Infinity],
  ["brand-logo", ".rail .brand-logo", 1],
  ["panel", ".panel", 1],
  ["search", ".search", 1],
  ["search-field", ".search-field", 1],
  ["panel-settings", ".panel-settings", 1],
  ["panel-tab", ".panel-tabs button", Infinity],
  ["panel-cards", ".panel-cards", 1],
  ["card", ".panel-cards .card", Infinity],
  ["report-row", ".report-list .report-row", 3],
  ["detail-card", ".detail-card", 1],
  ["detail-part", ".detail-card > *", Infinity],
  ["map-controls", ".map-controls", 1],
  ["map-control", ".map-control", Infinity],
  ["report-button", ".report-button", 1],
  ["pick-banner", ".pick-banner", 1],
  ["pick-banner-button", ".pick-banner button", Infinity],
  ["starter", ".starter", 1],
  ["modal-layer", ".modal-layer:not([hidden])", 1],
  ["modal", ".modal-layer:not([hidden]) .modal", 1],
  ["modal-head", ".modal-layer:not([hidden]) .modal-head", 1],
  ["modal-title", ".modal-layer:not([hidden]) .modal-head h2", 1],
  ["modal-close", ".modal-layer:not([hidden]) .modal-head button", 1],
  [
    "modal-field",
    '.modal-layer:not([hidden]) .modal :is(input:not([type="radio"]), textarea, select)',
    1,
  ],
  ["modal-choice", ".modal-layer:not([hidden]) .modal .choice", 1],
  ["modal-action", ".modal-layer:not([hidden]) .modal .form-actions button", Infinity],
  ["account-form", ".account-form", 1],
  ["auth-logo", ".account-form .auth-logo", 1],
  ["consent-card", ".consent-card", 1],
  ["consent-logo", ".consent-logo", 1],
  ["consent-text", ".consent-text", 1],
  ["consent-agree", ".consent-agree", 1],
];

const SEARCH_RESULTS = [
  { display_name: "City Hall, Philadelphia, Pennsylvania", lat: "39.9524", lon: "-75.1636" },
  {
    display_name: "Rittenhouse Square, Philadelphia, Pennsylvania",
    lat: "39.9496",
    lon: "-75.1718",
  },
];

async function guard(page) {
  // Never load map tiles here, and never reach the place search service.
  await page.route("**/*cartocdn.com/**", (route) => route.abort());
  await page.route("**/api/search**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(SEARCH_RESULTS) }),
  );
  await page.route("**/api/reverse**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ label: "Market Street" }),
    }),
  );
  // "On the map until 11:30 PM": the same text, so the same width, at any hour.
  await page.route("**/rest/v1/sightings**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    let response;
    try {
      response = await route.fetch();
    } catch (error) {
      // Only the first line: the rest of Playwright's message lists the
      // request's headers, which are never to be printed.
      console.error(`  stand-in database: ${error.message.split("\n")[0]}`);
      return route.abort();
    }
    const until = new Date();
    until.setUTCHours(23, 30, 0, 0);
    if (until <= new Date()) until.setUTCDate(until.getUTCDate() + 1);
    const rows = (await response.json()).map((row) => ({
      ...row,
      expires_at: until.toISOString(),
    }));
    await route.fulfill({ response, body: JSON.stringify(rows) });
  });
}

// Wait until every transition and entrance has finished and the page is still.
async function settle(page) {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}));
    await Promise.race([Promise.all(running), new Promise((r) => setTimeout(r, 3000))]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(350);
  await page.evaluate(async () => {
    // Endless animations (the lava lamp) never finish: skip them here too.
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => {})));
  });
}

async function passConsent(page) {
  await page.waitForSelector(".consent-text");
  // Scroll to the end on every poll: a scroll before the page has hydrated
  // is missed by the observer that enables "I agree".
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
  // The anonymous account is ready: Submit a report works.
  await page.waitForFunction(() => !document.querySelector(".starter"));
  await settle(page);
}

const visible = (page, selector) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
    return Boolean(el && getComputedStyle(el).visibility !== "hidden");
  }, selector);

async function openSettings(page) {
  const button = (await visible(page, ".rail-settings")) ? ".rail-settings" : ".panel-settings";
  await page.click(button);
  await page.waitForSelector(".modal .settings");
}

// A point on the map that nothing floats over.
async function mapPoint(page) {
  return page.evaluate(() => {
    const map = document.querySelector(".map").getBoundingClientRect();
    for (const fy of [0.45, 0.35, 0.55, 0.25, 0.65]) {
      for (const fx of [0.7, 0.6, 0.8, 0.5, 0.4, 0.3]) {
        const x = map.left + map.width * fx;
        const y = map.top + map.height * fy;
        const el = document.elementFromPoint(x, y);
        if (el && el.closest(".leaflet-container") && !el.closest(".leaflet-control-container"))
          return { x, y };
      }
    }
    throw new Error("No free point on the map");
  });
}

async function openReports(page, compact) {
  if (compact) await page.click(".rail-reports");
  await page.waitForSelector(".report-list .report-row");
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
  async "reports-search"(page, { layout }) {
    if (layout !== "phone") return false;
    await openReports(page, true);
    await page.click(".panel-tabs button:nth-child(2)");
    await page.waitForSelector(".search-pane", { state: "visible" });
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
    await page.click(".report-button");
    await page.waitForSelector(".pick-banner");
    const { x, y } = await mapPoint(page);
    await page.mouse.click(x, y);
    await page.getByRole("button", { name: "Use this spot" }).click();
    await page.waitForSelector(".modal .report-form");
  },
  async settings(page) {
    await openSettings(page);
  },
  async login(page) {
    await openSettings(page);
    await page.click('[data-opens="login"]');
    await page.waitForSelector(".account-form");
  },
  async save(page) {
    await openSettings(page);
    await page.click('[data-opens="save"]');
    await page.waitForSelector(".account-form");
  },
  async rights(page) {
    await page.click(".rail-rights");
    await page.waitForSelector(".modal .resource-list");
  },
};

async function measure(page) {
  return page.evaluate((keys) => {
    const out = {};
    const round = (n) => Math.round(n * 100) / 100;
    for (const [name, selector, count] of keys) {
      // The rail holds two logos and shows one: measure the one on screen.
      const all = [...document.querySelectorAll(selector)];
      const shown = all.filter((e) => e.getClientRects().length);
      const els = (count === 1 && shown.length ? shown : all).slice(0, count);
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const key = count === 1 ? name : `${name}[${i}]`;
        out[key] = { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
      });
    }
    return out;
  }, KEYS);
}

async function captureSize(browser, size, scheme) {
  const [width, height] = size.split("x").map(Number);
  const contextOptions = {
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: scheme,
    hasTouch: width < 1280,
    timezoneId: "UTC",
    locale: "en-US",
  };
  const result = {};
  const dir = join(shots, `${size}-${scheme}`);
  mkdirSync(dir, { recursive: true });
  const record = async (page, state) => {
    await settle(page);
    result[state] = await measure(page);
    await page.screenshot({ path: join(dir, `${state}.png`) });
  };

  // Location: answered "no" before, so no prompt or notice appears.
  const noLocation = () => localStorage.setItem("icepik.location", "denied");

  const context = await browser.newContext(contextOptions);
  await context.addInitScript(noLocation);
  const page = await context.newPage();
  await guard(page);
  page.on("pageerror", (error) =>
    console.error(`  ${size} ${scheme}: page error: ${error.message}`),
  );

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".consent-card");
  if (states.includes("consent")) await record(page, "consent");
  await passConsent(page);
  await page.waitForSelector(".pin-icon", { state: "attached" });

  const layout = await page.evaluate(
    () =>
      getComputedStyle(document.documentElement).getPropertyValue("--layout").trim() || "desktop",
  );
  const compact = layout !== "desktop";

  for (const state of states) {
    if (state === "consent" || state === "starter") continue;
    await openApp(page);
    try {
      if ((await STEPS[state](page, { layout, compact })) === false) continue;
      await record(page, state);
    } catch (error) {
      console.error(`  ${size} ${scheme} ${state}: ${error.message.split("\n")[0]}`);
      result[state] = { error: true };
    }
  }
  const storage = await context.storageState();
  await context.close();

  // The account set-up message: the sign-up request is held, so it stays.
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
    await record(sp, "starter");
    await starter.close();
  }
  return result;
}

function diff(before, after) {
  const lines = [];
  for (const key of Object.keys(after)) {
    const [size, scheme] = key.split("|");
    for (const state of Object.keys(after[key])) {
      const b = before[key]?.[state];
      const a = after[key][state];
      const where = `${size} ${scheme} ${state}`;
      if (!b) {
        lines.push(`${where}: not in the baseline`);
        continue;
      }
      if (a.error || b.error) {
        if (a.error !== b.error) lines.push(`${where}: state could not be reached`);
        continue;
      }
      for (const el of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (!a[el]) lines.push(`${where} ${el}: missing (was ${JSON.stringify(b[el])})`);
        else if (!b[el]) lines.push(`${where} ${el}: new (${JSON.stringify(a[el])})`);
        else {
          const moved = ["x", "y", "w", "h"]
            .filter((p) => Math.abs(a[el][p] - b[el][p]) > tolerance)
            .map((p) => `${p} ${b[el][p]} -> ${a[el][p]}`);
          if (moved.length) lines.push(`${where} ${el}: ${moved.join(", ")}`);
        }
      }
    }
  }
  return lines;
}

// Errors print their first line only: Playwright's call logs can hold
// request headers.
process.on("unhandledRejection", (error) => {
  console.error(String(error?.message ?? error).split("\n")[0]);
  process.exit(2);
});

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
const positions = {};
const jobs = sizes.flatMap((size) => schemes.map((scheme) => [size, scheme]));
// A few at a time: each job is one browser context.
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [size, scheme] = job;
      positions[`${size}|${scheme}`] = await captureSize(browser, size, scheme);
      console.log(`captured ${size} ${scheme}`);
    }
  }),
);
await browser.close();

if (compare) {
  if (!existsSync(BASELINE)) {
    console.error("No baseline: run without --compare first.");
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  const lines = diff(baseline.positions, positions);
  console.log(
    `Compared with the baseline from commit ${baseline.commit} (tolerance ${tolerance} px).`,
  );
  console.log(`Screenshots: ${shots}`);
  if (lines.length) {
    console.log(`${lines.length} difference(s):`);
    for (const line of lines) console.log(`  ${line}`);
    process.exit(1);
  }
  const count = Object.values(positions).reduce((n, s) => n + Object.keys(s).length, 0);
  console.log(`No differences in ${count} screen states.`);
} else {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: here }).toString().trim();
  const ordered = Object.fromEntries(
    jobs.map(([size, scheme]) => [`${size}|${scheme}`, positions[`${size}|${scheme}`]]),
  );
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ commit, created: new Date().toISOString(), tolerance, positions: ordered }, null, 1)}\n`,
  );
  console.log(`Baseline written from commit ${commit}. Screenshots: ${shots}`);
}
