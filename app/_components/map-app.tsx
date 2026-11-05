"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  CUSTOM_PLACES_MAX,
  PLACE_NAME_MAX,
  addCustomPlace,
  shorten,
  savePlace,
  useCustomPlaces,
  useSavedPlaces,
  type PlaceName,
} from "@/lib/device-storage";
import { ONE_MILE_M, distanceMeters, roundCoord } from "@/lib/geo";
import {
  STATUS_LABEL,
  sightingSummary,
  sightingTitle,
  statusOf,
  timeAgo,
  type Sighting,
  type Status,
  type VoteType,
} from "@/lib/sightings";
import { createClient, type Client } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useLiveSightings } from "@/lib/use-live-sightings";
import { useMyActivity } from "@/lib/use-my-activity";
import { useMyPosition } from "@/lib/use-my-position";
import { AccountStarter } from "./account-starter";
import { BrandLogo } from "./brand-logo";
import {
  ArrowIcon,
  ChevronIcon,
  CloseIcon,
  DocumentIcon,
  GearIcon,
  LocateIcon,
  MinusIcon,
  PinIcon,
  PinOutlineIcon,
  PlaceIcon,
  PlusIcon,
  ReportsIcon,
  SearchIcon,
  ShieldIcon,
  StatusIcon,
} from "./icons";
import { shortPlaceName } from "./map-pins";
import { ReportForm } from "./report-form";
import { PLACE_LABEL, SettingsDialog } from "./settings-dialog";
import { SightingCard } from "./sighting-card";
import {
  SightingsMap,
  type Bounds,
  type MapApi,
  type MapPlace,
  type Padding,
  type Point,
} from "./sightings-map";

type SearchResult = { display_name: string; lat: string; lon: string };

// Choosing a spot on the map: for a new report, or for a saved place (home,
// work, or a new place to name).
type Picking = "report" | PlaceName | "custom" | null;

const PLACES_FULL = `You've saved ${CUSTOM_PLACES_MAX} places, as many as ICEPik keeps. Delete one in Settings first.`;
// Named places listed in the side panel; the rest are in Settings.
const PANEL_PLACES = 3;
const PLACE_NOT_SAVED =
  "Couldn't save this place on this device. Your browser's storage is full or blocked.";

const STATUSES: Status[] = ["verified", "unverified", "disputed"];

// Matches the stacked phone layout in globals.css.
const PHONE_QUERY = "(max-width: 899px)";

// Shown while the browser asks for the person's location.
const LOCATION_ASK =
  "ICEPik asks for your location to show where you are and center the map. It stays on this device.";
const LOCATION_DENIED =
  "ICEPik can't see your location. To center the map on you, allow location for this site in your browser's settings.";
const LOCATION_UNAVAILABLE = "Your device couldn't find your location. Try again in a moment.";

function isPhone() {
  return window.matchMedia(PHONE_QUERY).matches;
}

// On phones the detail card spans the top of the map. A point is shown in
// the clear space below the card, or beside it on a phone on its side, away
// from the report button, the map buttons and above the map credits. Pins are drawn
// above their point, so this leaves room for one: 88px above the point and
// 32px on either side.
function phonePadding(shell: DOMRect, card: DOMRect | undefined): Padding {
  if (!card) return { paddingTopLeft: [24, 96 + 88], paddingBottomRight: [24, 96] };

  const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
  const credits = box(".leaflet-control-attribution");
  const report = box(".report-button");
  const zoom = box(".map-controls");
  const aboveCredits = (credits ? shell.bottom - credits.top : 0) + 8;

  // On its side, the card leaves the left of the map free, above the map
  // buttons, which sit at the bottom left there.
  if (card.left - shell.left > 120) {
    const aboveButtons = zoom && zoom.left < card.left ? shell.bottom - zoom.top + 8 : 0;
    return {
      paddingTopLeft: [32, 96 + 88],
      paddingBottomRight: [shell.right - card.left + 32, Math.max(aboveCredits, aboveButtons)],
    };
  }

  const top = card.bottom - shell.top + 88;
  // Across the map above the REPORT button when there's room for it...
  if (report && report.top - shell.top - 8 >= top) {
    return {
      paddingTopLeft: [32, top],
      paddingBottomRight: [zoom ? shell.right - zoom.left + 32 : 32, shell.bottom - report.top + 8],
    };
  }
  // ...or else beside the button, down to the credits.
  return {
    paddingTopLeft: [32, top],
    paddingBottomRight: [report ? shell.right - report.left + 32 : 32, aboveCredits],
  };
}

function reportCount(count: number) {
  return `${count} ${count === 1 ? "report" : "reports"}`;
}

function inBounds(point: Point, bounds: Bounds) {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

export function MapApp() {
  const [supabase] = useState<Client | null>(() =>
    isSupabaseConfigured ? createClient() : null,
  );
  // undefined until the saved session (if any) has been read.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { sightings, loadState, now, upsert, remove } = useLiveSightings(supabase);
  const activity = useMyActivity(supabase, user?.id ?? null);
  const places = useSavedPlaces();
  const customPlaces = useCustomPlaces();
  // A new place being named before it's saved.
  const [naming, setNaming] = useState<(Point & { name: string }) | null>(null);
  const namingOpener = useRef<HTMLElement | null>(null);
  // On phones a sighting card can cover the map buttons.
  const [controlsCovered, setControlsCovered] = useState(false);
  const me = useMyPosition();
  const mapApi = useRef<MapApi>(null);
  // Center on the person's first position once, unless they're already
  // looking at something else; and after the re-center button, once it's known.
  const centeredOnMe = useRef(false);
  const centerOnMeNext = useRef(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Counts the times a sighting was chosen, so even choosing the same one
  // again brings its pin back into view.
  const [revealCount, setRevealCount] = useState(0);
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const [modal, setModal] = useState<"rights" | "settings" | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const [draft, setDraft] = useState<Point | null>(null);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  // null until the user toggles it: CSS then shows the panel on desktop and
  // hides it on phones, so neither layout flashes the wrong state on load.
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [starterHidden, setStarterHidden] = useState(false);
  // The part of the map on screen, once the map has loaded.
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | undefined>(undefined);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchResult, setSearchResult] = useState<(Point & { label: string }) | null>(null);
  const searchForm = useRef<HTMLFormElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const resultsOpen = results.length > 0 || searchError;

  // The saved session is this device's account. Keep up with sign-ins,
  // sign-outs and token refreshes.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const showNotice = useCallback((message: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 6000);
  }, []);

  const cancelReport = useCallback(() => {
    setPicking(null);
    setDraft(null);
    setReportFormOpen(false);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (modal) setModal(null);
      else if (naming) closeNaming();
      else if (picking === "report" && !reportFormOpen) cancelReport();
      else if (picking) setPicking(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, naming, picking, reportFormOpen, cancelReport]);

  const closeResults = useCallback(() => {
    setResults([]);
    setSearchError(false);
  }, []);

  // A click or tap anywhere outside the search box closes its results. Listen
  // in the capture phase so the map can't swallow the event first.
  useEffect(() => {
    if (!resultsOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!searchForm.current?.contains(event.target as Node)) closeResults();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [resultsOpen, closeResults]);

  const selected = selectedId ? (sightings.find((s) => s.id === selectedId) ?? null) : null;
  const group = groupIds ? sightings.filter((s) => groupIds.includes(s.id)) : [];
  const panelState = panelOpen === null ? "auto" : panelOpen ? "open" : "closed";

  // Move a chosen sighting's pin out from under its card. This waits until
  // the card has rendered, because the card's size decides where the pin
  // can show.
  const revealSelected = useEffectEvent(() => {
    if (selected) mapApi.current?.showPoint(selected, mapPadding());
  });
  useEffect(() => {
    if (revealCount) revealSelected();
  }, [revealCount]);

  const onMyPosition = useEffectEvent(() => {
    const position = me.position;
    if (!position || !mapApi.current) return;
    if (centerOnMeNext.current) {
      centerOnMeNext.current = false;
      centeredOnMe.current = true;
      mapApi.current.centerOn(position, mapPadding(), 15);
    } else if (!centeredOnMe.current) {
      centeredOnMe.current = true;
      const busy = selectedId || groupIds || searchResult || picking || mapApi.current.moved();
      if (!busy) mapApi.current.centerOn(position, mapPadding());
    }
  });
  useEffect(() => {
    onMyPosition();
  }, [me.position]);

  // The re-center button was used before the position was known, and it
  // can't be: say why.
  // Whether the open card covers the map buttons (phones). Measured after the
  // card has rendered, and again when the window changes size.
  useEffect(() => {
    const measure = () => {
      const card = document.querySelector(".detail-card")?.getBoundingClientRect();
      const controls = document.querySelector(".map-controls")?.getBoundingClientRect();
      setControlsCovered(
        Boolean(
          card &&
            controls &&
            card.left < controls.right &&
            card.right > controls.left &&
            card.top < controls.bottom &&
            card.bottom > controls.top,
        ),
      );
    };
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [selectedId, groupIds]);

  const onLocationStatus = useEffectEvent(() => {
    if (!centerOnMeNext.current) return;
    if (me.status === "denied") showNotice(LOCATION_DENIED);
    else if (me.status === "unavailable") showNotice(LOCATION_UNAVAILABLE);
    else return;
    centerOnMeNext.current = false;
  });
  useEffect(() => {
    onLocationStatus();
  }, [me.status]);

  function centerOnMe() {
    if (me.position) return mapApi.current?.centerOn(me.position, mapPadding(), 15);
    if (me.status === "denied") return showNotice(LOCATION_DENIED);
    centerOnMeNext.current = true;
    // Asks first if the browser hasn't been allowed; the line says why.
    me.locate();
  }

  function togglePanel() {
    const opening = !(panelOpen ?? !isPhone());
    // Hidden cards keep their scroll position. Start from the top, so the
    // list of sightings is what shows first.
    if (opening) document.getElementById("panel-cards")?.scrollTo(0, 0);
    setPanelOpen(opening);
  }

  // Keep the floating panel and the detail card from covering a point the map
  // is asked to show.
  function mapPadding(): Padding {
    const shell = document.querySelector(".map-shell")?.getBoundingClientRect();
    const panel = document.querySelector(".panel-cards");
    const detail = document.querySelector(".detail-card")?.getBoundingClientRect();
    if (!shell) return { paddingTopLeft: [48, 96], paddingBottomRight: [48, 48] };

    if (isPhone()) return phonePadding(shell, detail);

    const left =
      panel && getComputedStyle(panel).visibility !== "hidden"
        ? panel.getBoundingClientRect().right - shell.left
        : 0;
    const right = detail ? shell.right - detail.left : 0;
    return { paddingTopLeft: [left + 48, 96], paddingBottomRight: [right + 48, 48] };
  }

  // Open a sighting's card and bring its pin into view.
  function selectSighting(id: string) {
    setSelectedId(id);
    setGroupIds(null);
    setRevealCount((count) => count + 1);
  }

  function showSighting(id: string) {
    selectSighting(id);
    // On phones the panel covers the map, so get it out of the way.
    if (isPhone()) setPanelOpen(false);
  }

  function showPoints(points: Point[]) {
    if (isPhone()) setPanelOpen(false);
    mapApi.current?.showPoints(points, mapPadding());
  }

  function nearPlace(place: Point) {
    return sightings.filter((s) => distanceMeters(place.lat, place.lng, s.lat, s.lng) <= ONE_MILE_M);
  }

  // A saved place and the sightings within a mile of it.
  function showPlace(place: Point) {
    setModal(null);
    showPoints([place, ...nearPlace(place)]);
  }

  function startReport() {
    if (!supabase) return showNotice("ICEPik isn't connected to its database yet.");
    if (!user) {
      setStarterHidden(false);
      return showNotice("Your account is still being set up. Try again in a moment.");
    }
    setSelectedId(null);
    setGroupIds(null);
    setDraft(null);
    setReportFormOpen(false);
    setPicking("report");
    if (isPhone()) setPanelOpen(false);
  }

  // Moving the pin of an open report goes back to the form; otherwise stop.
  function leavePicking() {
    if (picking === "report" && !reportFormOpen) cancelReport();
    else setPicking(null);
  }

  function pickPlace(name: PlaceName | "custom") {
    setModal(null);
    setNaming(null);
    setPicking(name);
    if (isPhone()) setPanelOpen(false);
  }

  function place(point: Point) {
    if (naming) {
      // Naming a place: a tap moves it.
      setNaming({ ...naming, lat: point.lat, lng: point.lng });
    } else if (picking === "report") {
      // Pins are rounded to about 100 m: show where it will really go.
      setDraft({ lat: roundCoord(point.lat), lng: roundCoord(point.lng) });
    } else if (picking === "custom") {
      namingOpener.current = null;
      setNaming({ ...point, name: "" });
      setPicking(null);
    } else if (picking) {
      const saved = savePlace(picking, {
        lat: Math.round(point.lat * 1e4) / 1e4,
        lng: Math.round(point.lng * 1e4) / 1e4,
      });
      showNotice(saved ? `${PLACE_LABEL[picking]} saved on this device.` : PLACE_NOT_SAVED);
      setPicking(null);
    }
  }

  // Name and save a place chosen on the map or from the search results.
  function saveNamedPlace(event: React.FormEvent) {
    event.preventDefault();
    if (!naming) return;
    const { status, name } = addCustomPlace(naming.name, naming);
    if (status === "saved") showNotice(`${name} saved on this device.`);
    else if (status === "limit") showNotice(PLACES_FULL);
    else showNotice(PLACE_NOT_SAVED);
    closeNaming();
  }

  // Back to where the form was opened from, so keyboard users keep their place.
  function closeNaming() {
    setNaming(null);
    const opener = namingOpener.current;
    namingOpener.current = null;
    if (!opener) return;
    // The star hides while the form is open: focus the one shown again.
    window.requestAnimationFrame(() =>
      (opener.isConnected
        ? opener
        : (document.querySelector<HTMLElement>(".search-save") ?? searchInput.current)
      )?.focus(),
    );
  }

  function nameSearchedPlace(event: React.MouseEvent<HTMLButtonElement>) {
    if (!searchResult) return;
    if (customPlaces.length >= CUSTOM_PLACES_MAX) return showNotice(PLACES_FULL);
    setPicking(null);
    namingOpener.current = event.currentTarget;
    setNaming({
      lat: searchResult.lat,
      lng: searchResult.lng,
      name: shorten(shortPlaceName(searchResult.label), PLACE_NAME_MAX),
    });
  }

  // Home, work and named places as the map draws them, plus one being named.
  const mapPlaces = useMemo<MapPlace[]>(() => {
    const list: MapPlace[] = [];
    for (const name of ["home", "work"] as const) {
      const spot = places[name];
      if (spot) list.push({ ...spot, key: name, kind: name, label: PLACE_LABEL[name] });
    }
    for (const spot of customPlaces) {
      list.push({ lat: spot.lat, lng: spot.lng, key: spot.id, kind: "custom", label: spot.name });
    }
    if (naming) {
      list.push({ lat: naming.lat, lng: naming.lng, key: "new", kind: "custom", label: "New place", pending: true });
    }
    return list;
  }, [places, customPlaces, naming]);

  function posted(sighting: Sighting) {
    upsert(sighting);
    activity.addPost(sighting.id);
    cancelReport();
    selectSighting(sighting.id);
    showNotice("Sighting posted. Everyone can see it now.");
  }

  function voted(sighting: Sighting, vote: VoteType) {
    upsert(sighting);
    activity.setVote(sighting.id, vote);
    showNotice(vote === "confirm" ? "Thanks for confirming." : "Thanks. Your dispute was counted.");
  }

  function gone(id: string, message: string) {
    remove(id);
    setSelectedId(null);
    showNotice(message);
  }

  function deleted(id: string) {
    remove(id);
    activity.removePost(id);
    setSelectedId(null);
    showNotice("Sighting deleted.");
  }

  async function searchPlaces(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;

    // Only the latest search may show its results.
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchError(false);

    try {
      // In the body, not the URL, so the search never lands in request logs.
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const found: SearchResult[] = await response.json();
      if (!controller.signal.aborted) setResults(found);
    } catch {
      if (controller.signal.aborted) return;
      setResults([]);
      setSearchError(true);
    } finally {
      if (searchAbort.current === controller) {
        searchAbort.current = null;
        setSearching(false);
      }
    }
  }

  // Stop a search still waiting for its results, so they never show up late.
  function stopSearch() {
    searchAbort.current?.abort();
    searchAbort.current = null;
    setSearching(false);
  }

  // End the search: the box empties and the searched place leaves the map.
  function endSearch() {
    stopSearch();
    setQuery("");
    setSearchResult(null);
    closeResults();
  }

  function clearSearch() {
    endSearch();
    searchInput.current?.focus();
  }

  // Escape undoes one thing at a time, the search box's first: a waiting
  // search, then the results, then the search itself. Only an Escape in an
  // empty box reaches the window's handler, which cancels placing a pin.
  function onSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Escape") return;
    const inResults = (event.target as Element).closest(".search-results") !== null;

    if (searching) {
      // Keep the words, so the search can be sent again with Enter.
      stopSearch();
    } else if (resultsOpen) {
      closeResults();
      // The list is going away: don't drop focus with it.
      if (inResults) searchInput.current?.focus();
    } else if (query) {
      // Browsers differ on whether Escape empties a search box. Always do,
      // and keep focus in it when Escape came from its clear or save button.
      clearSearch();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function chooseSearchResult(item: SearchResult, event: React.MouseEvent) {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setSearchResult({ lat, lng, label: item.display_name });
      // On phones the panel and the detail card would cover the place.
      if (isPhone()) {
        setPanelOpen(false);
        setSelectedId(null);
        setGroupIds(null);
      }
    }
    setQuery(item.display_name);
    setResults([]);
    // The list is going away. Chosen with the keyboard (no clicks counted),
    // keep focus in the search box instead of losing it. Not on touch, where
    // that would open the keyboard over the map.
    if (event.detail === 0) searchInput.current?.focus();
  }

  const nearby = bounds ? sightings.filter((s) => inBounds(s, bounds)) : [];
  const counts: Record<Status, number> = { verified: 0, unverified: 0, disputed: 0 };
  nearby.forEach((s) => counts[statusOf(s)]++);
  // The side panel's "Your places": home, work, then named places.
  const placeRows: { key: string; kind: "home" | "work" | "custom"; label: string; spot: Point }[] = [];
  for (const name of ["home", "work"] as const) {
    const spot = places[name];
    if (spot) placeRows.push({ key: name, kind: name, label: PLACE_LABEL[name], spot });
  }
  // A few named places here; the rest are in Settings, so the sightings
  // list keeps its room.
  for (const spot of customPlaces.slice(0, PANEL_PLACES)) {
    placeRows.push({ key: spot.id, kind: "custom", label: spot.name, spot });
  }
  const morePlaces = customPlaces.length - PANEL_PLACES;

  let listMessage: { title: string; text?: string } | null = null;
  if (!supabase) {
    listMessage = { title: "Not connected", text: "ICEPik isn't connected to its database yet." };
  } else if (loadState === "loading" || !bounds) {
    listMessage = { title: "Loading reports…" };
  } else if (loadState === "error") {
    listMessage = { title: "Couldn't load reports", text: "Check your connection." };
  } else if (!nearby.length) {
    listMessage = {
      title: "No reports in this area",
      text: "Try moving the map or searching another location.",
    };
  }

  return (
    <div className="app" data-panel={panelState}>
      <nav className="rail" aria-label="ICEPik">
        <BrandLogo className="brand-logo" />

        <button
          type="button"
          className="rail-item rail-reports"
          aria-expanded={panelState !== "closed"}
          aria-controls="panel-cards"
          onClick={togglePanel}
        >
          <span className="rail-icon">
            <ReportsIcon />
          </span>
          Reports
        </button>

        <button type="button" className="rail-item" onClick={() => setModal("rights")}>
          <span className="rail-icon">
            <DocumentIcon />
          </span>
          Know Your Rights
        </button>

        <button
          type="button"
          className="rail-item rail-settings"
          onClick={() => setModal("settings")}
        >
          <span className="rail-icon">
            <GearIcon />
          </span>
          Settings
        </button>
      </nav>

      <main className="map-shell">
        <SightingsMap
          ref={mapApi}
          sightings={sightings}
          selectedId={selectedId}
          onSelect={selectSighting}
          onSelectGroup={(ids) => {
            setSelectedId(null);
            setGroupIds(ids);
          }}
          placing={picking !== null || naming !== null}
          draft={draft}
          onPlace={place}
          searchResult={searchResult}
          myPosition={me.position}
          savedPlaces={mapPlaces}
          onViewChange={setBounds}
        />

        <div className="panel">
          <form
            ref={searchForm}
            className="search"
            role="search"
            onSubmit={searchPlaces}
            onKeyDown={onSearchKeyDown}
          >
            <div className="search-field">
              {/* Enter searches too, so keyboard users skip this button. */}
              <button
                type="submit"
                className="icon-button search-submit"
                aria-label="Search"
                tabIndex={-1}
              >
                <SearchIcon />
              </button>
              <input
                ref={searchInput}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  // An emptied box ends the search, like
                  // the clear button: the place leaves the map too.
                  if (!event.target.value) endSearch();
                }}
                placeholder="Search an address or place"
                aria-label="Search an address or place"
              />
              {searching ? <span className="search-status">Searching…</span> : null}
              {searchResult && query === searchResult.label && !naming ? (
                <button
                  type="button"
                  className="icon-button search-save"
                  aria-label="Save this place"
                  title="Save this place"
                  onClick={nameSearchedPlace}
                >
                  <PlaceIcon name="custom" />
                </button>
              ) : null}
              {query ? (
                <button
                  type="button"
                  className="icon-button search-clear"
                  aria-label="Clear search"
                  onClick={clearSearch}
                >
                  <CloseIcon />
                </button>
              ) : null}

              {resultsOpen ? (
                <ul className="search-results">
                  {searchError ? (
                    <li className="search-empty">Search is unavailable right now.</li>
                  ) : (
                    results.map((item) => (
                      <li key={`${item.lat},${item.lon}`}>
                        <button type="button" onClick={(event) => chooseSearchResult(item, event)}>
                          {item.display_name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          </form>

          <div id="panel-cards" className="panel-cards" inert={panelState === "closed"}>
            <section className="card nearby-card" aria-labelledby="nearby-title">
              <header className="card-head">
                <h2 id="nearby-title">Nearby reports</h2>
                <span>{reportCount(nearby.length)}</span>
              </header>
              <div className="report-list">
                {listMessage ? (
                  <div className="list-empty">
                    <span className="list-empty-icon">
                      <PinOutlineIcon />
                    </span>
                    <p className="list-empty-title">{listMessage.title}</p>
                    {listMessage.text ? <p>{listMessage.text}</p> : null}
                    {bounds && !nearby.length && sightings.length ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => showPoints(sightings)}
                      >
                        Show all {reportCount(sightings.length)}
                        <ArrowIcon />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  nearby.map((sighting) => (
                    <SightingRow
                      key={sighting.id}
                      sighting={sighting}
                      now={now}
                      mine={activity.posts.has(sighting.id)}
                      pressed={sighting.id === selectedId}
                      onClick={() => showSighting(sighting.id)}
                    />
                  ))
                )}
              </div>
            </section>

            {placeRows.length ? (
              <section className="card" aria-labelledby="places-card-title">
                <header className="card-head">
                  <h2 id="places-card-title">Your places</h2>
                  <span>within 1 mile</span>
                </header>
                {placeRows.map((row) => {
                  const near = nearPlace(row.spot).length;
                  return (
                    <button key={row.key} type="button" className="place-link" onClick={() => showPlace(row.spot)}>
                      <span className="row-icon place-icon">
                        <PlaceIcon name={row.kind} />
                      </span>
                      <span className="row-text">
                        <span className="row-address">{row.label}</span>
                        <span className="row-meta">
                          {near
                            ? `${near} ${near === 1 ? "sighting" : "sightings"} nearby`
                            : "No sightings nearby"}
                        </span>
                      </span>
                      <ChevronIcon direction="right" />
                    </button>
                  );
                })}
                {morePlaces > 0 ? (
                  <button type="button" className="link-button places-more" onClick={() => setModal("settings")}>
                    {morePlaces} more saved {morePlaces === 1 ? "place" : "places"} in Settings
                    <ArrowIcon />
                  </button>
                ) : null}
              </section>
            ) : null}

            <section className="card rights-card" aria-labelledby="rights-card-title">
              <span className="rights-card-icon">
                <ShieldIcon />
              </span>
              <div>
                <h2 id="rights-card-title">Know your rights</h2>
                <p>Find trusted information and legal support.</p>
                <button type="button" className="link-button" onClick={() => setModal("rights")}>
                  View resources
                  <ArrowIcon />
                </button>
              </div>
            </section>

            <section className="card" aria-labelledby="area-title">
              <header className="card-head">
                <h2 id="area-title">This area</h2>
                <span>{reportCount(nearby.length)}</span>
              </header>
              <ul className="area-stats">
                {STATUSES.map((status) => (
                  <li key={status}>
                    <span className={`stat-dot status-text-${status}`} />
                    <strong>{counts[status]}</strong> {STATUS_LABEL[status]}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {selected ? (
          <SightingCard
            key={selected.id}
            sighting={selected}
            now={now}
            isMine={activity.posts.has(selected.id)}
            myVote={activity.votes.get(selected.id)}
            signedIn={Boolean(user)}
            onClose={() => setSelectedId(null)}
            onVoted={voted}
            onGone={gone}
            onDeleted={deleted}
          />
        ) : group.length > 1 ? (
          <section className="detail-card" aria-labelledby="group-title">
            <header className="detail-head">
              <PinIcon />
              <h2 id="group-title">{group.length} sightings here</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setGroupIds(null)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </header>
            <div className="group-list">
              {group.map((sighting) => (
                <SightingRow
                  key={sighting.id}
                  sighting={sighting}
                  now={now}
                  mine={activity.posts.has(sighting.id)}
                  pressed={false}
                  onClick={() => showSighting(sighting.id)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {naming ? (
          <form className="pick-banner place-form" onSubmit={saveNamedPlace}>
            <label className="place-form-field">
              Name this place
              <input
                value={naming.name}
                maxLength={PLACE_NAME_MAX}
                placeholder="For example: Mom's house"
                autoComplete="off"
                autoFocus
                onChange={(event) => setNaming({ ...naming, name: event.target.value })}
              />
            </label>
            <p className="place-form-tip">Saved on this device only, never sent anywhere.</p>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={closeNaming}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Save place
              </button>
            </div>
          </form>
        ) : picking ? (
          <div className="pick-banner">
            <p>
              {picking === "report"
                ? draft
                  ? "Drag the pin, or tap somewhere else to move it."
                  : "Tap the map where you saw ICE."
                : picking === "custom"
                  ? "Tap the place you want to save. It's saved on this device only."
                  : `Tap your ${picking === "home" ? "home" : "workplace"} on the map. It's saved on this device only.`}
            </p>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={leavePicking}>
                {picking === "report" && reportFormOpen ? "Back to the form" : "Cancel"}
              </button>
              {picking === "report" && draft ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setPicking(null);
                    setReportFormOpen(true);
                  }}
                >
                  Use this spot
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <button type="button" className="report-button" onClick={startReport}>
            <PlusIcon />
            Submit a report
          </button>
        )}

        {/* Hidden, and out of the Tab order, while a card covers them. */}
        <div className="map-controls" data-covered={controlsCovered || undefined} inert={controlsCovered}>
          <button
            type="button"
            className="map-control"
            aria-label="Show where I am"
            aria-busy={me.status === "asking" || me.status === "finding"}
            onClick={centerOnMe}
          >
            <LocateIcon />
          </button>
          <div className="map-control-group">
            <button
              type="button"
              className="map-control"
              aria-label="Zoom in"
              onClick={() => mapApi.current?.zoomIn()}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className="map-control"
              aria-label="Zoom out"
              onClick={() => mapApi.current?.zoomOut()}
            >
              <MinusIcon />
            </button>
          </div>
        </div>

        <p className="notice" role="status" aria-live="polite">
          {notice || (me.status === "asking" ? LOCATION_ASK : "")}
        </p>

        {/* Tells screen readers the searched place is on the map. */}
        <p className="visually-hidden" role="status">
          {searchResult
            ? `Searched place marked on the map: ${shortPlaceName(searchResult.label)}. Clear the search to remove it.`
            : ""}
        </p>
      </main>

      {reportFormOpen && draft ? (
        <div className="modal-layer" role="presentation" hidden={picking === "report"}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <header className="modal-head">
              <h2 id="report-title">Report a sighting</h2>
              <button type="button" className="icon-button" onClick={cancelReport} aria-label="Close">
                <CloseIcon />
              </button>
            </header>
            <ReportForm
              point={draft}
              sightings={sightings}
              myPosts={activity.posts}
              now={now}
              onMoveSpot={() => setPicking("report")}
              onCancel={cancelReport}
              onPosted={posted}
              onShowSighting={(id) => {
                cancelReport();
                showSighting(id);
              }}
            />
          </section>
        </div>
      ) : null}

      {modal ? (
        <div className="modal-layer" onClick={() => setModal(null)} role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <h2 id="modal-title">{modal === "rights" ? "Know Your Rights" : "Settings"}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </header>

            {modal === "rights" ? (
              <>
                <p>
                  Trusted legal resources to keep close at hand. You have rights regardless of your
                  immigration status.
                </p>
                <ul className="resource-list">
                  <li>
                    <a href="https://www.ilrc.org/" target="_blank" rel="noreferrer">
                      Immigrant Legal Resource Center
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.immigrantdefenseproject.org/ice-ruses/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Immigrant Defense Project
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.phila.gov/departments/office-of-immigrant-affairs/resources/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Philadelphia Office of Immigrant Affairs
                    </a>
                  </li>
                </ul>
              </>
            ) : supabase ? (
              <SettingsDialog
                supabase={supabase}
                user={user ?? null}
                profile={activity.profile}
                activePosts={sightings.filter((s) => activity.posts.has(s.id)).length}
                reloadActivity={activity.reload}
                sightings={sightings}
                places={places}
                customPlaces={customPlaces}
                onPickPlace={pickPlace}
                onShowPlace={showPlace}
                onNotice={showNotice}
                onClose={() => setModal(null)}
              />
            ) : (
              <p>ICEPik isn&apos;t connected to its database yet.</p>
            )}
          </section>
        </div>
      ) : null}

      {supabase && user === null && !starterHidden ? (
        <AccountStarter
          supabase={supabase}
          onSession={setUser}
          onDismiss={() => setStarterHidden(true)}
        />
      ) : null}
    </div>
  );
}

function SightingRow({
  sighting,
  now,
  mine,
  pressed,
  onClick,
}: {
  sighting: Sighting;
  now: number;
  mine: boolean;
  pressed: boolean;
  onClick: () => void;
}) {
  const status = statusOf(sighting);
  return (
    <button type="button" className="report-row" aria-pressed={pressed} onClick={onClick}>
      <span className={`row-icon status-${status}`}>
        <StatusIcon status={status} />
      </span>
      <span className="row-text">
        <span className="row-address">{sightingTitle(sighting)}</span>
        <span className="row-title">{sightingSummary(sighting)}</span>
        <span className="row-meta">
          <span className={`status-text-${status}`}>{STATUS_LABEL[status]}</span>
          {" · "}
          {timeAgo(sighting.created_at, now)}
          {mine ? " · your post" : ""}
        </span>
      </span>
    </button>
  );
}
