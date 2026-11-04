import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { rememberLocationAnswer, useLocationAnswer } from "./device-storage";

export type MyPosition = { lat: number; lng: number; accuracy: number };

// "asking": the browser is asking for permission. "finding": it's allowed,
// and the first position hasn't come yet.
export type LocationStatus = "idle" | "asking" | "finding" | "on" | "denied" | "unavailable";

// Wait this long on the first visit, so the line explaining why is on screen
// before the browser asks.
const ASK_DELAY_MS = 700;

async function locationPermission(): Promise<PermissionStatus | null> {
  try {
    return (await navigator.permissions?.query({ name: "geolocation" })) ?? null;
  } catch {
    return null;
  }
}

// The device's position, for the blue dot and for centering the map. It is
// kept in memory only: never stored, sent to a server or logged. Only the
// answer (allowed, refused, unavailable) is remembered, so people aren't
// asked again on every visit.
export function useMyPosition() {
  const answer = useLocationAnswer();
  const [position, setPosition] = useState<MyPosition | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const watch = useRef<number | null>(null);
  // Whether the browser already allows it, so it won't ask.
  const allowed = useRef(false);

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
  }, []);

  const refused = useCallback(() => {
    stop();
    setPosition(null);
    setStatus("denied");
    rememberLocationAnswer("denied");
  }, [stop]);

  // Follow the position. The browser asks first if it hasn't been allowed.
  const locate = useCallback(() => {
    if (watch.current !== null) return;
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      rememberLocationAnswer("unavailable");
      return;
    }
    setStatus((current) => (current === "on" ? current : allowed.current ? "finding" : "asking"));
    let found = false;
    watch.current = navigator.geolocation.watchPosition(
      (fix) => {
        found = true;
        allowed.current = true;
        setPosition({
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracy: fix.coords.accuracy,
        });
        setStatus("on");
        rememberLocationAnswer("granted");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          refused();
        } else if (!found) {
          stop();
          setStatus("unavailable");
          rememberLocationAnswer("unavailable");
        }
        // After a first position, a lost signal keeps the last one.
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
    );
  }, [stop, refused]);

  // Once per page load, when storage can be read.
  const begin = useEffectEvent(async (isCancelled: () => boolean) => {
    const permission = await locationPermission();
    if (isCancelled()) return;
    const state = permission?.state ?? null;
    allowed.current = state === "granted";

    if (state === "granted") {
      // Allowed already: no prompt, so nothing to explain.
      locate();
    } else if (state === "denied") {
      refused();
    } else if (answer === null) {
      // First visit: say why, then let the browser ask.
      setStatus("asking");
      window.setTimeout(() => {
        if (!isCancelled()) locate();
      }, ASK_DELAY_MS);
    } else if (state === null) {
      // No way to check without asking: go by the answer remembered.
      if (answer === "granted") locate();
      else if (answer) setStatus(answer);
    }
    // Otherwise the browser would ask again, and it was asked before: wait
    // for the re-center button.

    // Allowed or blocked later in the browser's settings.
    if (permission) {
      permission.onchange = () => {
        allowed.current = permission.state === "granted";
        if (permission.state === "granted") locate();
        else if (permission.state === "denied") refused();
      };
    }
    return permission;
  });

  const ready = answer !== undefined;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const permission = begin(() => cancelled);
    return () => {
      cancelled = true;
      stop();
      permission.then((p) => {
        if (p) p.onchange = null;
      });
    };
  }, [ready, stop]);

  return { position, status, locate };
}
