"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import {
  PASSWORD_RULES,
  USERNAME_RULES,
  authErrorMessage,
  checkPassword,
  checkUsername,
  loginIdFor,
  usernameOf,
} from "@/lib/accounts";
import {
  CUSTOM_PLACES_MAX,
  clearDeviceStorage,
  removeCustomPlace,
  savePlace,
  type CustomPlace,
  type PlaceName,
  type SavedPlace,
  type SavedPlaces,
} from "@/lib/device-storage";
import { ONE_MILE_M, distanceMeters } from "@/lib/geo";
import type { Sighting } from "@/lib/sightings";
import { forgetSession, type Client } from "@/lib/supabase/client";
import type { ProfileTotals } from "@/lib/use-my-activity";
import { BrandLogo } from "./brand-logo";
import { Captcha, captchaEnabled } from "./captcha";
import { PlaceIcon } from "./icons";
import { PolicyText } from "./policy";

type View = "main" | "save" | "login" | "delete" | "clear" | "policy";

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
};

export const PLACE_LABEL: Record<PlaceName, string> = { home: "Home", work: "Work" };

export function SettingsDialog(props: Props) {
  const { user, reloadActivity } = props;
  const [view, setView] = useState<View>("main");

  // Fresh totals each time Settings opens.
  useEffect(() => {
    reloadActivity();
  }, [reloadActivity]);

  // Each view starts at the top, and Back returns focus to the button that
  // opened it, so keyboard users keep their place.
  const opener = useRef<View>("main");
  const open = (next: View) => {
    opener.current = next;
    setView(next);
  };
  const back = () => {
    setView("main");
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-opens="${opener.current}"]`)?.focus(),
    );
  };
  useEffect(() => {
    document.querySelector(".modal")?.scrollTo(0, 0);
  }, [view]);

  return (
    <div className="settings">
      {view === "main" ? <MainView {...props} onOpen={open} /> : null}
      {view === "save" ? <SaveAccount {...props} onBack={back} /> : null}
      {view === "login" ? <LogIn {...props} onBack={back} /> : null}
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
  onOpen,
}: Props & { onOpen: (view: View) => void }) {
  const username = usernameOf(user);
  const [placeStatus, setPlaceStatus] = useState("");
  const nearby = (place: SavedPlace) => {
    const near = sightings.filter(
      (s) => distanceMeters(place.lat, place.lng, s.lat, s.lng) <= ONE_MILE_M,
    ).length;
    return `${near} ${near === 1 ? "sighting" : "sightings"} within 1 mile`;
  };

  return (
    <>
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
                      <button type="button" className="text-button" onClick={() => onShowPlace(place)}>
                        Show
                      </button>
                      <button type="button" className="text-button" onClick={() =>
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
                    <button type="button" className="text-button" onClick={() => onPickPlace(name)}>
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

function SaveAccount({ supabase, onNotice, onBack }: Props & { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const problem =
      checkUsername(username) ??
      checkPassword(password) ??
      (password === repeat ? null : "The passwords don't match.");
    if (problem) return setMessage(problem);

    setBusy(true);
    setMessage(null);
    // Same user id: posts and votes stay with the account.
    const { error } = await supabase.auth.updateUser({ email: loginIdFor(username), password });
    setBusy(false);
    if (error) return setMessage(authErrorMessage(error));
    onNotice(`Account saved. Your username is ${username.trim().toLowerCase()}.`);
    onBack();
  }

  return (
    <form className="form account-form" onSubmit={save} noValidate>
      {/* Phones and tablets only: these read as sign-in pages there. */}
      <BrandLogo className="auth-logo" />
      <h3>Save your account</h3>
      <ul className="warning-list">
        <li>Don&apos;t use your real name or a name people know you by.</li>
        <li>
          There&apos;s no password reset. If you forget your password, this account can&apos;t be
          recovered.
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
        />
      </label>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Saving…" : "Save account"}
        </button>
      </div>
    </form>
  );
}

function LogIn({ supabase, user, activePosts, onNotice, onClose, onBack }: Props & { onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const unsaved = user?.is_anonymous ?? false;

  async function logIn(event: React.FormEvent) {
    event.preventDefault();
    if (checkUsername(username) || !password) {
      return setMessage("Username or password is wrong.");
    }

    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdFor(username),
      password,
      options: token ? { captchaToken: token } : undefined,
    });
    setBusy(false);
    // A CAPTCHA token works once.
    if (captchaEnabled) setCaptchaReset((count) => count + 1);
    if (error) return setMessage(authErrorMessage(error));
    onNotice(`Logged in as ${username.trim().toLowerCase()}.`);
    onClose();
  }

  return (
    <form className="form account-form" onSubmit={logIn} noValidate>
      {/* Phones and tablets only: these read as sign-in pages there. */}
      <BrandLogo className="auth-logo" />
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
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {captchaEnabled ? (
        <Captcha
          onToken={setToken}
          onError={() =>
            setMessage("The security check couldn't load. Check your connection, then go back and try again.")
          }
          resetKey={captchaReset}
        />
      ) : null}
      {message ? (
        <p className="form-error" role="alert">
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
    </form>
  );
}

function DeleteAccount({ supabase, onNotice, onClose, onBack }: Props & { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setMessage(null);
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
    <div className="form">
      <h3>Delete my account</h3>
      <p>
        This permanently deletes your account, your username if you saved one, and the private
        record of what you posted and voted on. Your sightings stay on the map until they expire,
        with no link to you. This can&apos;t be undone.
      </p>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onBack} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="danger-button" onClick={deleteAccount} disabled={busy}>
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </div>
  );
}

function ClearDevice({ supabase, user, onBack }: Props & { onBack: () => void }) {
  const [busy, setBusy] = useState(false);

  async function clearDevice() {
    setBusy(true);
    // Clear storage first. Forgetting the accepted policy returns to the first
    // screen, which unmounts the map and its auth listener. Signing out first
    // would let AccountStarter create a new account before the terms show.
    clearDeviceStorage();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    // When signOut() can't remove the session (offline with an expired token),
    // delete it here, so the next person who agrees doesn't get this account.
    if (error) forgetSession();
  }

  return (
    <div className="form">
      <h3>Clear this device</h3>
      <p>
        This deletes your saved places from this browser and signs this device out. You&apos;ll see
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
