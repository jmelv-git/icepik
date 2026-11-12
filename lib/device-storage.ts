import { useMemo, useSyncExternalStore } from "react";

// Things ICEPik keeps only in this browser's localStorage. Never cookies:
// cookies travel to the server with every request.
const POLICY_KEY = "icepik.policy-version";
const PLACES_KEY = "icepik.places";
// Only the answer to "may ICEPik use your location?", never a position.
const LOCATION_KEY = "icepik.location";
// Places people add and name themselves. Names can say a lot ("Mom's
// house"), so like home and work they never leave this browser.
const CUSTOM_PLACES_KEY = "icepik.custom-places";
// "on" or "off": the moving background (Settings, "Moving background").
const BACKGROUND_MOTION_KEY = "icepik.background-motion";

export const PLACE_NAME_MAX = 40;
export const CUSTOM_PLACES_MAX = 25;

export type PlaceName = "home" | "work";
export type SavedPlace = { lat: number; lng: number };
export type SavedPlaces = Partial<Record<PlaceName, SavedPlace>>;
export type CustomPlace = SavedPlace & { id: string; name: string };

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

// False when the value couldn't be stored: storage is blocked or full.
function write(key: string, value: string | null) {
  let stored = false;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    stored = window.localStorage.getItem(key) === value;
  } catch {
    // The value just won't be remembered.
  }
  listeners.forEach((listener) => listener());
  return stored;
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

// False when the browser blocks site data. ICEPik can't work then, even from
// memory: the account's session cookies are blocked too.
export function acceptPolicy(version: string) {
  write(POLICY_KEY, version);
  return read(POLICY_KEY) === version;
}

export function useSavedPlaces(): SavedPlaces {
  const raw = useStored(PLACES_KEY);
  return useMemo(() => parsePlaces(raw), [raw]);
}

// False when it couldn't be saved: storage is blocked or full.
export function savePlace(name: PlaceName, place: SavedPlace | null) {
  const places = parsePlaces(read(PLACES_KEY));
  if (place) places[name] = place;
  else delete places[name];
  return write(PLACES_KEY, Object.keys(places).length ? JSON.stringify(places) : null);
}

export type LocationAnswer = "granted" | "denied" | "unavailable";

// null until location has been asked for once on this device.
export function useLocationAnswer(): LocationAnswer | null | undefined {
  const raw = useStored(LOCATION_KEY);
  if (raw === undefined) return undefined;
  return raw === "granted" || raw === "denied" || raw === "unavailable" ? raw : null;
}

export function rememberLocationAnswer(answer: LocationAnswer) {
  if (read(LOCATION_KEY) !== answer) write(LOCATION_KEY, answer);
}

// On unless it was turned off on this device. Only read before the terms
// are accepted; written only from Settings.
export function useBackgroundMotion(): boolean {
  return useStored(BACKGROUND_MOTION_KEY) !== "off";
}

export function rememberBackgroundMotion(on: boolean) {
  return write(BACKGROUND_MOTION_KEY, on ? "on" : "off");
}

export function useCustomPlaces(): CustomPlace[] {
  const raw = useStored(CUSTOM_PLACES_KEY);
  return useMemo(() => parseCustomPlaces(raw), [raw]);
}

export type AddPlaceResult = { status: "saved" | "limit" | "failed"; name: string };

// The name it was saved under comes back: a name already in use gets a
// number ("Clinic 2"), so places can be told apart.
export function addCustomPlace(name: string, place: SavedPlace): AddPlaceResult {
  const places = parseCustomPlaces(read(CUSTOM_PLACES_KEY));
  let unique = cleanName(name);
  if (places.length >= CUSTOM_PLACES_MAX) return { status: "limit", name: unique };
  const taken = new Set(places.map((p) => p.name.toLowerCase()));
  for (let n = 2; taken.has(unique.toLowerCase()); n++) {
    const suffix = ` ${n}`;
    unique = shorten(cleanName(name), PLACE_NAME_MAX - suffix.length) + suffix;
  }
  const added: CustomPlace = {
    id: newId(),
    name: unique,
    lat: Math.round(place.lat * 1e4) / 1e4,
    lng: Math.round(place.lng * 1e4) / 1e4,
  };
  const saved = write(CUSTOM_PLACES_KEY, JSON.stringify([...places, added]));
  return { status: saved ? "saved" : "failed", name: unique };
}

// False when it couldn't be removed: storage is blocked.
export function removeCustomPlace(id: string) {
  const places = parseCustomPlaces(read(CUSTOM_PLACES_KEY)).filter((place) => place.id !== id);
  return write(CUSTOM_PLACES_KEY, places.length ? JSON.stringify(places) : null);
}

// Cut by characters, not UTF-16 units, so an emoji is never split in half.
export function shorten(text: string, max: number) {
  return Array.from(text).slice(0, max).join("");
}

export function cleanName(name: string) {
  return shorten(name.replace(/\s+/g, " ").trim(), PLACE_NAME_MAX).trim() || "Saved place";
}

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// "Clear this device": forget everything ICEPik stored in this browser.
export function clearDeviceStorage() {
  write(PLACES_KEY, null);
  write(CUSTOM_PLACES_KEY, null);
  write(LOCATION_KEY, null);
  write(BACKGROUND_MOTION_KEY, null);
  write(POLICY_KEY, null);
}

function parseCustomPlaces(raw: string | null | undefined): CustomPlace[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (place): place is CustomPlace =>
          typeof place?.id === "string" &&
          typeof place?.name === "string" &&
          typeof place?.lat === "number" &&
          typeof place?.lng === "number",
      )
      .map(({ id, name, lat, lng }) => ({ id, name: cleanName(name), lat, lng }));
  } catch {
    return [];
  }
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
