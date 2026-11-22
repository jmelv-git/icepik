"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useId, useRef, useState } from "react";
import {
  PASSWORD_RULES,
  USERNAME_RULES,
  authErrorMessage,
  checkPassword,
  checkUsername,
  loginIdFor,
  normalizeUsername,
  usernameOf,
} from "@/lib/accounts";
import {
  CUSTOM_PLACES_MAX,
  clearDeviceStorage,
  rememberBackgroundMotion,
  removeCustomPlace,
  savePlace,
  useBackgroundMotion,
  type CustomPlace,
  type PlaceName,
  type SavedPlace,
  type SavedPlaces,
} from "@/lib/device-storage";
import { ONE_MILE_M, distanceMeters } from "@/lib/geo";
import type { Sighting } from "@/lib/sightings";
import { projectFor } from "@/lib/supabase/config";
import { createClient, forgetSession, type Client } from "@/lib/supabase/client";
import type { ProfileTotals } from "@/lib/use-my-activity";
import {
  AskForRecoveryKey,
  CAPTCHA_FAILED,
  ForgotPassword,
  MakeRecoveryKey,
  RecoveryKeyShown,
  signInWithPasswordAgain,
  useCaptcha,
  type ShownKey,
} from "./account-recovery";
import { BrandLogo } from "./brand-logo";
import { DEMO_ABOUT, useDemo } from "./demo-context";
import { Captcha, captchaEnabled } from "./captcha";
import { PlaceIcon } from "./icons";
import { PolicyText } from "./policy";

// forgot: "Forgot password?" from Log in. key: a recovery key, shown once.
// newkey: "Make a new recovery key". nokey: the offer to make one after
// logging in to an account without one (account-recovery.tsx).
type View =
  | "main"
  | "save"
  | "login"
  | "delete"
  | "clear"
  | "policy"
  | "forgot"
  | "key"
  | "newkey"
  | "nokey";

// What the browser's confirm asks when Settings is closed while a recovery
// key is on screen.
const CLOSE_WITH_KEY =
  "Close without storing your recovery key? ICEPik can't show it again.";

type Props = {
  supabase: Client;
  user: User | null;
  profile: ProfileTotals | null;
  activePosts: number;
  reloadActivity: () => void;
  sightings: Sighting[];
  places: SavedPlaces;
  customPlaces: CustomPlace[];
  onPickPlace: (name: PlaceName | "custom") => void;
  onShowPlace: (place: SavedPlace) => void;
  onNotice: (message: string) => void;
  onClose: () => void;
  // Sets what closing Settings (Close, Escape, a click outside) must ask
  // first, or null to close at once.
  onCloseGuard: (question: string | null) => void;
};

export const PLACE_LABEL: Record<PlaceName, string> = { home: "Home", work: "Work" };

export function SettingsDialog(props: Props) {
  const { supabase, user, reloadActivity, onNotice, onClose, onCloseGuard } = props;
  const [view, setView] = useState<View>("main");
  // The recovery key on screen, if any. React state only: it's gone when
  // its screen or Settings closes.
  const [shownKey, setShownKey] = useState<ShownKey | null>(null);
  // Whether the saved account has a recovery key (null: not known).
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const username = usernameOf(user);

  // Fresh totals each time Settings opens.
  useEffect(() => {
    reloadActivity();
  }, [reloadActivity]);

  // A saved account without a recovery key is told so in Settings.
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    void supabase.rpc("has_recovery_key").then(({ data, error }) => {
      if (!cancelled) setHasKey(error || typeof data !== "boolean" ? null : data);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, username]);

  // Closing Settings while a key shows asks first.
  useEffect(() => {
    onCloseGuard(view === "key" ? CLOSE_WITH_KEY : null);
  }, [view, onCloseGuard]);
  useEffect(() => () => onCloseGuard(null), [onCloseGuard]);

  // Each view starts at the top. Its heading takes focus, so keyboard users
  // carry on from the top and screen readers read it; Back returns focus to
  // the button that opened the view, so keyboard users keep their place.
  const opener = useRef<View>("main");
  const focusNext = useRef<string | null>(null);
  const go = (next: View, focus: string | null = null) => {
    focusNext.current = focus;
    setView(next);
  };
  const open = (next: View) => {
    opener.current = next;
    go(next);
  };
  const back = () => go("main", `[data-opens="${opener.current}"]`);
  const showKey = (shown: ShownKey) => {
    setShownKey(shown);
    go("key");
  };
  useEffect(() => {
    // The dialog scrolls on tablets and desktop; on phones Log in, Save
    // account and the recovery screens are pages, and the layer scrolls.
    document.querySelector(".modal")?.scrollTo(0, 0);
    document.querySelector(".modal-layer")?.scrollTo(0, 0);
    const target = focusNext.current ? document.querySelector<HTMLElement>(focusNext.current) : null;
    focusNext.current = null;
    if (target) return target.focus();
    if (view === "main") return;
    const heading = document.querySelector<HTMLElement>(".modal .settings h3");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [view]);

  // The key has been stored: where each way of getting one goes next.
  function keyDone(shown: ShownKey) {
    setShownKey(null);
    onCloseGuard(null);
    if (shown.reason === "saved") {
      setHasKey(true);
      onNotice(`Account saved. Your username is ${shown.username}.`);
      return go("main", '[data-opens="newkey"]');
    }
    if (shown.reason === "reset" && !shown.signedIn) {
      onNotice("Your password is changed. Log in with your new password.");
      return go("login");
    }
    if (shown.reason === "reset" || opener.current !== "newkey") {
      // After a reset or a log-in, Settings closes as after any log-in.
      onNotice(`Logged in as ${shown.username}.`);
      return onClose();
    }
    setHasKey(true);
    onNotice(
      shown.reason === "first"
        ? "Your recovery key is ready."
        : "Your new recovery key is ready. The old one no longer works.",
    );
    go("main", '[data-opens="newkey"]');
  }

  return (
    <div className="settings">
      {view === "main" ? <MainView {...props} hasKey={hasKey} onOpen={open} /> : null}
      {view === "save" ? (
        <SaveAccount
          {...props}
          onBack={back}
          onSaved={(name, key) => {
            if (key) return showKey({ key, reason: "saved", username: name, signedIn: true });
            // Saved, but the sign-in or the key didn't work. Settings says
            // the account has no key and offers to make one.
            setHasKey(false);
            onNotice("Your account is saved. Make your recovery key in Settings.");
            go("main", '[data-opens="newkey"]');
          }}
        />
      ) : null}
      {view === "login" ? (
        <LogIn
          {...props}
          onBack={back}
          onForgot={() => go("forgot")}
          onNoKey={() => {
            setHasKey(false);
            go("nokey");
          }}
        />
      ) : null}
      {view === "forgot" ? (
        <ForgotPassword
          supabase={supabase}
          user={user}
          activePosts={props.activePosts}
          onBack={() => go("login", '[data-opens="forgot"]')}
          onKey={showKey}
        />
      ) : null}
      {view === "newkey" ? (
        <MakeRecoveryKey supabase={supabase} user={user} hasKey={hasKey} onBack={back} onKey={showKey} />
      ) : null}
      {view === "nokey" ? (
        <AskForRecoveryKey
          supabase={supabase}
          username={username ?? ""}
          onLater={() => {
            onNotice(`Logged in as ${username}.`);
            onClose();
          }}
          onKey={showKey}
          onNeedPassword={() => go("newkey")}
        />
      ) : null}
      {view === "key" && shownKey ? (
        <RecoveryKeyShown shown={shownKey} onDone={() => keyDone(shownKey)} />
      ) : null}
      {view === "delete" ? <DeleteAccount {...props} onBack={back} /> : null}
      {view === "clear" ? <ClearDevice {...props} onBack={back} /> : null}
      {view === "policy" ? (
        <>
          <PolicyText />
          {/* Stays in view while the terms scroll, so you can go back from anywhere. */}
          <div className="form-actions sticky-actions">
            <button type="button" className="secondary-button" onClick={back}>
              Back
            </button>
          </div>
        </>
      ) : null}
      {user === null && view === "main" ? (
        <p className="detail-hint">Your account is still being set up.</p>
      ) : null}
    </div>
  );
}

function MainView({
  user,
  profile,
  activePosts,
  sightings,
  places,
  customPlaces,
  onPickPlace,
  onShowPlace,
  hasKey,
  onOpen,
}: Props & { hasKey: boolean | null; onOpen: (view: View) => void }) {
  const username = usernameOf(user);
  const motion = useBackgroundMotion();
  const demo = useDemo();
  const [placeStatus, setPlaceStatus] = useState("");
  const nearby = (place: SavedPlace) => {
    const near = sightings.filter(
      (s) => distanceMeters(place.lat, place.lng, s.lat, s.lng) <= ONE_MILE_M,
    ).length;
    return `${near} ${near === 1 ? "sighting" : "sightings"} within 1 mile`;
  };

  return (
    <>
      {demo ? (
        <section className="settings-section" aria-labelledby="demo-title">
          <h3 id="demo-title">Demo</h3>
          <p>{DEMO_ABOUT} Your account here is a demo account, separate from the real map.</p>
        </section>
      ) : null}
      <section className="settings-section" aria-labelledby="account-title">
        <h3 id="account-title">Account</h3>
        {username ? (
          <p>
            Saved as <strong>{username}</strong>. Log in with this username to use your account on
            another phone.
          </p>
        ) : (
          <p>
            You&apos;re using an anonymous account that lives on this device. Save it with a username
            and password to keep it if you switch phones.
          </p>
        )}
        <div className="button-row">
          {username ? null : (
            <button type="button" className="primary-button" data-opens="save" onClick={() => onOpen("save")} disabled={!user}>
              Save account
            </button>
          )}
          <button type="button" className="secondary-button" data-opens="login" onClick={() => onOpen("login")}>
            {username ? "Log in to another account" : "Log in"}
          </button>
        </div>
        <dl className="totals">
          <div>
            <dt>Sightings posted</dt>
            <dd>{profile?.sightings_posted ?? "–"}</dd>
          </div>
          <div>
            <dt>Votes cast</dt>
            <dd>{profile?.votes_cast ?? "–"}</dd>
          </div>
          <div>
            <dt>On the map now</dt>
            <dd>{activePosts}</dd>
          </div>
        </dl>
      </section>

      {username ? (
        <section className="settings-section" aria-labelledby="recovery-title">
          <h3 id="recovery-title">Recovery key</h3>
          {hasKey === false ? (
            <p>
              This account has no recovery key yet. Without one, a forgotten password means starting
              a new account.
            </p>
          ) : (
            <p>
              Your recovery key lets you set a new password if you forget yours. If you think someone
              saw it, make a new one: the old one then stops working.
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className={hasKey === false ? "primary-button" : "secondary-button"}
              data-opens="newkey"
              onClick={() => onOpen("newkey")}
            >
              {hasKey === false ? "Make a recovery key" : "Make a new recovery key"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="settings-section" aria-labelledby="places-title">
        <h3 id="places-title">Saved places</h3>
        <p className="detail-hint">
          Kept on this device only and never sent anywhere. ICEPik checks them against the
          sightings already on your map.
        </p>
        <ul className="place-list">
          {(["home", "work"] as const).map((name) => {
            const place = places[name];
            return (
              <li key={name} className="place-row">
                <span className="place-icon">
                  <PlaceIcon name={name} />
                </span>
                <span className="row-text">
                  <span className="row-address">{PLACE_LABEL[name]}</span>
                  <span className="row-meta">{place ? nearby(place) : "Not set"}</span>
                </span>
                <span className="place-actions">
                  {place ? (
                    <>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Show ${PLACE_LABEL[name]}`}
                        onClick={() => onShowPlace(place)}
                      >
                        Show
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Remove ${PLACE_LABEL[name]}`}
                        onClick={() =>
                          setPlaceStatus(
                            savePlace(name, null)
                              ? `${PLACE_LABEL[name]} removed from this device.`
                              : `Couldn't remove ${PLACE_LABEL[name]}. Your browser's storage is blocked.`,
                          )
                        }>
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Set on map: ${PLACE_LABEL[name]}`}
                      onClick={() => onPickPlace(name)}
                    >
                      Set on map
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {customPlaces.map((place) => (
            <li key={place.id} className="place-row">
              <span className="place-icon">
                <PlaceIcon name="custom" />
              </span>
              <span className="row-text">
                <span className="row-address">{place.name}</span>
                <span className="row-meta">{nearby(place)}</span>
              </span>
              <span className="place-actions">
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Show ${place.name}`}
                  onClick={() => onShowPlace(place)}
                >
                  Show
                </button>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Delete ${place.name}`}
                  onClick={() => {
                    setPlaceStatus(
                      removeCustomPlace(place.id)
                        ? `${place.name} deleted from this device.`
                        : `Couldn't delete ${place.name}. Your browser's storage is blocked.`,
                    );
                  }}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
        {customPlaces.length < CUSTOM_PLACES_MAX ? (
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => onPickPlace("custom")}>
              Add a place
            </button>
          </div>
        ) : (
          <p className="detail-hint">
            You&apos;ve saved {CUSTOM_PLACES_MAX} places, as many as ICEPik keeps. Delete one to add
            another.
          </p>
        )}
        <p className="detail-hint">
          You can also save a place you searched for: tap the star in the search box.
        </p>
        {/* Says what Remove and Delete did, also to screen readers. */}
        <p className="detail-hint" role="status">
          {placeStatus}
        </p>
      </section>

      <section className="settings-section" aria-labelledby="display-title">
        <h3 id="display-title">Display</h3>
        <label className="switch-row">
          <span className="switch-text">
            <span id="motion-label" className="switch-label">
              Moving background
            </span>
            <span id="motion-hint" className="detail-hint">
              The slow blue background of the terms, Log in and Save account. Your choice stays on
              this device.
            </span>
          </span>
          <span className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={motion}
              onChange={(event) => rememberBackgroundMotion(event.target.checked)}
              aria-labelledby="motion-label"
              aria-describedby="motion-hint"
            />
            <span className="switch-track" aria-hidden="true" />
          </span>
        </label>
      </section>

      <section className="settings-section" aria-labelledby="privacy-title">
        <h3 id="privacy-title">Privacy</h3>
        <div className="button-column">
          <button type="button" className="secondary-button" data-opens="policy" onClick={() => onOpen("policy")}>
            Terms and privacy
          </button>
          <button type="button" className="secondary-button" data-opens="clear" onClick={() => onOpen("clear")}>
            Clear this device
          </button>
          <button
            type="button"
            className="danger-button"
            data-opens="delete"
            onClick={() => onOpen("delete")}
            disabled={!user}
          >
            Delete my account
          </button>
        </div>
      </section>
    </>
  );
}

function SaveAccount({
  supabase,
  onBack,
  onSaved,
}: Props & { onBack: () => void; onSaved: (username: string, recoveryKey: string | null) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // For the sign-in with the new password that comes after saving.
  const captcha = useCaptcha("save-account", setMessage);
  // The field the message is about: it says it's invalid and points at it.
  const [field, setField] = useState<"username" | "password" | "repeat" | null>(null);
  const errorId = `${useId()}-error`;
  const invalid = (name: typeof field) =>
    field === name ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const usernameProblem = checkUsername(username);
    const passwordProblem = checkPassword(password);
    const repeatProblem = password === repeat ? null : "The passwords don't match.";
    const problem = usernameProblem ?? passwordProblem ?? repeatProblem;
    if (problem) {
      setField(usernameProblem ? "username" : passwordProblem ? "password" : "repeat");
      return setMessage(problem);
    }

    setBusy(true);
    setMessage(null);
    setField(null);
    // Same user id: posts and votes stay with the account.
    const { error } = await supabase.auth.updateUser({ email: loginIdFor(username), password });
    if (error) {
      setBusy(false);
      const code = error.code ?? "";
      setField(
        ["email_exists", "user_already_exists", "email_address_invalid"].includes(code)
          ? "username"
          : code === "weak_password"
            ? "password"
            : null,
      );
      return setMessage(authErrorMessage(error));
    }
    // Saved. The database makes a recovery key only within 10 minutes of a
    // password sign-in, so sign in with the new password (this form's CAPTCHA
    // token), then make the key and show it once. If a step fails, the
    // account is still saved, and Settings offers to make the key.
    const name = normalizeUsername(username);
    const signInError = await signInWithPasswordAgain(supabase, loginIdFor(name), password, captcha.options);
    captcha.used();
    const { data: key } = signInError ? { data: null } : await supabase.rpc("create_recovery_key");
    setBusy(false);
    onSaved(name, typeof key === "string" && key ? key : null);
  }

  return (
    <form className="form account-form" onSubmit={save} noValidate>
      {/* Phones only (with :has(), tablets and desktop show the logo above the
          dialog instead): these read as sign-in pages there. */}
      <BrandLogo className="auth-logo" />
      {/* The card on phones; elsewhere this box doesn't exist (CSS). */}
      <div className="account-card">
        <h3>Save your account</h3>
        <ul className="warning-list">
          <li>Don&apos;t use your real name or a name people know you by.</li>
          <li>
            Next you get a recovery key. If you lose it and your password, this account can&apos;t
            be recovered.
          </li>
        </ul>
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
          <small>{USERNAME_RULES}</small>
        </label>
        <label>
          Password
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
          Repeat password
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
            {busy ? "Saving…" : "Save account"}
          </button>
        </div>
      </div>
    </form>
  );
}

function LogIn({
  supabase,
  user,
  activePosts,
  onNotice,
  onClose,
  onBack,
  onForgot,
  onNoKey,
}: Props & { onBack: () => void; onForgot: () => void; onNoKey: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // "Username or password is wrong" is about both fields.
  const [wrong, setWrong] = useState(false);
  const errorId = `${useId()}-error`;
  const invalid = wrong ? { "aria-invalid": true, "aria-describedby": errorId } : {};
  const unsaved = user?.is_anonymous ?? false;

  async function logIn(event: React.FormEvent) {
    event.preventDefault();
    if (checkUsername(username) || !password) {
      setWrong(true);
      return setMessage("Username or password is wrong.");
    }

    setBusy(true);
    setMessage(null);
    setWrong(false);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdFor(username),
      password,
      options: token ? { captchaToken: token } : undefined,
    });
    // A CAPTCHA token works once.
    if (captchaEnabled) setCaptchaReset((count) => count + 1);
    if (error) {
      setBusy(false);
      setWrong(error.code === "invalid_credentials");
      return setMessage(authErrorMessage(error));
    }
    // A saved account without a recovery key (an interrupted save, or one
    // from before recovery keys) is asked once to make one.
    const { data: hasKey } = await supabase.rpc("has_recovery_key");
    setBusy(false);
    if (hasKey === false) return onNoKey();
    onNotice(`Logged in as ${username.trim().toLowerCase()}.`);
    onClose();
  }

  return (
    <form className="form account-form" onSubmit={logIn} noValidate>
      {/* Phones only (with :has(), tablets and desktop show the logo above the
          dialog instead): these read as sign-in pages there. */}
      <BrandLogo className="auth-logo" />
      {/* The card on phones; elsewhere this box doesn't exist (CSS). */}
      <div className="account-card">
        <h3>Log in to a saved account</h3>
        {unsaved ? (
          <ul className="warning-list">
            <li>
              This device&apos;s account isn&apos;t saved
              {activePosts ? `, and it has ${activePosts} sighting${activePosts === 1 ? "" : "s"} on the map` : ""}.
              If you log in to another account, you can&apos;t get back to this one.
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
            {...invalid}
          />
        </label>
        {/* "Forgot password?" sits on the label's line, so nothing moves. */}
        <div className="field-with-link">
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              {...invalid}
            />
          </label>
          <button
            type="button"
            className="text-button field-link"
            data-opens="forgot"
            onClick={onForgot}
            disabled={busy}
          >
            Forgot password?
          </button>
        </div>
        {captchaEnabled ? (
          <Captcha
            action="login"
            onToken={(next) => {
              setToken(next);
              // The widget retries on its own after some errors.
              if (next) setMessage((current) => (current === CAPTCHA_FAILED ? null : current));
            }}
            onError={() => setMessage(CAPTCHA_FAILED)}
            resetKey={captchaReset}
          />
        ) : null}
        {message ? (
          <p id={errorId} className="form-error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || (captchaEnabled && !token)}
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </div>
      </div>
    </form>
  );
}

function DeleteAccount({ supabase, user, onNotice, onClose, onBack }: Props & { onBack: () => void }) {
  // A saved account must sign in with its password first: the database
  // deletes one only within 10 minutes of a password sign-in, so someone
  // holding an unlocked phone can't delete it. Anonymous accounts have no
  // password. "Saved" means the same as in the database: the account has a
  // login ID, which is also what the sign-in uses.
  const loginId = user?.email ? user.email : null;
  const username = usernameOf(user) ?? loginId;
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wrongPassword, setWrongPassword] = useState(false);
  const errorId = `${useId()}-error`;
  const invalid = wrongPassword ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    if (loginId !== null && !password) {
      setWrongPassword(true);
      return setMessage("Enter your password to delete this account.");
    }

    setBusy(true);
    setMessage(null);
    setWrongPassword(false);
    if (loginId !== null) {
      const {
        data: { session: before },
      } = await supabase.auth.getSession();
      const { error } = await supabase.auth.signInWithPassword({
        email: loginId,
        password,
        options: token ? { captchaToken: token } : undefined,
      });
      // A CAPTCHA token works once.
      if (captchaEnabled) setCaptchaReset((count) => count + 1);
      if (error) {
        setBusy(false);
        setWrongPassword(error.code === "invalid_credentials");
        return setMessage(
          error.code === "invalid_credentials" ? "That password is wrong." : authErrorMessage(error),
        );
      }
      // Signing in started a new session. End the one it replaced, so its
      // IP address and browser don't stay on the server if deleting fails.
      // This only needs that session's own token, not a secret key.
      if (before) await supabase.auth.admin.signOut(before.access_token, "local").catch(() => undefined);
    }

    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setBusy(false);
      // P0001: a message from ICEPik's own database checks, written for users.
      return setMessage(error.code === "P0001" ? error.message : "Something went wrong. Please try again.");
    }
    // The account is gone, so just clear this device's session.
    await supabase.auth.signOut({ scope: "local" });
    onNotice("Your account was deleted. Its sightings stay on the map until they expire.");
    onClose();
  }

  return (
    <form className="form" onSubmit={deleteAccount} noValidate>
      <h3>Delete my account</h3>
      <p>
        This permanently deletes your account, your username if you saved one, and the private
        record of what you posted and voted on. Your sightings stay on the map until they expire,
        with no link to you. This can&apos;t be undone.
      </p>
      {loginId !== null ? (
        <>
          {/* Tells password managers which saved login to fill. */}
          <input type="text" name="username" autoComplete="username" value={username ?? ""} readOnly hidden />
          <label>
            Password for {username}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              {...invalid}
            />
            <small>Needed to delete a saved account.</small>
          </label>
          {captchaEnabled ? (
            <Captcha
              action="delete-account"
              onToken={(next) => {
                setToken(next);
                // The widget retries on its own after some errors.
                if (next) setMessage((current) => (current === CAPTCHA_FAILED ? null : current));
              }}
              onError={() => setMessage(CAPTCHA_FAILED)}
              resetKey={captchaReset}
            />
          ) : null}
        </>
      ) : null}
      {message ? (
        <p id={errorId} className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onBack} disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          className="danger-button"
          disabled={busy || (loginId !== null && captchaEnabled && !token)}
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </form>
  );
}

function ClearDevice({ supabase, user, onBack }: Props & { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const demo = useDemo();

  async function clearDevice() {
    setBusy(true);
    // Clear storage first. Forgetting the accepted policy returns to the first
    // screen, which unmounts the map and its auth listener. Signing out first
    // would let AccountStarter create a new account before the terms show.
    clearDeviceStorage();
    // Sign out of the other project as well (the real map's account on /demo,
    // the demo's on the real map): both sessions live in this browser, and the
    // next person to open the other page would otherwise get that account.
    const other = projectFor(!demo).configured ? createClient(!demo, false) : null;
    const [own, others] = await Promise.all([
      supabase.auth.signOut({ scope: "local" }),
      other?.auth.signOut({ scope: "local" }),
    ]);
    // When signOut() can't remove a session (offline with an expired token),
    // delete it here, so the next person who agrees doesn't get that account.
    if (own.error) forgetSession(demo);
    if (other && others?.error) forgetSession(!demo);
  }

  return (
    <div className="form">
      <h3>Clear this device</h3>
      <p>
        This deletes your saved places from this browser and signs this device out of ICEPik and its demo. You&apos;ll see
        the terms again next time.
        {user?.is_anonymous
          ? " Your account isn't saved, so you won't be able to get back to it or its posts."
          : " You can log back in with your username and password."}
      </p>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onBack} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="danger-button" onClick={clearDevice} disabled={busy}>
          {busy ? "Clearing…" : "Clear this device"}
        </button>
      </div>
    </div>
  );
}
