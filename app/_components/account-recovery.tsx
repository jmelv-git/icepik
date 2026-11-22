"use client";

import type { User } from "@supabase/supabase-js";
import { Fragment, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { resetPasswordWithRecoveryKey } from "@/app/actions/recovery";
import {
  DEMO_RECOVERY_KEY_NOTE,
  PASSWORD_RULES,
  RECOVERY_KEY_RULES,
  RECOVERY_NO_MATCH,
  authErrorMessage,
  checkPassword,
  checkRecoveryKey,
  checkUsername,
  loginIdFor,
  normalizeRecoveryKey,
  normalizeUsername,
  recoveryKeyGroups,
  usernameOf,
} from "@/lib/accounts";
import { runAction } from "@/lib/run-action";
import type { Client } from "@/lib/supabase/client";
import { BrandLogo } from "./brand-logo";
import { Captcha, captchaEnabled } from "./captcha";
import { useDemo } from "./demo-context";

// The recovery-key screens in Settings: the key shown once, "Forgot
// password?", "Make a new recovery key", and the offer to make one after
// logging in to an account that has none. They use the Log in and Save account
// layout (form account-form), so phones show them as full pages over the lava
// lamp, and tablets and desktop as the glass dialog with the logo above it.
//
// A recovery key is kept in React state only, never in localStorage, cookies
// or a URL, and is gone once its screen closes.

export const CAPTCHA_FAILED =
  "The security check couldn't load. Check your connection, then go back and try again.";
const TRY_AGAIN = "Something went wrong. Please try again.";

// The Turnstile check for one form. A token works once: call used() after
// sending it, and the widget makes a new one.
export function useCaptcha(action: string, setMessage: Dispatch<SetStateAction<string | null>>) {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const widget = captchaEnabled ? (
    <Captcha
      action={action}
      onToken={(next) => {
        setToken(next);
        // The widget retries on its own after some errors.
        if (next) setMessage((current) => (current === CAPTCHA_FAILED ? null : current));
      }}
      onError={() => setMessage(CAPTCHA_FAILED)}
      resetKey={resetKey}
    />
  ) : null;
  return {
    widget,
    ready: !captchaEnabled || token !== null,
    options: token ? { captchaToken: token } : undefined,
    used: () => {
      if (captchaEnabled) setResetKey((count) => count + 1);
    },
  };
}

// Signs in with the password again, so the database will make a recovery key
// (it does only within 10 minutes of a password sign-in, from a session that
// still exists), then ends the session the sign-in replaced, so its IP
// address and browser don't stay on the server. That needs only the old
// session's own token, not a secret key.
export async function signInWithPasswordAgain(
  supabase: Client,
  loginId: string,
  password: string,
  options: { captchaToken: string } | undefined,
) {
  const {
    data: { session: before },
  } = await supabase.auth.getSession();
  const { error } = await supabase.auth.signInWithPassword({ email: loginId, password, options });
  if (error) return error;
  if (before) await supabase.auth.admin.signOut(before.access_token, "local").catch(() => undefined);
  return null;
}

// Why the key is on screen: just saved, after a reset, a replacement, or an
// account's first key made later.
export type KeyReason = "saved" | "reset" | "new" | "first";
export type ShownKey = { key: string; reason: KeyReason; username: string; signedIn: boolean };

export function RecoveryKeyShown({ shown, onDone }: { shown: ShownKey; onDone: () => void }) {
  const [stored, setStored] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const checkbox = useRef<HTMLInputElement>(null);
  const errorId = `${useId()}-error`;
  const groups = recoveryKeyGroups(shown.key);
  const text = groups.join("-");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(
        "Copied. Paste it into your password manager, then copy something else, so the key doesn't stay on your clipboard.",
      );
    } catch {
      setCopyStatus("This browser didn't let ICEPik copy it. Write the key down instead.");
    }
  }

  const intro = {
    saved: `Your account is saved as ${shown.username}. This is its recovery key.`,
    reset: shown.signedIn
      ? `Your password is changed and you're logged in as ${shown.username}. This is your new recovery key: the one you used no longer works.`
      : `Your password is changed. This is your new recovery key: the one you used no longer works.`,
    new: "This is your new recovery key. The old one no longer works.",
    first: "This is your recovery key.",
  }[shown.reason];

  return (
    <div className="form account-form">
      <BrandLogo className="auth-logo" />
      <div className="account-card">
        <h3>Your recovery key</h3>
        <p>{intro} ICEPik shows it only this once.</p>
        {/* Every character in view: it wraps only between groups of 4. */}
        <p className="recovery-key">
          {groups.map((group, index) => (
            <Fragment key={index}>
              <span>{index < groups.length - 1 ? `${group}-` : group}</span>
              {index < groups.length - 1 ? <wbr /> : null}
            </Fragment>
          ))}
        </p>
        {/* What Copy did, under it. Empty, it takes no room. */}
        <div className="copy-block">
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={copy}>
              Copy
            </button>
          </div>
          <p className="detail-hint" role="status">
            {copyStatus}
          </p>
        </div>
        <ul className="warning-list">
          <li>
            Write it on paper or keep it in a password manager. Don&apos;t keep it in a note, photo
            or file on this phone.
          </li>
          <li>Anyone with your username and this key can set a new password for your account.</li>
          <li>Without this key, a forgotten password means starting a new account.</li>
        </ul>
        <label className="check-row">
          <input
            ref={checkbox}
            type="checkbox"
            checked={stored}
            onChange={(event) => setStored(event.target.checked)}
            {...(nudge && !stored ? { "aria-invalid": true, "aria-describedby": errorId } : {})}
          />
          <span>I&apos;ve written down or stored my recovery key.</span>
        </label>
        {nudge && !stored ? (
          <p id={errorId} className="form-error" role="alert">
            Store your key first, then tick the box.
          </p>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (stored) return onDone();
              setNudge(true);
              checkbox.current?.focus();
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// "Forgot password?" on Log in. On /demo, the demo's own reset: any letters
// and numbers work as the key, and the screen says so.
export function ForgotPassword({
  supabase,
  user,
  activePosts,
  onBack,
  onKey,
}: {
  supabase: Client;
  user: User | null;
  activePosts: number;
  onBack: () => void;
  onKey: (shown: ShownKey) => void;
}) {
  const demo = useDemo();
  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The fields the message is about ("match": the username and the key).
  const [field, setField] = useState<"username" | "key" | "match" | "password" | "repeat" | null>(null);
  const captcha = useCaptcha("reset-password", setMessage);
  const errorId = `${useId()}-error`;
  const invalid = (name: "username" | "key" | "password" | "repeat") =>
    field === name || (field === "match" && (name === "username" || name === "key"))
      ? { "aria-invalid": true, "aria-describedby": errorId }
      : {};
  const unsaved = user?.is_anonymous ?? false;

  async function reset(event: React.FormEvent) {
    event.preventDefault();
    const problems: [typeof field, string | null][] = [
      ["username", checkUsername(username)],
      ["key", checkRecoveryKey(key, demo)],
      ["password", checkPassword(password)],
      ["repeat", password === repeat ? null : "The passwords don't match."],
    ];
    const problem = problems.find(([, text]) => text);
    if (problem) {
      setField(problem[0]);
      return setMessage(problem[1]);
    }

    setBusy(true);
    setMessage(null);
    setField(null);
    const name = normalizeUsername(username);
    const result = await runAction(() =>
      resetPasswordWithRecoveryKey(
        { username: name, recoveryKey: normalizeRecoveryKey(key), newPassword: password },
        demo,
      ),
    );
    if (!result.ok) {
      setBusy(false);
      // The server's answers about the new password (lib/accounts.ts and
      // app/actions/recovery.ts) point at that field.
      const aboutPassword =
        result.message.startsWith("Use a password") ||
        result.message.startsWith("That password") ||
        result.message === "Choose a stronger password.";
      setField(result.message === RECOVERY_NO_MATCH ? "match" : aboutPassword ? "password" : null);
      return setMessage(result.message);
    }
    // The used key no longer works. Sign in with the new password and this
    // form's CAPTCHA token, which the reset didn't use, while the new key
    // shows. If that fails, the key still shows and Done goes to Log in.
    const signIn = await supabase.auth.signInWithPassword({
      email: loginIdFor(name),
      password,
      options: captcha.options,
    });
    captcha.used();
    setBusy(false);
    onKey({ key: result.data.newRecoveryKey, reason: "reset", username: name, signedIn: !signIn.error });
  }

  return (
    <form className="form account-form" onSubmit={reset} noValidate>
      <BrandLogo className="auth-logo" />
      <div className="account-card">
        <h3>Reset your password</h3>
        <p>Use the recovery key ICEPik showed you when you saved your account.</p>
        {unsaved ? (
          <ul className="warning-list">
            <li>
              This device&apos;s account isn&apos;t saved
              {activePosts ? `, and it has ${activePosts} sighting${activePosts === 1 ? "" : "s"} on the map` : ""}.
              If you reset and log in to another account, you can&apos;t get back to this one.
            </li>
          </ul>
        ) : null}
        <label>
          Username
          <input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            {...invalid("username")}
          />
        </label>
        <label>
          Recovery key
          <input
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            {...invalid("key")}
          />
          <small>{RECOVERY_KEY_RULES}</small>
          {demo ? <small>{DEMO_RECOVERY_KEY_NOTE}</small> : null}
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            {...invalid("password")}
          />
          <small>{PASSWORD_RULES}</small>
        </label>
        <label>
          Repeat new password
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            {...invalid("repeat")}
          />
        </label>
        {captcha.widget}
        {message ? (
          <p id={errorId} className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button type="submit" className="primary-button" disabled={busy || !captcha.ready}>
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </div>
    </form>
  );
}

// "Make a new recovery key" in Settings: the password first, because the
// database makes a key only within 10 minutes of a password sign-in.
export function MakeRecoveryKey({
  supabase,
  user,
  hasKey,
  onBack,
  onKey,
}: {
  supabase: Client;
  user: User | null;
  hasKey: boolean | null;
  onBack: () => void;
  onKey: (shown: ShownKey) => void;
}) {
  const loginId = user?.email ?? null;
  const username = usernameOf(user) ?? loginId ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wrongPassword, setWrongPassword] = useState(false);
  const captcha = useCaptcha("recovery-key", setMessage);
  const errorId = `${useId()}-error`;
  const invalid = wrongPassword ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  async function make(event: React.FormEvent) {
    event.preventDefault();
    if (!loginId) return setMessage("Save your account with a username and password first.");
    if (!password) {
      setWrongPassword(true);
      return setMessage("Enter your password to make a recovery key.");
    }

    setBusy(true);
    setMessage(null);
    setWrongPassword(false);
    const error = await signInWithPasswordAgain(supabase, loginId, password, captcha.options);
    captcha.used();
    if (error) {
      setBusy(false);
      setWrongPassword(error.code === "invalid_credentials");
      return setMessage(error.code === "invalid_credentials" ? "That password is wrong." : authErrorMessage(error));
    }
    // Any older key stops working.
    const { data: key, error: keyError } = await supabase.rpc("create_recovery_key");
    setBusy(false);
    if (keyError || !key) {
      // P0001: a message from ICEPik's own database checks, written for users.
      return setMessage(keyError?.code === "P0001" ? keyError.message : TRY_AGAIN);
    }
    onKey({ key, reason: hasKey === false ? "first" : "new", username, signedIn: true });
  }

  return (
    <form className="form account-form" onSubmit={make} noValidate>
      <BrandLogo className="auth-logo" />
      <div className="account-card">
        <h3>{hasKey === false ? "Make a recovery key" : "Make a new recovery key"}</h3>
        <p>
          {hasKey === false
            ? "With a recovery key, you can set a new password if you forget yours."
            : "Your current recovery key stops working as soon as the new one is made."}
        </p>
        {/* Tells password managers which saved login to fill. */}
        <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
        <label>
          Password for {username}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            {...invalid}
          />
          <small>Needed to make a recovery key.</small>
        </label>
        {captcha.widget}
        {message ? (
          <p id={errorId} className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button type="submit" className="primary-button" disabled={busy || !captcha.ready}>
            {busy ? "Making…" : hasKey === false ? "Make a key" : "Make new key"}
          </button>
        </div>
      </div>
    </form>
  );
}

// Right after logging in to a saved account with no recovery key (an
// interrupted save, or an account from before recovery keys): asked once per
// log-in, and nothing about it is stored. The log-in was a password sign-in,
// so the key can be made at once; ten minutes later it needs the password.
export function AskForRecoveryKey({
  supabase,
  username,
  onLater,
  onKey,
  onNeedPassword,
}: {
  supabase: Client;
  username: string;
  onLater: () => void;
  onKey: (shown: ShownKey) => void;
  onNeedPassword: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setMessage(null);
    const { data: key, error } = await supabase.rpc("create_recovery_key");
    setBusy(false);
    if (!error && key) return onKey({ key, reason: "first", username, signedIn: true });
    if (error?.code === "P0001" && error.message.startsWith("Enter your password again")) return onNeedPassword();
    setMessage(error?.code === "P0001" ? error.message : TRY_AGAIN);
  }

  return (
    <div className="form account-form">
      <BrandLogo className="auth-logo" />
      <div className="account-card">
        <h3>Make a recovery key</h3>
        <p>
          You&apos;re logged in as {username}. This account has no recovery key, so if you forget
          your password, you&apos;d have to start a new account. ICEPik can make one now and show it
          once.
        </p>
        {message ? (
          <p className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onLater} disabled={busy}>
            Not now
          </button>
          <button type="button" className="primary-button" onClick={make} disabled={busy}>
            {busy ? "Making…" : "Make my recovery key"}
          </button>
        </div>
      </div>
    </div>
  );
}
