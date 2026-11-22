// Drives every account-recovery flow in Chromium, on the real map (/) and on
// the demo (/demo), and checks what the person sees and what the browser
// keeps:
//
//   - Save account shows the recovery key once, in full, with Copy;
//   - "Make a new recovery key" asks for the password and replaces the key;
//   - "Forgot password?" takes the key with or without dashes and spaces,
//     shows a new key and logs in; a used key, a wrong key and an unknown
//     username all get the same answer;
//   - a saved account without a key is asked once, after logging in;
//   - closing Settings while a key shows asks first;
//   - on /demo any letters and numbers work as the key, and the screen says
//     so; the real map never says so and needs the real key;
//   - the demo's reset reaches only the demo project (stand-in only);
//   - no key is ever in localStorage, sessionStorage, IndexedDB, cookies, a
//     request URL or the server's output.
//
//   node scripts/recovery-flows.mjs     against the stand-ins (see below)
//   Options: --url http://127.0.0.1:3000  --server-log <file with the app's
//            output>  --only save,forgot,...  --shots <dir> (screenshots for
//            a person, at device scale factor 1)
//
// Stand-ins: build the app as in scripts/mock-supabase.mjs, with the demo on
// a second stand-in (MOCK_DEMO=1 MOCK_PORT=54322), and start it with
// SUPABASE_SECRET_KEY=test-secret-key DEMO_SUPABASE_SECRET_KEY=test-secret-key.
//
// Against real Supabase projects (the demo project as a test project), set
// ICEPIK_SCRATCH_PROJECT=yes and --live; the CAPTCHA must accept Cloudflare's
// test token (see scripts/supabase-live-checks.mjs). --live skips the checks
// that need a stand-in (the request lists) and the interrupted save, which
// is then done by blocking the sign-in in the browser as well.
//
// It prints only what passed and failed: never a password, a recovery key or
// a request's headers or body. Test usernames start with rktest_.
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 ? process.argv[at + 1] : fallback;
}
const url = option("url", "http://127.0.0.1:3000");
const serverLog = option("server-log");
const shots = option("shots");
const only = option("only")?.split(",");
const liveRun = process.argv.includes("--live");
if (liveRun && process.env.ICEPIK_SCRATCH_PROJECT !== "yes") {
  console.error("Refusing --live: set ICEPIK_SCRATCH_PROJECT=yes to confirm the app points at a test project.");
  process.exit(2);
}
const MOCKS = { real: "http://127.0.0.1:54321", demo: "http://127.0.0.1:54322" };
const KEY_FORMAT = /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/;
const NO_MATCH = "That username and recovery key don't match.";

const firstLine = (error) => String(error?.message ?? error).split("\n")[0];
// Errors print their first line only: Playwright's call logs can hold
// request headers.
for (const event of ["unhandledRejection", "uncaughtException"]) {
  process.on(event, (error) => {
    console.error(`Stopped: ${firstLine(error)}`);
    process.exit(2);
  });
}

// --- Results ---------------------------------------------------------------

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `\n      ${detail}` : ""}`);
  return ok;
}

// Everything secret this run made: scanned for at the end, never printed.
const secrets = new Set();
const remember = (value) => {
  if (!value) return value;
  secrets.add(value);
  if (KEY_FORMAT.test(value)) secrets.add(value.replace(/-/g, ""));
  return value;
};
const newPassword = () => remember(`${randomBytes(9).toString("base64url")} rk test words`);
const newUsername = () => `rktest_${randomBytes(5).toString("hex")}`;

// --- Driving the app -------------------------------------------------------

const browser = await chromium.launch();
const requestUrls = [];

async function newPage(path = "/", size = "1280x800") {
  const [width, height] = size.split("x").map(Number);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: width < 1280,
    timezoneId: "UTC",
    locale: "en-US",
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
  await context.addInitScript(() => localStorage.setItem("icepik.location", "denied"));
  const page = await context.newPage();
  await page.route("**/*cartocdn.com/**", (route) => route.abort());
  await page.route("**/api/search**", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/api/reverse**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ label: "Market Street" }) }),
  );
  page.on("request", (request) => requestUrls.push(request.url()));
  page.on("pageerror", (error) => console.error(`      page error: ${firstLine(error)}`));
  await page.goto(`${url}${path}`, { waitUntil: "domcontentloaded" });
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
  await page.waitForSelector(".pin-icon", { state: "attached", timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".starter"), null, { timeout: 60000 });
  return page;
}

async function openSettings(page) {
  const rail = await page.locator(".rail-settings").isVisible();
  await page.click(rail ? ".rail-settings" : ".panel-settings");
  await page.waitForSelector(".modal .settings");
}

// The app's notice, as screen readers hear it (the last status line on the page).
const notice = (page) =>
  page.evaluate(() => [...document.querySelectorAll(".app > p.visually-hidden[role=status]")].at(-1)?.textContent ?? "");
// The form's message after the last submit: a new message element (the forms
// clear their message while sending), or a changed text.
async function formError(page) {
  await page.waitForFunction(
    () => {
      const error = document.querySelector(".modal .form-error");
      return error && (!error.dataset.read || error.dataset.read !== error.textContent);
    },
    null,
    { timeout: 30000 },
  );
  return page.evaluate(() => {
    const error = document.querySelector(".modal .form-error");
    error.dataset.read = error.textContent;
    return error.textContent;
  });
}
const heading = (page) => page.locator(".modal .settings h3").first().textContent();

async function shot(page, name) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  // The key on screen is replaced by a placeholder before any picture.
  await page.evaluate(() => {
    for (const box of document.querySelectorAll(".recovery-key")) {
      box.querySelectorAll("span").forEach((span, i, all) => {
        span.textContent = i < all.length - 1 ? "xxxx-" : "xxxx";
      });
    }
  });
  await page.screenshot({ path: join(shots, `${name}.png`) });
}

// Reads the key on screen (kept in memory only) and checks it's all in view.
async function readKey(page) {
  await page.waitForSelector(".recovery-key");
  const { text, visible } = await page.evaluate(() => {
    const box = document.querySelector(".recovery-key");
    const outer = box.getBoundingClientRect();
    const spans = [...box.querySelectorAll("span")];
    const inside = spans.every((span) => {
      const r = span.getBoundingClientRect();
      return r.left >= outer.left - 0.5 && r.right <= outer.right + 0.5 && r.top >= outer.top - 0.5 && r.bottom <= outer.bottom + 0.5;
    });
    const noScroll = box.scrollWidth <= box.clientWidth + 1 && box.scrollHeight <= box.clientHeight + 1;
    // Each group stays on one line.
    const whole = spans.every((span) => span.getClientRects().length === 1);
    const onScreen = outer.left >= 0 && outer.right <= innerWidth;
    return { text: box.textContent, visible: inside && noScroll && whole && onScreen };
  });
  return { key: remember(text), visible };
}

async function finishKey(page) {
  await page.check(".check-row input");
  await page.getByRole("button", { name: "Done" }).click();
}

async function save(page, username, password) {
  await openSettings(page);
  await page.click('[data-opens="save"]');
  await page.waitForSelector(".account-form");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: false }).first().fill(password);
  await page.getByLabel("Repeat password").fill(password);
  await page.click('.account-form button[type="submit"]');
}

async function openForgot(page) {
  await openSettings(page);
  await page.click('[data-opens="login"]');
  await page.waitForSelector(".account-form");
  await page.click('[data-opens="forgot"]');
  await page.waitForSelector(".account-form input[maxlength='64']");
}

async function forgot(page, username, key, password) {
  await page.getByLabel("Username").fill(username);
  await page.getByRole("textbox", { name: /Recovery key/ }).fill(key);
  await page.getByLabel("New password", { exact: false }).first().fill(password);
  await page.getByLabel("Repeat new password").fill(password);
  await page.click('.account-form button[type="submit"]');
}

async function login(page, username, password) {
  await openSettings(page);
  await page.click('[data-opens="login"]');
  await page.waitForSelector(".account-form");
  await page.getByLabel("Username").fill(username);
  await page.locator('.account-form input[type="password"]').fill(password);
  // Enter once the security check (if any) has given its token: a click can
  // land while the check's widget still moves the form.
  await page.waitForSelector('.account-form button[type="submit"]:not([disabled])', { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.press('.account-form input[type="password"]', "Enter");
}

// Every place the browser keeps things, for one page.
async function storedValues(page) {
  const inPage = await page.evaluate(async () => {
    const out = [document.cookie, location.href, history.length ? location.href : ""];
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) out.push(store.key(i), store.getItem(store.key(i)));
    }
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    out.push(...dbs.map((db) => db.name));
    return out;
  });
  const cookies = (await page.context().cookies()).flatMap((c) => [c.name, decodeURIComponent(c.value)]);
  return [...inPage, ...cookies].join("\n");
}
const holdsSecret = (text) => [...secrets].some((s) => s.length >= 8 && text.toLowerCase().includes(s.toLowerCase()));

const mockLog = async (which, clear = false) =>
  liveRun ? [] : (await fetch(`${MOCKS[which]}/__mock/requests`, { method: clear ? "POST" : "GET" })).json();

const wants = (name) => !only || only.includes(name);

// --- The flows -------------------------------------------------------------

const real = { username: newUsername(), password: newPassword() };
let currentKey = null;

if (wants("save")) {
  const page = await newPage("/");
  await save(page, real.username, real.password);
  const { key, visible } = await readKey(page);
  currentKey = key;
  check("Save account shows the recovery key (8 groups of 4)", KEY_FORMAT.test(key));
  check("The key is shown in full, with no scrolling", visible);
  check("The key screen says the account is saved", (await page.locator(".account-card p").first().textContent()).includes(`saved as ${real.username}`));
  await shot(page, "key-after-save");
  await page.getByRole("button", { name: "Copy" }).click();
  await page.waitForFunction(() => document.querySelector(".account-card [role=status]")?.textContent);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check("Copy puts the key on the clipboard", copied === key);
  await page.getByRole("button", { name: "Done" }).click();
  const nudged = await page.locator(".modal .form-error").isVisible();
  const focused = await page.evaluate(() => document.activeElement?.matches(".check-row input"));
  check("Done before ticking the box says so and moves focus to the box", nudged && focused);

  // Escape while the key shows asks first; saying no keeps the key.
  let asked = 0;
  page.once("dialog", (dialog) => {
    asked++;
    void dialog.dismiss();
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Closing Settings while the key shows asks first", asked === 1 && (await page.locator(".recovery-key").isVisible()));

  check("The key is in no browser storage, cookie or URL", !holdsSecret(await storedValues(page)));
  await finishKey(page);
  await page.waitForSelector('[data-opens="newkey"]');
  const focusedButton = await page.evaluate(() => document.activeElement?.getAttribute("data-opens"));
  check("Done goes back to Settings, on Make a new recovery key", focusedButton === "newkey");
  check("Settings says the account was saved", (await notice(page)).includes("Account saved"));
  check("The key is gone from the page after Done", !holdsSecret(await page.content()));

  // Make a new recovery key: the password first.
  await page.click('[data-opens="newkey"]');
  await page.waitForSelector(".account-form");
  await shot(page, "make-new-key");
  await page.locator('.account-form input[type="password"]').fill("not the password at all");
  await page.click('.account-form button[type="submit"]');
  check("Make a new recovery key refuses a wrong password", (await formError(page)) === "That password is wrong.");
  await page.locator('.account-form input[type="password"]').fill(real.password);
  await page.click('.account-form button[type="submit"]');
  const next = await readKey(page);
  check("Make a new recovery key shows a new key", KEY_FORMAT.test(next.key) && next.key !== currentKey);
  const oldKey = currentKey;
  currentKey = next.key;
  await finishKey(page);
  await page.waitForSelector('[data-opens="newkey"]');
  check("Settings says the old key no longer works", (await notice(page)).includes("old one no longer works"));
  await page.context().close();

  // Phone B: Forgot password.
  const phone = await newPage("/");
  await openForgot(phone);
  check("The real reset screen has no demo note", !(await phone.content()).includes("Demo only"));
  await shot(phone, "forgot-password");
  await forgot(phone, real.username, oldKey, newPassword());
  const replaced = await formError(phone);
  check("A replaced key is refused", replaced === NO_MATCH, replaced);
  await forgot(phone, newUsername(), currentKey, newPassword());
  const unknown = await formError(phone);
  check("An unknown username gets exactly the same answer", unknown === replaced, unknown);
  await forgot(phone, real.username, randomBytes(16).toString("hex"), newPassword());
  check("A made-up key in the right form is refused on the real map", (await formError(phone)) === NO_MATCH);
  await forgot(phone, real.username, "hello123", newPassword());
  check("A key in the wrong form is caught before sending", (await formError(phone)).startsWith("Check your recovery key"));
  // The right key, in capitals with spaces instead of dashes.
  real.password = newPassword();
  await forgot(phone, real.username, currentKey.replace(/-/g, " ").toUpperCase(), real.password);
  const afterReset = await readKey(phone);
  check("The right key with spaces and capitals resets the password and shows a new key", KEY_FORMAT.test(afterReset.key) && afterReset.key !== currentKey);
  check("The reset logs in at once", (await phone.locator(".account-card p").first().textContent()).includes(`logged in as ${real.username}`));
  const usedKey = currentKey;
  currentKey = afterReset.key;
  await shot(phone, "key-after-reset");
  await finishKey(phone);
  await phone.waitForSelector(".modal", { state: "detached" });
  check("Done closes Settings, logged in", (await notice(phone)).includes(`Logged in as ${real.username}`));
  await openSettings(phone);
  check("Settings shows the saved account", (await phone.locator(".settings-section").first().textContent()).includes(real.username));
  await shot(phone, "settings-saved");
  await phone.context().close();

  // Phone C: the used key no longer works; the new one works without dashes.
  const third = await newPage("/");
  await openForgot(third);
  await forgot(third, real.username, usedKey, newPassword());
  check("A used key no longer works", (await formError(third)) === NO_MATCH);
  real.password = newPassword();
  await forgot(third, real.username, currentKey.replace(/-/g, ""), real.password);
  const plain = await readKey(third);
  check("The key without dashes works too", KEY_FORMAT.test(plain.key));
  currentKey = plain.key;
  check("No key is in browser storage after a reset", !holdsSecret(await storedValues(third)));
  await finishKey(third);
  await third.context().close();
}

if (wants("nokey")) {
  // An interrupted save: the sign-in after saving fails.
  const account = { username: newUsername(), password: newPassword() };
  const page = await newPage("/");
  await page.route("**/auth/v1/token?grant_type=password*", (route) => route.abort(), { times: 1 });
  await save(page, account.username, account.password);
  await page.waitForSelector('[data-opens="newkey"]');
  check("An interrupted save says the account is saved and to make the key", (await notice(page)).includes("Make your recovery key in Settings"));
  check("Settings says the account has no key and offers one", (await page.locator('[data-opens="newkey"]').textContent()) === "Make a recovery key");
  await page.context().close();

  // Logging in to it asks once to make one.
  const other = await newPage("/");
  await login(other, account.username, account.password);
  await other.waitForSelector(".account-form .primary-button:text('Make my recovery key')");
  check("Logging in to an account without a key asks to make one", (await heading(other)) === "Make a recovery key");
  await shot(other, "make-a-key-after-login");
  await other.getByRole("button", { name: "Make my recovery key" }).click();
  const made = await readKey(other);
  check("It makes the key at once, without the password again", KEY_FORMAT.test(made.key));
  await finishKey(other);
  await other.waitForSelector(".modal", { state: "detached" });
  check("Done closes Settings, logged in", (await notice(other)).includes(`Logged in as ${account.username}`));
  await other.context().close();

  // With a key, logging in doesn't ask.
  const again = await newPage("/");
  await login(again, account.username, account.password);
  await again.waitForSelector(".modal", { state: "detached" });
  check("Logging in to an account with a key doesn't ask", (await notice(again)).includes("Logged in as"));
  await again.context().close();
}

if (wants("demo")) {
  const account = { username: newUsername(), password: newPassword() };
  const page = await newPage("/demo");
  await save(page, account.username, account.password);
  const saved = await readKey(page);
  check("Demo: Save account shows a recovery key", KEY_FORMAT.test(saved.key) && saved.visible);
  await finishKey(page);
  await page.context().close();

  const phone = await newPage("/demo");
  await openForgot(phone);
  check("Demo: the reset screen has the demo note", (await phone.locator(".account-form small").allTextContents()).some((t) => t.startsWith("Demo only: any letters and numbers")));
  await shot(phone, "forgot-password-demo");
  await forgot(phone, account.username, "abc!", newPassword());
  check("Demo: a key with other characters is caught", (await formError(phone)) === "On the demo, the key can be any letters and numbers.");
  await forgot(phone, newUsername(), "hello123", newPassword());
  check("Demo: an unknown username is refused", (await formError(phone)) === NO_MATCH);
  await mockLog("real", true);
  await mockLog("demo", true);
  account.password = newPassword();
  await forgot(phone, account.username, "Hello 123 any key", account.password);
  const reset = await readKey(phone);
  check("Demo: any letters and numbers reset the password and show a new key", KEY_FORMAT.test(reset.key));
  check("Demo: the reset logs in at once", (await phone.locator(".account-card p").first().textContent()).includes(`logged in as ${account.username}`));
  if (!liveRun) {
    const realLog = await mockLog("real");
    const demoLog = await mockLog("demo");
    check("Demo: the reset never reached the real project", !realLog.some((r) => r.secretKey || r.path.includes("admin") || r.path.includes("recovery_key")));
    check(
      "Demo: the reset used the demo project's secret key",
      demoLog.some((r) => r.secretKey && r.path.startsWith("/auth/v1/admin/users/")) &&
        demoLog.some((r) => r.secretKey && r.path === "/rest/v1/rpc/replace_recovery_key"),
    );
  }
  await finishKey(phone);
  await phone.waitForSelector(".modal", { state: "detached" });
  await phone.context().close();

  // The real map refuses the same made-up key for a real account.
  if (!only || only.includes("save")) {
    const realPage = await newPage("/");
    await openForgot(realPage);
    await forgot(realPage, real.username, "hello123", newPassword());
    check("The real map doesn't take any letters and numbers", (await formError(realPage)).startsWith("Check your recovery key"));
    await realPage.context().close();
  }
}

if (wants("sizes")) {
  // The key in full at every size, down to 320 px wide.
  const sizes = ["1280x800", "1024x768", "820x1180", "768x1024", "390x844", "360x667", "844x390", "320x568", "320x200"];
  const failed = [];
  for (const size of sizes) {
    const page = await newPage("/", size);
    await save(page, newUsername(), newPassword());
    const { visible } = await readKey(page);
    if (!visible) failed.push(size);
    await page.context().close();
  }
  check(`The key is shown in full at ${sizes.length} sizes, down to 320 px wide`, failed.length === 0, failed.join(", "));
}

if (wants("keyboard")) {
  // The key field: reachable by Tab, named for screen readers, and the
  // form sends with Enter.
  const page = await newPage("/");
  await openForgot(page);
  // With CAPTCHA on, Reset password works (and takes focus) once the check
  // has given a token, as on Log in.
  await page.waitForSelector('.account-form button[type="submit"]:not([disabled])', { timeout: 60000 });
  const order = [];
  await page.focus(".account-form input[autocomplete='username']");
  // Until six named stops (the check's frame has a few stops of its own).
  for (let i = 0; i < 16 && order.filter((name) => name !== "security check").length < 6; i++) {
    order.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (el?.tagName === "IFRAME" || el?.closest(".captcha")) return "security check";
      return el?.closest("label")?.childNodes[0]?.textContent?.trim() || el?.textContent?.trim() || el?.tagName;
    }));
    await page.keyboard.press("Tab");
  }
  // The security check's own frame may take Tab stops between them.
  const seen = order.filter((name) => name !== "security check").join(" > ");
  const stops = [...new Set(order)].join(" > ");
  check("Tab goes Username, Recovery key, New password, Repeat, Back, Reset", seen === "Username > Recovery key > New password > Repeat new password > Back > Reset password", stops);
  const named = await page.getByRole("textbox", { name: /^Recovery key/ }).count();
  check("The key field is named Recovery key for screen readers", named === 1);
  await page.context().close();
}

await browser.close();

// The secrets never left the page as a URL, and the server never printed one.
check("No password or key in any request URL", !holdsSecret(requestUrls.join("\n")));
if (serverLog && existsSync(serverLog)) {
  check("No password or key in the server's output", !holdsSecret(readFileSync(serverLog, "utf8")));
}

const failures = results.filter((ok) => !ok).length;
console.log(`\n${failures ? `${failures} check(s) FAILED` : "All checks passed"} (${results.length} checks).`);
process.exit(failures ? 1 : 0);
