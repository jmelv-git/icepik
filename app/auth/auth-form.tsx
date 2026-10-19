"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { logIn, signUp } from "./actions";

type Mode = "login" | "sign-up";

export function AuthForm({ mode }: { mode: Mode }) {
  const [state, formAction, pending] = useActionState(
    mode === "login" ? logIn : signUp,
    undefined,
  );
  // Controlled so the email stays filled in after a failed attempt.
  const [email, setEmail] = useState("");

  if (state?.message) {
    return (
      <div className="auth-sent" role="status">
        <h2>Check your email</h2>
        <p>{state.message}</p>
        <Link href="/login" className="auth-button">
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" action={formAction}>
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "sign-up" ? 6 : undefined}
          required
        />
      </label>

      {mode === "sign-up" ? (
        <label>
          Repeat password
          <input
            name="repeat-password"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
      ) : null}

      {state?.error ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="auth-button" disabled={pending}>
        {pending
          ? mode === "login"
            ? "Logging in…"
            : "Signing up…"
          : mode === "login"
            ? "Log in"
            : "Sign up"}
      </button>

      <p className="auth-switch">
        {mode === "login" ? (
          <>
            New to ICEPik? <Link href="/sign-up">Sign up</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Log in</Link>
          </>
        )}
      </p>
    </form>
  );
}
