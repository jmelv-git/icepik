"use client";

import { useAcceptedPolicyVersion } from "@/lib/device-storage";
import { ConsentScreen } from "./consent-screen";
import { MapApp } from "./map-app";
import { POLICY_VERSION } from "./policy";

export function IcepikApp() {
  const accepted = useAcceptedPolicyVersion();

  // Unknown until the browser's storage can be read.
  if (accepted === undefined) return <div className="splash" aria-busy="true" />;
  if (accepted !== POLICY_VERSION) return <ConsentScreen updated={accepted !== null} />;
  return <MapApp />;
}
