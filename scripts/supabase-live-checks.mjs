#!/usr/bin/env node
// Checks the Supabase Auth behaviour ICEPik's accounts depend on, against a
// SCRATCH Supabase project. Run it before building the recovery-key screens,
// and again after Supabase upgrades. It creates a few throwaway accounts named
// livecheck_… and deletes them at the end.
//
// Set up the scratch project first, the same way as production:
//   1. Run database/icepik_schema.sql in its SQL Editor.
//   2. Authentication settings: anonymous sign-ins ON, Confirm email OFF,
//      Minimum password length 15, Require current password when changing
//      password ON, Secure password change OFF, audit logs to the database OFF,
//      Hooks -> Send Email -> Postgres -> public.block_auth_emails.
//   3. CAPTCHA ON with provider Turnstile and Cloudflare's test secret key
//      1x0000000000000000000000000000000AA, which accepts the dummy token
//      this script sends. Never use the test key on the production project.
//
// Then, from the repository root:
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
const pass = (name, detail) => report("PASS", name, detail);
const fail = (name, detail) => report("FAIL", name, detail);
const info = (name, detail) => report("INFO", name, detail);
const describe = (error) => (error ? `${error.status ?? "?"} ${error.code ?? "(no code)"}: ${error.message}` : "no error");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const browser = () => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options);
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, options);
const captcha = { captchaToken: CAPTCHA_TOKEN };

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
const passwordSignIn = (session) =>
  (Array.isArray(claims(session).amr) ? claims(session).amr : []).find((entry) => entry?.method === "password");

async function main() {
  console.log(`Scratch project: ${new URL(SUPABASE_URL).host}\nTest username: ${username}\n`);

  // 1. Anonymous sign-in, with the username-rule trigger on auth.users
  const phoneA = browser();
  const anon = await phoneA.auth.signInAnonymously({ options: captcha });
  if (anon.error || !anon.data.user?.is_anonymous) {
    fail("1. Anonymous sign-in works with the trigger on auth.users", describe(anon.error));
    return;
  }
  createdUserIds.add(anon.data.user.id);
  const userId = anon.data.user.id;
  pass("1. Anonymous sign-in works with the trigger on auth.users");

  // 2. Saving the anonymous account while "Require current password" is on
  const saved = await phoneA.auth.updateUser({ email: loginId, password });
  if (saved.error) {
    fail("2. Saving an anonymous account (Require current password ON)", describe(saved.error));
    return;
  }
  saved.data.user?.email === loginId && saved.data.user?.is_anonymous === false
    ? pass("2. Saving an anonymous account (Require current password ON)",
        "Confirm the setting really is ON in the scratch project: the script can't read it.")
    : fail("2. Saving an anonymous account", `email ${saved.data.user?.email}, is_anonymous ${saved.data.user?.is_anonymous}`);

  // 2b. The username rule refuses a bad login ID
  const phoneBad = browser();
  const badAnon = await phoneBad.auth.signInAnonymously({ options: captcha });
  if (badAnon.data.user) createdUserIds.add(badAnon.data.user.id);
  const bad = await phoneBad.auth.updateUser({ email: "Bad.Name@icepik.invalid", password });
  bad.error
    ? pass("2b. A login ID that breaks the username rule is refused", describe(bad.error))
    : fail("2b. A login ID that breaks the username rule is refused", "Supabase accepted Bad.Name@icepik.invalid");

  // 3. The token right after saving has no password sign-in: no key, no delete
  const refreshedAfterSave = await phoneA.auth.refreshSession();
  const tokenAfterSave = claims(refreshedAfterSave.data.session);
  info("3. Token after saving and refreshing", `is_anonymous ${tokenAfterSave.is_anonymous}, amr ${JSON.stringify(tokenAfterSave.amr)}`);
  const keyTooSoon = await phoneA.rpc("create_recovery_key");
  keyTooSoon.error?.message === "Enter your password again to make a recovery key."
    ? pass("3a. No recovery key before a password sign-in")
    : fail("3a. No recovery key before a password sign-in", keyTooSoon.error ? describe(keyTooSoon.error) : "a key was made");
  const deleteTooSoon = await phoneA.rpc("delete_my_account");
  deleteTooSoon.error?.message === "Enter your password again to delete your account."
    ? pass("3b. A saved account can't be deleted before a password sign-in")
    : fail("3b. A saved account can't be deleted before a password sign-in", deleteTooSoon.error ? describe(deleteTooSoon.error) : "the account was deleted");
  if (!deleteTooSoon.error) return;

  // 4. The amr claim after a password sign-in, and after a refresh
  const signIn = await phoneA.auth.signInWithPassword({ email: loginId, password, options: captcha });
  if (signIn.error) {
    fail("4. Password sign-in", describe(signIn.error));
    return;
  }
  const entry = passwordSignIn(signIn.data.session);
  const now = Math.floor(Date.now() / 1000);
  entry && typeof entry.timestamp === "number" && Math.abs(entry.timestamp - now) < 300
    ? pass("4a. amr after sign-in has {method: 'password', timestamp: <now>}", JSON.stringify(claims(signIn.data.session).amr))
    : fail("4a. amr after sign-in has {method: 'password', timestamp: <now>}", JSON.stringify(claims(signIn.data.session).amr));
  const refreshed = await phoneA.auth.refreshSession();
  const afterRefresh = passwordSignIn(refreshed.data.session);
  afterRefresh && afterRefresh.timestamp === entry?.timestamp
    ? pass("4b. A refresh keeps the original sign-in time in amr", JSON.stringify(claims(refreshed.data.session).amr))
    : fail("4b. A refresh keeps the original sign-in time in amr",
        `${describe(refreshed.error)}; amr ${JSON.stringify(claims(refreshed.data.session).amr)}. If the time moved, refreshing would bypass the 10-minute rule.`);

  const key = await phoneA.rpc("create_recovery_key");
  const keyShape = /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/;
  typeof key.data === "string" && keyShape.test(key.data)
    ? pass("4c. Recovery key made right after the password sign-in (8 groups of 4)")
    : fail("4c. Recovery key made right after the password sign-in", describe(key.error));
  const hasKey = await phoneA.rpc("has_recovery_key");
  hasKey.data === true ? pass("4d. has_recovery_key() is true") : fail("4d. has_recovery_key() is true", describe(hasKey.error));
  const readKeys = await phoneA.from("recovery_keys").select("*");
  readKeys.error
    ? pass("4e. The browser can't read recovery_keys", describe(readKeys.error))
    : fail("4e. The browser can't read recovery_keys", `returned ${readKeys.data?.length} rows`);
  if (typeof key.data !== "string") return;

  // 5. A reset through the admin API ends every session
  const phoneB = browser();
  const signInB = await phoneB.auth.signInWithPassword({ email: loginId, password, options: captcha });
  if (signInB.error) {
    fail("5. Second device signs in", describe(signInB.error));
    return;
  }
  const match = await admin.rpc("check_recovery_key", { p_username: username, p_key: key.data });
  match.data === userId
    ? pass("5a. check_recovery_key finds the account")
    : fail("5a. check_recovery_key finds the account", describe(match.error));
  const reset = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (reset.error) {
    fail("5b. Admin password reset", describe(reset.error));
    return;
  }
  pass("5b. Admin password reset");
  for (const [name, phone] of [["phone A", phoneA], ["phone B", phoneB]]) {
    // Ask the server about the device's existing access token first: a failed
    // refresh makes supabase-js drop its local session, and getUser() would
    // then fail without asking the server at all.
    const { data: { session: kept } } = await phone.auth.getSession();
    const userAfterReset = await phone.auth.getUser(kept?.access_token);
    userAfterReset.error
      ? pass(`5c. ${name}: the server rejects its access token after the reset (getUser), so the app can sign out`,
          describe(userAfterReset.error))
      : info(`5c. ${name}: the server still accepts its access token after the reset`,
          "It stays valid until it expires (1 hour by default); the app can't detect the reset sooner with getUser().");
    const refreshAfterReset = await phone.auth.refreshSession();
    refreshAfterReset.error
      ? pass(`5d. ${name} can't refresh its session after the reset`, describe(refreshAfterReset.error))
      : fail(`5d. ${name} can't refresh its session after the reset`, "the refresh token still works");
  }
  const oldPassword = await browser().auth.signInWithPassword({ email: loginId, password, options: captcha });
  oldPassword.error?.code === "invalid_credentials"
    ? pass("5e. The old password no longer works")
    : fail("5e. The old password no longer works", describe(oldPassword.error));

  // 6. Supabase's own "forgot password" stores no code
  const before = await admin.auth.admin.getUserById(userId);
  const recover = await browser().auth.resetPasswordForEmail(loginId, { captchaToken: CAPTCHA_TOKEN });
  const after = await admin.auth.admin.getUserById(userId);
  recover.error
    ? pass("6a. /recover for an existing username is refused by the email hook", describe(recover.error))
    : fail("6a. /recover for an existing username is refused by the email hook", "Supabase accepted it: is the Send Email hook on?");
  after.data.user?.recovery_sent_at === before.data.user?.recovery_sent_at
    ? pass("6b. /recover recorded no reset (recovery_sent_at unchanged)")
    : fail("6b. /recover recorded no reset", `recovery_sent_at ${after.data.user?.recovery_sent_at}`);
  const unknown = await browser().auth.resetPasswordForEmail(`nobody_${suffix}@icepik.invalid`, { captchaToken: CAPTCHA_TOKEN });
  info("6c. /recover for a username that doesn't exist",
    `${describe(unknown.error)}. If this differs from 6a, the endpoint reveals whether a username exists; CAPTCHA is the only brake.`);
  console.log(
    `      To confirm 6b fully, run in the scratch project's SQL Editor:\n` +
    `        select recovery_token = '' as no_code, recovery_sent_at from auth.users where id = '${userId}';\n` +
    `        select count(*) as one_time_tokens from auth.one_time_tokens where user_id = '${userId}';\n` +
    `      Expect no_code = true, recovery_sent_at empty and 0 tokens.`,
  );

  // 7. Deleting the saved account right after a password sign-in
  const phoneC = browser();
  const signInC = await phoneC.auth.signInWithPassword({ email: loginId, password: newPassword, options: captcha });
  if (signInC.error) {
    fail("7. Sign in with the new password", describe(signInC.error));
    return;
  }
  pass("7a. Sign in with the new password");
  const removed = await phoneC.rpc("delete_my_account");
  const gone = await admin.auth.admin.getUserById(userId);
  !removed.error && gone.error
    ? pass("7b. A saved account is deleted right after a password sign-in")
    : fail("7b. A saved account is deleted right after a password sign-in", describe(removed.error));
  if (!removed.error) createdUserIds.delete(userId);

  // 8. An anonymous account deletes itself without a password
  const anonDelete = await phoneBad.rpc("delete_my_account");
  if (!anonDelete.error && badAnon.data.user) createdUserIds.delete(badAnon.data.user.id);
  anonDelete.error
    ? fail("8. An anonymous account deletes itself without a password", describe(anonDelete.error))
    : pass("8. An anonymous account deletes itself without a password");
}

try {
  await main();
} catch (error) {
  fail("Unexpected error", error instanceof Error ? error.message : String(error));
} finally {
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`      Couldn't delete test account ${id}: ${describe(error)}. Delete it in Authentication -> Users.`);
  }
}

const failed = results.filter((status) => status === "FAIL").length;
console.log(`\n${failed ? `${failed} check(s) FAILED` : "All checks passed"} (${results.filter((s) => s === "PASS").length} passed, ${results.filter((s) => s === "INFO").length} for information).`);
process.exit(failed ? 1 : 0);
