// Proves that text and icons on ICEPik's glass surfaces stay readable.
//
//   node scripts/glass-contrast.mjs               check; exit 1 if anything fails
//   node scripts/glass-contrast.mjs --find-tint   also find the lowest --glass-tint
//                                                 percentage that passes with 0.1 to spare
//   node scripts/glass-contrast.mjs --find-lamp   also find the lowest --glass-tint-lamp
//                                                 percentage and the highest phone lamp
//                                                 strength that pass with 0.1 to spare
//
// The method (per colour channel, sRGB from 0 to 1):
//   1. Start from the backdrop: pure white (an almost-white map) and, for
//      the focus ring and the edges of fields, pure black as well.
//   2. Lay the glass tint over it: v = a * T + (1 - a) * v. The blur is not
//      counted, so a missing or late blur can never break contrast.
//   3. Lay the glow (--glass-glow) over that at its brightest stop, as if
//      all text sat in the top of the card.
//   4. For a hovered or pressed row, lay --glass-hover or --glass-pressed
//      over the result. For a status icon or an error message, lay its chip.
//   5. Compute the WCAG contrast ratio of the foreground against the result.
//
// The lava lamp (consent, Log in and Save account) has its own backdrop:
//   - the lamp bound: per channel, the highest of --lava-base and the four
//     blob colours (on phones each blob is first mixed with --lava-base by
//     --lava-strength-phone);
//   - the top of the account views' fade: white (an almost-white map)
//     through the brightness() at the end of --lava-backdrop, under the most
//     see-through stop of --lava-fade.
// --glass-tint-lamp goes over that; the blur is not counted.
//
// Every value comes from the :root block of app/globals.css; the script
// fails if a token it needs is missing. Foregrounds that are not tokens are
// the colours the rules use today (see the table in each surface below).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "app", "globals.css"), "utf8");

const NEEDED = [
  "--surface",
  "--text",
  "--muted",
  "--subtle",
  "--link",
  "--red",
  "--yellow",
  "--blue",
  "--glass-ink",
  "--glass-tint",
  "--glass-glow",
  "--glass-blur",
  "--glass-filter",
  "--glass-line",
  "--glass-shine",
  "--glass-shadow",
  "--glass-hover",
  "--glass-pressed",
  "--overlay-tint",
  "--overlay-filter",
  "--control-line",
  "--card",
  "--blue-strong",
  "--lava-base",
  "--lava-1",
  "--lava-2",
  "--lava-3",
  "--lava-4",
  "--lava-strength-phone",
  "--lava-fade",
  "--lava-backdrop",
  "--glass-tint-lamp",
];

// --- Reading the tokens --------------------------------------------------

function rootTokens(source) {
  const start = source.search(/(^|\n):root\s*\{/);
  if (start < 0) throw new Error("No :root block in app/globals.css");
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    else if (source[end] === "}" && --depth === 0) break;
  }
  const body = source.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].replace(/\s+/g, " ").trim();
  }
  return tokens;
}

const tokens = rootTokens(css);
const missing = NEEDED.filter((name) => !(name in tokens));
if (missing.length) {
  console.error(`Missing from :root in app/globals.css: ${missing.join(", ")}`);
  process.exit(2);
}

// Colours are { r, g, b, a } with every channel from 0 to 1.
const NAMED = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

// Split on commas or spaces that are not inside brackets.
function split(text, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && (separator === " " ? /\s/.test(ch) : ch === separator)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function inner(text, name) {
  if (!text.startsWith(`${name}(`) || !text.endsWith(")")) return null;
  return text.slice(name.length + 1, -1);
}

function parseColor(text, overrides = {}) {
  text = text.trim();
  const v = inner(text, "var");
  if (v !== null) {
    const name = v.trim();
    const value = overrides[name] ?? tokens[name];
    if (value === undefined) throw new Error(`Unknown token ${name}`);
    return parseColor(value, overrides);
  }
  if (NAMED[text]) return NAMED[text];
  if (text.startsWith("#")) {
    let hex = text.slice(1);
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
    const n = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) : 1 };
  }
  const rgb = inner(text, "rgb") ?? inner(text, "rgba");
  if (rgb !== null) {
    const [channels, alpha] = rgb.includes("/") ? rgb.split("/") : [rgb, null];
    const nums = split(channels.replace(/,/g, " "), " ").map(Number);
    const a = alpha === null ? (nums[3] ?? 1) : parseFloat(alpha) / (alpha.includes("%") ? 100 : 1);
    return { r: nums[0] / 255, g: nums[1] / 255, b: nums[2] / 255, a };
  }
  const mix = inner(text, "color-mix");
  if (mix !== null) {
    const [space, first, second] = split(mix, ",");
    if (space.trim() !== "in srgb") throw new Error(`Only srgb mixes: ${text}`);
    const part = (p) => {
      const words = split(p, " ");
      const pct = words.find((w) => w.endsWith("%"));
      return { color: parseColor(words.filter((w) => w !== pct).join(" "), overrides), pct };
    };
    const A = part(first);
    const B = part(second);
    let pa = A.pct ? parseFloat(A.pct) / 100 : null;
    let pb = B.pct ? parseFloat(B.pct) / 100 : null;
    if (pa === null && pb === null) pa = pb = 0.5;
    else if (pa === null) pa = 1 - pb;
    else if (pb === null) pb = 1 - pa;
    // CSS mixes with premultiplied alpha.
    const a = A.color.a * pa + B.color.a * pb;
    const ch = (c) => (a ? (A.color[c] * A.color.a * pa + B.color[c] * B.color.a * pb) / a : 0);
    return { r: ch("r"), g: ch("g"), b: ch("b"), a };
  }
  throw new Error(`Can't read the colour "${text}"`);
}

// The brightest colour stop of the glow gradient.
function glowColor(overrides) {
  const gradient = inner(tokens["--glass-glow"], "linear-gradient");
  if (gradient === null) throw new Error("--glass-glow must be a linear-gradient()");
  const stops = split(gradient, ",")
    .slice(1)
    .map((stop) => split(stop, " ")[0])
    .map((c) => parseColor(c, overrides));
  return stops.reduce((best, c) => (lum(over(c, WHITE_ON_BLACK)) > lum(over(best, WHITE_ON_BLACK)) ? c : best));
}
const WHITE_ON_BLACK = NAMED.black;

// --- Colour maths --------------------------------------------------------

function over(top, bottom) {
  const ch = (c) => top.a * top[c] + (1 - top.a) * bottom[c];
  return { r: ch("r"), g: ch("g"), b: ch("b"), a: 1 };
}

function lum({ r, g, b }) {
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg, bg) {
  const solid = fg.a < 1 ? over(fg, bg) : fg;
  const [l1, l2] = [lum(solid), lum(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const hex = (c) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

// --- What sits on each surface -------------------------------------------

const TEXT = 4.5;
const GRAPHIC = 3;

// Foregrounds on the floating cards. [label, colour, rule, chip?]
const CHIPS = {
  verified: "rgb(255 29 37 / 0.16)",
  unverified: "rgb(255 200 0 / 0.16)",
  disputed: "rgb(141 144 153 / 0.18)",
  place: "rgb(79 147 200 / 0.2)",
  error: "rgb(244 59 59 / 0.15)",
  warning: "rgb(255 200 0 / 0.1)",
};

const ROW_TEXT = [
  ["--text: .row-address", "var(--text)", TEXT],
  ["#c6c8ce: .row-title", "#c6c8ce", TEXT],
  ["--muted: .row-meta", "var(--muted)", TEXT],
  ["#ff6b70: .status-text-verified", "#ff6b70", TEXT],
  ["--yellow: .status-text-unverified", "var(--yellow)", TEXT],
  ["#b5b8bf: .status-text-disputed", "#b5b8bf", TEXT],
  ["--red on chip: verified icon", "var(--red)", GRAPHIC, CHIPS.verified],
  ["--yellow on chip: unverified icon", "var(--yellow)", GRAPHIC, CHIPS.unverified],
  ["#b5b8bf on chip: disputed icon", "#b5b8bf", GRAPHIC, CHIPS.disputed],
  ["--blue: focus ring", "var(--blue)", GRAPHIC],
];

const PLACE_ROW = [
  ["#8ec3ee on chip: place icon", "#8ec3ee", GRAPHIC, CHIPS.place],
  ["--muted: .place-link .chevron", "var(--muted)", GRAPHIC],
];

const SURFACES = [
  {
    name: "Search block (desktop)",
    states: ["rest"],
    items: [
      ["--control-line: .search-field edge", "var(--control-line)", GRAPHIC, null, true],
      ["--blue: .search-field focus edge", "var(--blue)", GRAPHIC, null, true],
      ["--blue: focus ring", "var(--blue)", GRAPHIC, null, true],
    ],
  },
  {
    name: "Panel cards (desktop)",
    states: ["rest"],
    items: [
      ["--text: headings, .list-empty-title", "var(--text)", TEXT],
      ["--subtle: .card-head span, .list-empty", "var(--subtle)", TEXT],
      ["#b4bac7: .rights-card p", "#b4bac7", TEXT],
      ["#d3d7e6: .area-stats li", "#d3d7e6", TEXT],
      ["--link: .link-button", "var(--link)", TEXT],
      ["#ff6b70: .stat-dot verified", "#ff6b70", GRAPHIC],
      ["--yellow: .stat-dot unverified", "var(--yellow)", GRAPHIC],
      ["#b5b8bf: .stat-dot disputed", "#b5b8bf", GRAPHIC],
      ["#c4d1e5: .list-empty-icon", "#c4d1e5", GRAPHIC],
      ["--blue: focus ring", "var(--blue)", GRAPHIC, null, true],
    ],
  },
  {
    name: "Panel card rows (desktop)",
    states: ["rest", "hover", "pressed"],
    items: [...ROW_TEXT, ...PLACE_ROW],
  },
  {
    name: "Alert card (desktop, phone)",
    states: ["rest"],
    items: [
      ["--text: h2, .detail-summary, .vote-question", "var(--text)", TEXT],
      ["#d3d5da: .detail-description, .detail-note", "#d3d5da", TEXT],
      ["#c6c8ce: .detail-status", "#c6c8ce", TEXT],
      ["--muted: .detail-meta, .detail-hint", "var(--muted)", TEXT],
      ["#d3d5da: .badge-disputed text", "#d3d5da", TEXT],
      ["#8d9099: .badge-disputed dashed edge", "#8d9099", GRAPHIC],
      ["#8ec3ee: .text-button", "#8ec3ee", TEXT],
      ["#ffb4b4 on chip: .form-error", "#ffb4b4", TEXT, CHIPS.error],
      ["--blue: focus ring", "var(--blue)", GRAPHIC, null, true],
    ],
  },
  {
    name: "Alert card group rows (desktop, phone)",
    states: ["rest", "hover", "pressed"],
    items: ROW_TEXT,
  },
  {
    name: "Pick banner and place form",
    states: ["rest"],
    items: [
      ["--text: .pick-banner p, label", "var(--text)", TEXT],
      ["--muted: .place-form-tip", "var(--muted)", TEXT],
      ["--control-line: .place-form-field input edge", "var(--control-line)", GRAPHIC, null, true],
      ["--blue: field focus edge", "var(--blue)", GRAPHIC, null, true],
      ["--blue: focus ring", "var(--blue)", GRAPHIC, null, true],
    ],
  },
  {
    name: "Account starter",
    states: ["rest"],
    items: [
      ["--text: .starter p", "var(--text)", TEXT],
      ["#ffb4b4 on chip: .form-error", "#ffb4b4", TEXT, CHIPS.error],
      ["--blue: focus ring", "var(--blue)", GRAPHIC, null, true],
    ],
  },
];

// Edges of fields on opaque surfaces (dialogs, pages, the phone sheet) and
// of the search field where it floats straight over the map.
const SOLID = [
  {
    name: "Dialogs and pages (--surface)",
    backdrops: { "--surface": "var(--surface)" },
    items: [
      ["--control-line: text box and choice card edge", "var(--control-line)", GRAPHIC],
      ["--blue: text box focus edge", "var(--blue)", GRAPHIC],
      ["--blue: checked choice edge", "var(--blue)", GRAPHIC],
      ["--blue: focus ring", "var(--blue)", GRAPHIC],
    ],
  },
  {
    name: "Search field (phone, tablet)",
    backdrops: {
      "white map": "white",
      "black map": "black",
      "--surface": "var(--surface)",
    },
    items: [
      ["--control-line: .search-field edge", "var(--control-line)", GRAPHIC],
      ["--blue: .search-field focus edge", "var(--blue)", GRAPHIC],
    ],
  },
];

// --- The lava lamp ---------------------------------------------------------

// The fill of the words in public/brand/icepik-logo.svg (id="ice").
const LOGO_WORDS = "#eff1f5";

// What sits on the glass over the lamp: the consent card, the account
// dialog (tablets, desktop) and the account card (phones).
const LAMP_GLASS_ITEMS = [
  ["--text: headings, labels, .policy strong", "var(--text)", TEXT],
  ["--text: title bar icons (Close)", "var(--text)", GRAPHIC],
  ["#c6c8ce: .consent-intro, .consent-why", "#c6c8ce", TEXT],
  ["--muted: .form small", "var(--muted)", TEXT],
  ["#b5b8bf: .modal p", "#b5b8bf", TEXT],
  ["#ffe08a on chip: .warning-list", "#ffe08a", TEXT, CHIPS.warning],
  ["#ffb4b4 on chip: .form-error", "#ffb4b4", TEXT, CHIPS.error],
  ["--control-line: text box edge", "var(--control-line)", GRAPHIC],
  ["--blue: focus ring", "var(--blue)", GRAPHIC],
];

// Per channel, the highest value in a list of opaque colours.
function highest(list) {
  const ch = (c) => Math.max(...list.map((x) => x[c]));
  return { r: ch("r"), g: ch("g"), b: ch("b"), a: 1 };
}

function lampBackdrops(color) {
  const base = color("var(--lava-base)");
  const blobs = ["--lava-1", "--lava-2", "--lava-3", "--lava-4"].map((n) => color(`var(${n})`));
  const strength = parseFloat(color.raw("--lava-strength-phone"));
  if (!(strength >= 0 && strength <= 1)) throw new Error("--lava-strength-phone must be 0 to 1");
  const full = highest([base, ...blobs]);
  const phone = highest([base, ...blobs.map((b) => over({ ...b, a: b.a * strength }, base))]);

  // brightness() must be the last function: then nothing after it can
  // lighten the map again.
  const filters = split(color.raw("--lava-backdrop"), " ");
  const last = inner(filters.at(-1), "brightness");
  if (last === null) throw new Error("--lava-backdrop must end with brightness()");
  const k = Math.min(1, last.endsWith("%") ? parseFloat(last) / 100 : parseFloat(last));
  const map = { r: k, g: k, b: k, a: 1 };
  const fade = inner(color.raw("--lava-fade"), "linear-gradient");
  if (fade === null) throw new Error("--lava-fade must be a linear-gradient()");
  const stops = split(fade, ",")
    .slice(1)
    .map((stop) => color(split(stop, " ")[0]));
  const clearest = stops.reduce((m, c) => (c.a < m.a ? c : m));
  const fadeTop = over(clearest, map);
  return { full, phone, fadeTop };
}

function lampRows(color) {
  const tint = color("var(--glass-tint-lamp)");
  const { full, phone, fadeTop } = lampBackdrops(color);
  const rows = [];
  const surfaces = [
    { name: "Consent card (lamp)", backdrops: { lamp: full } },
    {
      name: "Account dialog (tablet, desktop)",
      backdrops: { "lamp or fade top": highest([full, fadeTop]) },
    },
    { name: "Account card (phone)", backdrops: { "phone lamp": phone, "fade top": fadeTop } },
  ];
  for (const surface of surfaces) {
    for (const [state, under] of Object.entries(surface.backdrops)) {
      for (const [label, fg, rule, chip] of LAMP_GLASS_ITEMS) {
        let bg = over(tint, under);
        if (chip) bg = over(color(chip), bg);
        rows.push({ surface: surface.name, state, label, value: ratio(color(fg), bg), rule, bg: hex(bg) });
      }
    }
  }
  // The logo sits over the end of the fade (phones) or above the dialog.
  for (const [state, bg] of Object.entries({ "fade top": fadeTop, lamp: full })) {
    rows.push({
      surface: "Logo over the lamp",
      state,
      label: `${LOGO_WORDS}: the logo's words`,
      value: ratio(color(LOGO_WORDS), bg),
      rule: GRAPHIC,
      bg: hex(bg),
    });
  }
  // The pause button: solid --surface, on the lamp.
  const surface = color("var(--surface)");
  for (const [label, fg, rule, bg] of [
    ["--text: pause and play icon", "var(--text)", GRAPHIC, surface],
    ["--surface: pause button edge", "var(--surface)", GRAPHIC, full],
    ["--text: pause button focus ring", "var(--text)", GRAPHIC, full],
  ]) {
    rows.push({ surface: "Pause button", state: "lamp", label, value: ratio(color(fg), bg), rule, bg: hex(bg) });
  }
  // The Moving background switch, in Settings on --surface.
  const card = color("var(--card)");
  const blueStrong = color("var(--blue-strong)");
  for (const [label, fg, bg] of [
    ["--control-line: switch edge (off)", "var(--control-line)", surface],
    ["--blue-strong: switch track (on)", "var(--blue-strong)", surface],
    ["#c6c8ce: switch knob (off)", "#c6c8ce", card],
    ["#ffffff: switch knob (on)", "#ffffff", blueStrong],
    ["--blue: switch focus ring", "var(--blue)", surface],
  ]) {
    rows.push({ surface: "Moving background switch", state: "--surface", label, value: ratio(color(fg), bg), rule: GRAPHIC, bg: hex(bg) });
  }
  return rows;
}

const LAMP_SURFACES = [
  "Consent card (lamp)",
  "Account dialog (tablet, desktop)",
  "Account card (phone)",
  "Logo over the lamp",
  "Pause button",
  "Moving background switch",
];

// --- Running the checks --------------------------------------------------

function check(overrides = {}, print = true) {
  const color = (text) => parseColor(text, overrides);
  color.raw = (name) => overrides[name] ?? tokens[name];
  const tint = color("var(--glass-tint)");
  const glow = glowColor(overrides);
  const layers = {
    rest: null,
    hover: color("var(--glass-hover)"),
    pressed: color("var(--glass-pressed)"),
  };
  const rows = [];

  for (const surface of SURFACES) {
    for (const state of surface.states) {
      for (const [label, fg, rule, chip, alsoBlack] of surface.items) {
        for (const backdrop of alsoBlack ? ["white", "black"] : ["white"]) {
          let bg = over(glow, over(tint, NAMED[backdrop]));
          if (layers[state]) bg = over(layers[state], bg);
          if (chip) bg = over(color(chip), bg);
          rows.push({
            surface: surface.name,
            state: `${state}, ${backdrop}`,
            label,
            value: ratio(color(fg), bg),
            rule,
            bg: hex(bg),
          });
        }
      }
    }
  }
  for (const surface of SOLID) {
    for (const [backdrop, value] of Object.entries(surface.backdrops)) {
      const bg = color(value);
      for (const [label, fg, rule] of surface.items) {
        rows.push({
          surface: surface.name,
          state: backdrop,
          label,
          value: ratio(color(fg), bg),
          rule,
          bg: hex(bg),
        });
      }
    }
  }

  rows.push(...lampRows(color));

  const failures = rows.filter((r) => r.value < r.rule);
  if (print) {
    console.log(
      `Glass tint ${hex(over(tint, NAMED.white))} over white (${tokens["--glass-tint"]}), ` +
        `glow at its brightest. The blur is not counted.\n`,
    );
    let last = "";
    for (const r of rows) {
      if (r.surface !== last) console.log(`\n${(last = r.surface)}`);
      const verdict = r.value >= r.rule ? "pass" : "FAIL";
      console.log(
        `  ${verdict}  ${r.value.toFixed(2).padStart(5)}:1  (needs ${r.rule}:1)  ${r.state.padEnd(15)} on ${r.bg}  ${r.label}`,
      );
    }
    const worst = (filter) => {
      const list = rows.filter(filter);
      const min = list.reduce((m, r) => (r.value / r.rule < m.value / m.rule ? r : m), list[0]);
      return `${min.value.toFixed(2)}:1 (${min.label}, ${min.surface}, ${min.state})`;
    };
    console.log("\nWorst cases");
    console.log(`  text on card glass:           ${worst((r) => r.rule === TEXT && !SOLID.some((s) => s.name === r.surface))}`);
    console.log(`  icons and rings on card glass: ${worst((r) => r.rule === GRAPHIC && !SOLID.some((s) => s.name === r.surface))}`);
    console.log(`  on hovered rows:              ${worst((r) => r.state.startsWith("hover"))}`);
    console.log(`  on pressed rows:              ${worst((r) => r.state.startsWith("pressed"))}`);
    console.log(`  --control-line edges:         ${worst((r) => r.label.startsWith("--control-line"))}`);
    console.log(`  focus ring:                   ${worst((r) => r.label.includes("focus"))}`);
    const lamp = (name) => (r) => r.surface === name;
    console.log("\nWorst cases over the lava lamp");
    for (const name of LAMP_SURFACES.slice(0, 3)) {
      console.log(`  ${name}, text: ${worst((r) => lamp(name)(r) && r.rule === TEXT)}`);
      console.log(`  ${name}, edges, icons, ring: ${worst((r) => lamp(name)(r) && r.rule === GRAPHIC)}`);
    }
    for (const name of LAMP_SURFACES.slice(3)) console.log(`  ${name}: ${worst(lamp(name))}`);
    console.log(`\n${rows.length - failures.length} of ${rows.length} pass.`);
  }
  return { rows, failures, margin: Math.min(...rows.map((r) => r.value - r.rule)) };
}

const { failures } = check();

if (process.argv.includes("--find-tint")) {
  const mix = tokens["--glass-tint"].match(/^color-mix\(in srgb, (var\(--[\w-]+\)) ([\d.]+)%, transparent\)$/);
  if (!mix) throw new Error("--find-tint expects --glass-tint: color-mix(in srgb, var(...) N%, transparent)");
  let lowest = null;
  for (let pct = 100; pct >= 50; pct--) {
    const overrides = { "--glass-tint": `color-mix(in srgb, ${mix[1]} ${pct}%, transparent)` };
    if (check(overrides, false).margin >= 0.1) lowest = pct;
    else break;
  }
  console.log(`\nLowest tint that passes everything with 0.1 to spare: ${lowest ?? "none"}%`);
}

if (process.argv.includes("--find-lamp")) {
  const mix = tokens["--glass-tint-lamp"].match(/^color-mix\(in srgb, (var\(--[\w-]+\)) ([\d.]+)%, transparent\)$/);
  if (!mix) throw new Error("--find-lamp expects --glass-tint-lamp: color-mix(in srgb, var(...) N%, transparent)");
  const margin = (overrides) =>
    Math.min(
      ...check(overrides, false)
        .rows.filter((r) => LAMP_SURFACES.includes(r.surface))
        .map((r) => r.value - r.rule),
    );
  let lowest = null;
  for (let pct = 100; pct >= 0; pct--) {
    if (margin({ "--glass-tint-lamp": `color-mix(in srgb, ${mix[1]} ${pct}%, transparent)` }) >= 0.1) lowest = pct;
    else break;
  }
  let strongest = null;
  for (let s = 0; s <= 100; s += 5) {
    if (margin({ "--lava-strength-phone": String(s / 100) }) >= 0.1) strongest = s / 100;
    else break;
  }
  console.log(`\nLowest --glass-tint-lamp that passes with 0.1 to spare: ${lowest ?? "none"}%`);
  console.log(`Highest --lava-strength-phone that passes with 0.1 to spare: ${strongest ?? "none"}`);
}

process.exit(failures.length ? 1 : 0);
