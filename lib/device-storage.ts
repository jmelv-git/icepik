import { useMemo, useSyncExternalStore } from "react";

// Things ICEPik keeps only in this browser's localStorage. Never cookies:
// cookies travel to the server with every request.
const POLICY_KEY = "icepik.policy-version";
const PLACES_KEY = "icepik.places";

export type PlaceName = "home" | "work";
export type SavedPlace = { lat: number; lng: number };
export type SavedPlaces = Partial<Record<PlaceName, SavedPlace>>;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private windows and blocked storage throw. Treat it as empty.
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the value just won't be remembered.
  }
  listeners.forEach((listener) => listener());
}

// undefined while rendering on the server, where there's no localStorage.
function useStored(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => undefined,
  );
}

export function useAcceptedPolicyVersion() {
  return useStored(POLICY_KEY);
}

export function acceptPolicy(version: string) {
  write(POLICY_KEY, version);
}

export function useSavedPlaces(): SavedPlaces {
  const raw = useStored(PLACES_KEY);
  return useMemo(() => parsePlaces(raw), [raw]);
}

export function savePlace(name: PlaceName, place: SavedPlace | null) {
  const places = parsePlaces(read(PLACES_KEY));
  if (place) places[name] = place;
  else delete places[name];
  write(PLACES_KEY, Object.keys(places).length ? JSON.stringify(places) : null);
}

// "Clear this device": forget everything ICEPik stored in this browser.
export function clearDeviceStorage() {
  write(PLACES_KEY, null);
  write(POLICY_KEY, null);
}

function parsePlaces(raw: string | null | undefined): SavedPlaces {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const places: SavedPlaces = {};
    for (const name of ["home", "work"] as const) {
      const place = value[name] as Partial<SavedPlace> | undefined;
      if (typeof place?.lat === "number" && typeof place?.lng === "number") {
        places[name] = { lat: place.lat, lng: place.lng };
      }
    }
    return places;
  } catch {
    return {};
  }
}
