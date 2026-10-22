"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { authErrorMessage } from "@/lib/accounts";
import type { Client } from "@/lib/supabase/client";
import { Captcha, captchaEnabled } from "./captcha";

// What getSession() found for one attempt.
type Found = { attempt: number; result: "no-session" | "error" };

// Creates an anonymous account when this device has none: on the first visit
// after agreeing to the terms, and after the account is deleted. There's no
// sign-up screen. When it works, the auth listener in MapApp picks up the new
// session and this disappears.
//
// The listener reporting "no session" isn't proof there is none: when a token
// refresh fails (no signal, a brief auth outage), auth-js reports no session
// but keeps the stored one, and retries in the background. Creating an account
// then would replace it, and an unsaved anonymous account can't be recovered.
// So every attempt asks getSession() first, and creates an account only when
// it finds no session and no error.
export function AccountStarter({
  supabase,
  onSession,
  onDismiss,
}: {
  supabase: Client;
  onSession: (user: User) => void;
  onDismiss: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One check and one sign-up per attempt, even when effects run twice in
  // development.
  const checked = useRef(-1);
  const created = useRef(-1);

  useEffect(() => {
    if (checked.current === attempt) return;
    checked.current = attempt;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setFound({ attempt, result: "error" });
      else if (data.session) onSession(data.session.user);
      else setFound({ attempt, result: "no-session" });
    });
  }, [supabase, attempt, onSession]);

  const noSession = found?.attempt === attempt && found.result === "no-session";
  const cantRestore = found?.attempt === attempt && found.result === "error";

  useEffect(() => {
    if (!noSession || (captchaEnabled && !token)) return;
    if (created.current === attempt) return;
    created.current = attempt;

    void supabase.auth
      .signInAnonymously(token ? { options: { captchaToken: token } } : undefined)
      .then(({ error }) => {
        if (!error) return;
        setError(authErrorMessage(error));
        // A CAPTCHA token works once.
        if (captchaEnabled) setCaptchaReset((count) => count + 1);
      });
  }, [supabase, noSession, token, attempt]);

  // auth-js keeps a failed refresh for 60 seconds before trying again, so
  // "Try again" can't help right away. Its own retry restores the account.
  const message = cantRestore
    ? "We couldn't restore your account. It comes back on its own when you're online."
    : captchaFailed
      ? "The security check couldn't load. Check your connection, then try again."
      : error;

  return (
    <div className="starter" role="status">
      {message ? (
        <>
          <p className="form-error">{message}</p>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onDismiss}>
              Just view the map
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={noSession && captchaEnabled && !token && !captchaFailed}
              onClick={() => {
                setError(null);
                setCaptchaFailed(false);
                setAttempt((count) => count + 1);
              }}
            >
              Try again
            </button>
          </div>
        </>
      ) : (
        <p>Setting up your anonymous account…</p>
      )}
      {noSession && captchaEnabled ? (
        <Captcha
          onToken={setToken}
          onError={() => setCaptchaFailed(true)}
          resetKey={captchaReset}
        />
      ) : null}
    </div>
  );
}
