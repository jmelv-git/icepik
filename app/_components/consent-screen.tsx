"use client";

import { useEffect, useRef, useState } from "react";
import { acceptPolicy, useBackgroundMotion } from "@/lib/device-storage";
import { BrandLogo } from "./brand-logo";
import { LavaLamp, LavaToggle } from "./lava-lamp";
import { POLICY_VERSION, PolicyText } from "./policy";

// Shown before anything else loads: no sign-in, map tiles or CAPTCHA until
// the person agrees. Agreeing is remembered in this browser only; nothing
// about it is sent to the server.
export function ConsentScreen({ updated }: { updated: boolean }) {
  const [blocked, setBlocked] = useState(false);
  // "I agree" works once the end of the terms has been on screen. When the
  // whole text fits in its box, that's right away.
  const [readToEnd, setReadToEnd] = useState(false);
  const textBox = useRef<HTMLDivElement>(null);
  const textEnd = useRef<HTMLSpanElement>(null);
  // Reads the choice saved in Settings, if any; writes nothing before the
  // person agrees. Pausing lasts until the page is left.
  const motion = useBackgroundMotion();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const box = textBox.current;
    const end = textEnd.current;
    if (!box || !end) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReadToEnd(true);
          observer.disconnect();
        }
      },
      { root: box },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  function agree() {
    // Still focusable and announced while it can't be used, so keyboard and
    // screen reader users can find it and hear why.
    if (!readToEnd) return;
    setBlocked(!acceptPolicy(POLICY_VERSION));
  }

  return (
    <main className="consent">
      <section className="consent-card" aria-labelledby="consent-title">
        <BrandLogo className="consent-logo" />
        <h1 id="consent-title">{updated ? "Our terms have changed" : "Before you start"}</h1>
        <p className="consent-intro">
          ICEPik is a community map of possible ICE activity in Philadelphia. Please read how it
          works and what it keeps. The map loads only after you agree.
        </p>
        {/* A region, so its name is read when it takes focus (it takes
            focus so the keyboard can scroll it). */}
        <div
          ref={textBox}
          className="consent-text"
          role="region"
          tabIndex={0}
          aria-label="Terms and privacy"
        >
          <PolicyText />
          <span ref={textEnd} className="consent-text-end" aria-hidden="true" />
        </div>
        {blocked ? (
          <p className="form-error" role="alert">
            Your browser is blocking site data for ICEPik, so it can&apos;t remember that you agreed
            or keep your account. Allow site data for this site, then reload the page.
          </p>
        ) : null}
        <div className="consent-actions">
          <button
            type="button"
            className="primary-button consent-agree"
            aria-disabled={!readToEnd}
            aria-describedby={readToEnd ? undefined : "consent-why"}
            onClick={agree}
          >
            I agree
          </button>
          {readToEnd ? null : (
            <p id="consent-why" className="consent-why">
              Scroll to the end of the terms to agree.
            </p>
          )}
        </div>
      </section>
      <LavaLamp paused={!motion || paused} />
      {motion ? <LavaToggle paused={paused} onToggle={() => setPaused(!paused)} /> : null}
    </main>
  );
}
