#!/usr/bin/env node
// Checks the Supabase Auth behaviour ICEPik's accounts depend on, against a
// SCRATCH Supabase project. Run it before upgrading the live project with
// database/migrations/20261116_recovery_keys.sql, before building the
// recovery-key screens, and again after Supabase upgrades. It creates a few
// throwaway accounts named livecheck_… and deletes them at the end.
//
// Set up the scratch project first, the same way as production:
//   1. In its SQL Editor, run database/icepik_schema.sql. To rehearse the live
//      upgrade instead, run the earlier schema
//      (git show ab6e467:database/icepik_schema.sql), post a pin and a vote,
//      then run database/migrations/20261116_recovery_keys.sql twice.
//   2. Authentication settings: anonymous sign-ins ON, Confirm email OFF,
//      Minimum password length 15, Password Requirements "No required
//      characters" (check 2a fails otherwise), Require current password when changing
//      password ON, Secure password change OFF, audit logs to the database OFF,
//      Hooks -> Send Email -> Postgres -> public.block_auth_emails.
//   3. CAPTCHA ON with provider Turnstile and Cloudflare's test secret key
//      1x0000000000000000000000000000000AA, which accepts only the dummy token
//      this script sends. Never use the test key on the production project.
//
// Then, from the repository root, in a terminal (the script pauses once so
// you can run two SQL queries before it cleans up):
//   ICEPIK_SCRATCH_PROJECT=yes \
//   SUPABASE_URL=https://<scratch-ref>.supabase.co \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
//   SUPABASE_SECRET_KEY=sb_secret_… \
//   node scripts/supabase-live-checks.mjs
//
// Read the keys into the shell without typing them on the command line, for
// example: read -rs SUPABASE_SECRET_KEY && export SUPABASE_SECRET_KEY
// The script never prints keys, passwords, tokens or recovery keys.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

const {
  ICEPIK_SCRATCH_PROJECT,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY,
  CAPTCHA_TOKEN = "XXXX.DUMMY.TOKEN.XXXX", // Cloudflare's Turnstile test token
} = process.env;

if (ICEPIK_SCRATCH_PROJECT !== "yes") {
  console.error("Refusing to run: set ICEPIK_SCRATCH_PROJECT=yes to confirm this is a scratch project, not production.");
  process.exit(2);
}
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  console.error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY for the scratch project.");
  process.exit(2);
}

const results = [];
function report(status, name, detail = "") {
  results.push(status);
  console.log(`${status.padEnd(4)}  ${name}${detail ? `\n      ${detail}` : ""}`);
}
// Records PASS or FAIL and returns whether it passed.
function check(name, ok, detail = "") {
  report(ok ? "PASS" : "FAIL", name, detail);
  return ok;
}
const info = (name, detail) => report("INFO", name, detail);
const describe = (error) => (error ? `${error.status ?? "?"} ${error.code ?? "(no code)"}: ${error.message}` : "no error");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const browser = () => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options);
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, options);
const captcha = { captchaToken: CAPTCHA_TOKEN };

// A request straight to Supabase with a given access token, so the answer is
// the server's, not something supabase-js decided from its own stored session.
async function raw(method, path, { token, body } = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text: text.slice(0, 300) };
}

const suffix = randomBytes(4).toString("hex");
const username = `livecheck_${suffix}`;
const loginId = `${username}@icepik.invalid`;
const password = `${randomBytes(12).toString("base64url")} live check`;
const newPassword = `${randomBytes(12).toString("base64url")} after reset`;
const createdUserIds = new Set();

// The access token's claims, without verifying it (Supabase already did).
function claims(session) {
  const [, payload] = (session?.access_token ?? "..").split(".");
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}
const passwordSignIn = (session) => {
  const amr = claims(session).amr;
  return Array.isArray(amr) ? amr.find((entry) => entry?.method === "password") : undefined;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Scratch project: ${new URL(SUPABASE_URL).host}\nTest username: ${username}\n`);

  // 0. CAPTCHA is really required: a sign-in with no token is refused
  const noCaptcha = await browser().auth.signInAnonymously();
  if (noCaptcha.data.user) createdUserIds.add(noCaptcha.data.user.id);
  check("0. CAPTCHA is on: an anonymous sign-in without a token is refused",
    noCaptcha.error?.code === "captcha_failed", describe(noCaptcha.error));

  // 1. Anonymous sign-in, with the username-rule trigger on auth.users
  const phoneA = browser();
  const anon = await phoneA.auth.signInAnonymously({ options: captcha });
  if (anon.data.user) createdUserIds.add(anon.data.user.id);
  if (!check("1. Anonymous sign-in works with the trigger on auth.users",
    !anon.error && anon.data.user?.is_anonymous === true, describe(anon.error))) return;
  const userId = anon.data.user.id;

  // 2. Saving the anonymous account while "Require current password" is on
  const saved = await phoneA.auth.updateUser({ email: loginId, password });
  if (!check("2a. Saving an anonymous account works",
    !saved.error && saved.data.user?.email === loginId && saved.data.user?.is_anonymous === false,
    describe(saved.error))) return;
  // The same password again, without the current one: refused before
  // anything changes, with a code that shows whether the setting is on.
  const probe = await phoneA.auth.updateUser({ password });
  if (!check('2b. "Require current password" is ON (a password change without it is refused)',
    probe.error?.code === "current_password_required",
    `${describe(probe.error)} (same_password here means the setting is OFF, which would let someone holding an unlocked phone set a new password and then pass the 10-minute rule)`)) return;

  // 2c. The username rule refuses a bad login ID and leaves the account as it was
  const phoneBad = browser();
  const badAnon = await phoneBad.auth.signInAnonymously({ options: captcha });
  if (badAnon.data.user) createdUserIds.add(badAnon.data.user.id);
  if (badAnon.error) {
    check("2c. A login ID that breaks the username rule is refused", false,
      `Couldn't make a second anonymous account to try it: ${describe(badAnon.error)}`);
  } else {
    const bad = await phoneBad.auth.updateUser({ email: "Bad.Name@icepik.invalid", password });
    const after = await admin.auth.admin.getUserById(badAnon.data.user.id);
    check("2c. A login ID that breaks the username rule is refused, and the account stays anonymous",
      bad.error?.status === 500 && !after.error && !after.data.user?.email && after.data.user?.is_anonymous === true,
      `${describe(bad.error)}; afterwards email "${after.data.user?.email ?? ""}", is_anonymous ${after.data.user?.is_anonymous}`);
  }

  // 3. The token right after saving has no password sign-in: no key, no delete
  const refreshedAfterSave = await phoneA.auth.refreshSession();
  const tokenAfterSave = claims(refreshedAfterSave.data.session);
  info("3. Token after saving and refreshing", `is_anonymous ${tokenAfterSave.is_anonymous}, amr ${JSON.stringify(tokenAfterSave.amr)}`);
  const keyTooSoon = await phoneA.rpc("create_recovery_key");
  check("3a. No recovery key before a password sign-in",
    keyTooSoon.error?.message === "Enter your password again to make a recovery key.",
    keyTooSoon.error ? describe(keyTooSoon.error) : "a key was made");
  const deleteTooSoon = await phoneA.rpc("delete_my_account");
  if (!check("3b. A saved account can't be deleted before a password sign-in",
    deleteTooSoon.error?.message === "Enter your password again to delete your account.",
    deleteTooSoon.error ? describe(deleteTooSoon.error) : "the account was deleted")) {
    if (!deleteTooSoon.error) createdUserIds.delete(userId);
    return;
  }

  // 4. The amr claim after a password sign-in, and after a refresh
  const signIn = await phoneA.auth.signInWithPassword({ email: loginId, password, options: captcha });
  if (!check("4a. Password sign-in", !signIn.error, describe(signIn.error))) return;
  const entry = passwordSignIn(signIn.data.session);
  const now = Math.floor(Date.now() / 1000);
  check("4b. amr after sign-in has {method: 'password', timestamp: <now>}",
    typeof entry?.timestamp === "number" && Math.abs(entry.timestamp - now) < 300,
    JSON.stringify(claims(signIn.data.session).amr));
  // Wait, so a refresh that moved the time to "now" would show a different second.
  await wait(3000);
  const refreshed = await phoneA.auth.refreshSession();
  const afterRefresh = passwordSignIn(refreshed.data.session);
  check("4c. A refresh 3 seconds later keeps the original sign-in time in amr",
    !refreshed.error && afterRefresh?.timestamp === entry?.timestamp &&
      claims(refreshed.data.session).iat >= (entry?.timestamp ?? Infinity) + 2,
    `${describe(refreshed.error)}; amr ${JSON.stringify(claims(refreshed.data.session).amr)}, iat ${claims(refreshed.data.session).iat} (if the time moved, refreshing would bypass the 10-minute rule)`);

  const key = await phoneA.rpc("create_recovery_key");
  if (!check("4d. Recovery key made right after the password sign-in (8 groups of 4)",
    typeof key.data === "string" && /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/.test(key.data), describe(key.error))) return;
  const hasKey = await phoneA.rpc("has_recovery_key");
  check("4e. has_recovery_key() is true", hasKey.data === true, describe(hasKey.error));
  const readKeys = await phoneA.from("recovery_keys").select("*");
  check("4f. The browser can't read recovery_keys", Boolean(readKeys.error),
    readKeys.error ? describe(readKeys.error) : `returned ${readKeys.data?.length} rows`);

  // 5. A reset through the admin API ends every session
  const phoneB = browser();
  const signInB = await phoneB.auth.signInWithPassword({ email: loginId, password, options: captcha });
  if (!check("5. Second device signs in", !signInB.error, describe(signInB.error))) return;
  const kept = {
    "phone A": (await phoneA.auth.getSession()).data.session,
    "phone B": (await phoneB.auth.getSession()).data.session,
  };
  const match = await admin.rpc("check_recovery_key", { p_username: username, p_key: key.data });
  check("5a. check_recovery_key finds the account", match.data === userId, describe(match.error));
  const reset = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (!check("5b. Admin password reset", !reset.error, describe(reset.error))) return;

  for (const [name, session] of Object.entries(kept)) {
    const user = await raw("GET", "/auth/v1/user", { token: session?.access_token });
    check(`5c. ${name}: Supabase Auth rejects its old access token (so the app can sign it out)`,
      (user.status === 401 || user.status === 403) && user.text.includes("session_not_found"),
      `${user.status} ${user.text}`);
    const refresh = await raw("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session?.refresh_token } });
    check(`5d. ${name}: Supabase Auth refuses its old refresh token`,
      refresh.status >= 400 && refresh.status < 500 && /refresh_token_not_found|session_not_found/.test(refresh.text),
      `${refresh.status} ${refresh.text}`);
  }
  // The database accepts the old access token until it expires, and phone A
  // signed in with the password minutes ago. The session check must stop it.
  const staleKey = await raw("POST", "/rest/v1/rpc/create_recovery_key", { token: kept["phone A"]?.access_token, body: {} });
  check("5e. An old token from a session the reset ended can't make a recovery key",
    staleKey.status >= 400 && staleKey.text.includes("Enter your password again to make a recovery key."),
    `${staleKey.status} ${staleKey.status < 300 ? "(a key was made)" : staleKey.text}`);
  const staleDelete = await raw("POST", "/rest/v1/rpc/delete_my_account", { token: kept["phone A"]?.access_token, body: {} });
  if (!check("5f. An old token from a session the reset ended can't delete the account",
    staleDelete.status >= 400 && staleDelete.text.includes("Enter your password again to delete your account."),
    `${staleDelete.status} ${staleDelete.status < 300 ? "(the account was deleted)" : staleDelete.text}`)) {
    if (staleDelete.status < 300) createdUserIds.delete(userId);
    return;
  }
  const oldPassword = await browser().auth.signInWithPassword({ email: loginId, password, options: captcha });
  check("5g. The old password no longer works", oldPassword.error?.code === "invalid_credentials", describe(oldPassword.error));

  // 6. Supabase's own "forgot password" is refused by the email hook and stores no code
  const before = await admin.auth.admin.getUserById(userId);
  const recover = await browser().auth.resetPasswordForEmail(loginId, { captchaToken: CAPTCHA_TOKEN });
  const after = await admin.auth.admin.getUserById(userId);
  check("6a. /recover for an existing username is refused by the email hook",
    recover.error?.status === 403 && recover.error.message === "ICEPik does not send email.",
    `${describe(recover.error)} (anything but 403 "ICEPik does not send email." means the hook didn't do the refusing: email_address_not_authorized, a rate limit or a CAPTCHA error came first, or the hook is off)`);
  check("6b. /recover recorded no reset (recovery_sent_at unchanged)",
    !before.error && !after.error && Boolean(after.data.user) &&
      after.data.user.recovery_sent_at === before.data.user.recovery_sent_at,
    `${describe(before.error ?? after.error)}; recovery_sent_at ${after.data.user?.recovery_sent_at}`);
  const unknown = await browser().auth.resetPasswordForEmail(`nobody_${suffix}@icepik.invalid`, { captchaToken: CAPTCHA_TOKEN });
  info("6c. /recover for a username that doesn't exist",
    `${describe(unknown.error)} (if this differs from 6a, the endpoint reveals whether a username exists; CAPTCHA is its brake)`);
  console.log(
    `      To confirm 6b fully, run in the scratch project's SQL Editor before the account is deleted:\n` +
      `        select recovery_token = '' as no_code, recovery_sent_at from auth.users where id = '${userId}';\n` +
      `        select count(*) as one_time_tokens from auth.one_time_tokens where user_id = '${userId}';\n` +
      `      Expect no_code = true, recovery_sent_at empty and 0 tokens.`,
  );
  if (process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    await prompt.question("      Run them now, then press Enter to continue and clean up. ");
    prompt.close();
  } else {
    console.log("      (Not a terminal, so no pause: the account is deleted next. Run the script in a terminal to check by hand.)");
  }

  // 7. Deleting the saved account right after a password sign-in
  const phoneC = browser();
  const signInC = await phoneC.auth.signInWithPassword({ email: loginId, password: newPassword, options: captcha });
  if (!check("7a. Sign in with the new password", !signInC.error, describe(signInC.error))) return;
  const removed = await phoneC.rpc("delete_my_account");
  const gone = await admin.auth.admin.getUserById(userId);
  if (check("7b. A saved account is deleted right after a password sign-in",
    !removed.error && Boolean(gone.error), describe(removed.error))) createdUserIds.delete(userId);

  // 8. An anonymous account deletes itself without a password
  if (!badAnon.error) {
    const anonDelete = await phoneBad.rpc("delete_my_account");
    if (check("8. An anonymous account deletes itself without a password", !anonDelete.error, describe(anonDelete.error))) {
      createdUserIds.delete(badAnon.data.user.id);
    }
  }
}

try {
  await main();
} catch (error) {
  check("Unexpected error", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`      Couldn't delete test account ${id}: ${describe(error)}. Delete it in Authentication -> Users.`);
  }
}

const count = (status) => results.filter((s) => s === status).length;
console.log(`\n${count("FAIL") ? `${count("FAIL")} check(s) FAILED` : "All checks passed"} (${count("PASS")} passed, ${count("INFO")} for information).`);
process.exit(count("FAIL") ? 1 : 0);
