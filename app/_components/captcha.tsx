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
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
    script.onerror = () => {
      loading = null;
      script.remove();
      reject();
    };
    document.head.appendChild(script);
  });
  return loading;
}

// Shows the check and reports each new token, or null when it expires or
// fails. A token works once: change resetKey after using one to get another.
export function Captcha({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ turnstile: Turnstile; id: string } | null>(null);
  const latestOnToken = useRef(onToken);

  useEffect(() => {
    latestOnToken.current = onToken;
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !box.current) return;
        const id = turnstile.render(box.current, {
          sitekey: SITE_KEY!,
          theme: "dark",
          callback: (token) => latestOnToken.current(token),
          "expired-callback": () => latestOnToken.current(null),
          "error-callback": () => latestOnToken.current(null),
        });
        widget.current = { turnstile, id };
      },
      () => latestOnToken.current(null),
    );

    return () => {
      cancelled = true;
      if (widget.current) widget.current.turnstile.remove(widget.current.id);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current) {
      latestOnToken.current(null);
      widget.current.turnstile.reset(widget.current.id);
    }
  }, [resetKey]);

  return <div ref={box} className="captcha" />;
}
