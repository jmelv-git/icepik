"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile, one of the two CAPTCHA providers Supabase Auth
// supports. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY once CAPTCHA protection is on
// in Supabase (Authentication -> Attack Protection), with the matching secret
// key there. Without it, no CAPTCHA script ever loads.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const captchaEnabled = Boolean(SITE_KEY);

type Turnstile = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      theme?: "dark" | "light" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

// Loaded on demand, and only after the person has agreed to the policy.
function loadTurnstile() {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    // Forget a failed load, so the next attempt fetches the script again.
    const fail = () => {
      loading = null;
      script.remove();
      reject();
    };
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail());
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

// Shows the check and reports each new token, or null when it expires or
// fails. A token works once: change resetKey after using one to get another.
// onError means the check couldn't load at all, for example when the script
// is blocked; mounting it again tries again.
export function Captcha({
  onToken,
  onError,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  onError: () => void;
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ turnstile: Turnstile; id: string } | null>(null);
  const latest = useRef({ onToken, onError });

  useEffect(() => {
    latest.current = { onToken, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !box.current) return;
        const id = turnstile.render(box.current, {
          sitekey: SITE_KEY!,
          theme: "dark",
          callback: (token) => latest.current.onToken(token),
          "expired-callback": () => latest.current.onToken(null),
          "error-callback": () => latest.current.onToken(null),
        });
        widget.current = { turnstile, id };
      },
      () => {
        if (!cancelled) latest.current.onError();
      },
    );

    return () => {
      cancelled = true;
      if (widget.current) widget.current.turnstile.remove(widget.current.id);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current) {
      latest.current.onToken(null);
      widget.current.turnstile.reset(widget.current.id);
    }
  }, [resetKey]);

  return <div ref={box} className="captcha" />;
}
