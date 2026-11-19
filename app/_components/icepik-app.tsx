"use client";

import { useAcceptedPolicyVersion } from "@/lib/device-storage";
import { ConsentScreen } from "./consent-screen";
import { DemoContext } from "./demo-context";
import { MapApp } from "./map-app";
import { POLICY_VERSION } from "./policy";

// demo: the demo at /demo (see demo-context.tsx).
export function IcepikApp({ demo = false }: { demo?: boolean }) {
  const accepted = useAcceptedPolicyVersion();

  // Unknown until the browser's storage can be read.
  let screen;
  if (accepted === undefined) screen = <div className="splash" aria-busy="true" />;
  else if (accepted !== POLICY_VERSION) screen = <ConsentScreen updated={accepted !== null} />;
  else screen = <MapApp />;
  return <DemoContext value={demo}>{screen}</DemoContext>;
}
