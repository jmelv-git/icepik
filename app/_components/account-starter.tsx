"use client";

import { useEffect, useRef, useState } from "react";
import { authErrorMessage } from "@/lib/accounts";
import type { Client } from "@/lib/supabase/client";
import { Captcha, captchaEnabled } from "./captcha";

// Creates an anonymous account when this device has none: on the first visit
// after agreeing to the terms, and after the account is deleted. There's no
// sign-up screen. When it works, the auth listener in MapApp picks up the new
// session and this disappears.
export function AccountStarter({
  supabase,
  onDismiss,
}: {
  supabase: Client;
  onDismiss: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(-1);

  useEffect(() => {
    if (captchaEnabled && !token) return;
    // One request per attempt, even when effects run twice in development.
    if (started.current === attempt) return;
    started.current = attempt;

    void supabase.auth
      .signInAnonymously(token ? { options: { captchaToken: token } } : undefined)
      .then(({ error }) => {
        if (!error) return;
        setError(authErrorMessage(error));
        // A CAPTCHA token works once.
        if (captchaEnabled) setCaptchaReset((count) => count + 1);
      });
  }, [supabase, token, attempt]);

  return (
    <div className="starter" role="status">
      {error ? (
        <>
          <p className="form-error">{error}</p>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onDismiss}>
              Just view the map
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={captchaEnabled && !token}
              onClick={() => {
                setError(null);
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
      {captchaEnabled ? <Captcha onToken={setToken} resetKey={captchaReset} /> : null}
    </div>
  );
}
