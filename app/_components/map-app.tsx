"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import logo from "../../public/brand/icepik-logo.png";
import rightsPhoto from "../../public/brand/know-your-rights.jpg";
import { savePlace, useSavedPlaces, type PlaceName } from "@/lib/device-storage";
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
import {
  ChevronIcon,
  CloseIcon,
  GearIcon,
  ListIcon,
  PinIcon,
  PlaceIcon,
  SearchIcon,
  StatusIcon,
} from "./icons";
import { shortPlaceName } from "./map-pins";
import { ReportForm } from "./report-form";
import { PLACE_LABEL, SettingsDialog } from "./settings-dialog";
import { SightingCard } from "./sighting-card";
import { SightingsMap, type MapApi, type Padding, type Point } from "./sightings-map";

type SearchResult = { display_name: string; lat: string; lon: string };

// Choosing a spot on the map: for a new report, or for a saved place.
type Picking = "report" | PlaceName | null;

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
// from the REPORT and zoom buttons and above the map credits. Pins are drawn
// above their point, so this leaves room for one: 88px above the point and
// 32px on either side.
function phonePadding(shell: DOMRect, card: DOMRect | undefined): Padding {
  if (!card) return { paddingTopLeft: [24, 96 + 88], paddingBottomRight: [24, 96] };

  const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
  const credits = box(".leaflet-control-attribution");
  const report = box(".report-button");
  const zoom = box(".leaflet-control-zoom");
  const aboveCredits = (credits ? shell.bottom - credits.top : 0) + 8;

  // On its side, the card leaves the left of the map free.
  if (card.left - shell.left > 120) {
    return {
      paddingTopLeft: [32, 96 + 88],
      paddingBottomRight: [shell.right - card.left + 32, aboveCredits],
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

export function MapApp() {
  const [supabase] = useState<Client | null>(() =>
    isSupabaseConfigured ? createClient() : null,
  );
  // undefined until the saved session (if any) has been read.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { sightings, loadState, now, upsert, remove } = useLiveSightings(supabase);
  const activity = useMyActivity(supabase, user?.id ?? null);
  const places = useSavedPlaces();
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
  const [rightsCardHidden, setRightsCardHidden] = useState(false);
  const [starterHidden, setStarterHidden] = useState(false);
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
      else if (picking === "report" && !reportFormOpen) cancelReport();
      else if (picking) setPicking(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, picking, reportFormOpen, cancelReport]);

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

  function nearPlace(name: PlaceName) {
    const place = places[name];
    return place
      ? sightings.filter((s) => distanceMeters(place.lat, place.lng, s.lat, s.lng) <= ONE_MILE_M)
      : [];
  }

  function showPlace(name: PlaceName) {
    const place = places[name];
    if (!place) return;
    setModal(null);
    showPoints([place, ...nearPlace(name)]);
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

  function pickPlace(name: PlaceName) {
    setModal(null);
    setPicking(name);
    if (isPhone()) setPanelOpen(false);
  }

  function place(point: Point) {
    if (picking === "report") {
      // Pins are rounded to about 100 m: show where it will really go.
      setDraft({ lat: roundCoord(point.lat), lng: roundCoord(point.lng) });
    } else if (picking) {
      savePlace(picking, {
        lat: Math.round(point.lat * 1e4) / 1e4,
        lng: Math.round(point.lng * 1e4) / 1e4,
      });
      showNotice(`${PLACE_LABEL[picking]} saved on this device.`);
      setPicking(null);
    }
  }

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

  function clearSearch() {
    searchAbort.current?.abort();
    setQuery("");
    setSearchResult(null);
    closeResults();
    searchInput.current?.focus();
  }

  function onSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Escape" || !resultsOpen) return;
    // Only close the results. Browsers would also empty the search box,
    // which ends the search and takes the searched place off the map, and
    // the window's Escape handler would cancel something else.
    event.preventDefault();
    event.stopPropagation();
    closeResults();
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

  const counts: Record<Status, number> = { verified: 0, unverified: 0, disputed: 0 };
  sightings.forEach((s) => counts[statusOf(s)]++);
  const placeNames = (["home", "work"] as const).filter((name) => places[name]);

  let listMessage: string | null = null;
  if (!supabase) listMessage = "ICEPik isn't connected to its database yet.";
  else if (loadState === "loading") listMessage = "Loading sightings…";
  else if (loadState === "error") listMessage = "Couldn't load sightings. Check your connection.";
  else if (!sightings.length) listMessage = "No sightings on the map right now.";

  return (
    <div className="app" data-panel={panelState}>
      <nav className="rail" aria-label="ICEPik">
        <Image src={logo} alt="ICEPik" preload className="brand-logo" />

        <button
          type="button"
          className="rail-item rail-reports"
          aria-expanded={panelState !== "closed"}
          aria-controls="panel-cards"
          onClick={togglePanel}
        >
          <span className="rail-icon">
            <ListIcon />
          </span>
          Reports
        </button>

        <button type="button" className="rail-item" onClick={() => setModal("rights")}>
          <span className="rail-thumb">
            <Image src={rightsPhoto} alt="" fill sizes="48px" className="rights-photo" />
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
          placing={picking !== null}
          draft={draft}
          onPlace={place}
          searchResult={searchResult}
          myPosition={me.position}
          onLocate={centerOnMe}
        />

        <div className="panel">
          <form
            ref={searchForm}
            className="search"
            role="search"
            onSubmit={searchPlaces}
            onKeyDown={onSearchKeyDown}
          >
            <input
              ref={searchInput}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                // An emptied box (deleted, or Escape) ends the search, like
                // the clear button: the place leaves the map too.
                if (!event.target.value) {
                  closeResults();
                  setSearchResult(null);
                }
              }}
              placeholder="Search an address or place"
              aria-label="Search an address or place"
            />
            {searching ? <span className="search-status">Searching…</span> : null}
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
            <button type="submit" className="icon-button search-submit" aria-label="Search">
              <SearchIcon />
            </button>

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
          </form>

          <button
            type="button"
            className="panel-toggle"
            aria-expanded={panelState !== "closed"}
            aria-controls="panel-cards"
            aria-label={panelState === "closed" ? "Show side panel" : "Hide side panel"}
            onClick={togglePanel}
          >
            <ChevronIcon direction="left" />
          </button>

          <div id="panel-cards" className="panel-cards" inert={panelState === "closed"}>
            <section className="card report-list" aria-label="Sightings on the map">
              {listMessage ? <p className="list-message">{listMessage}</p> : null}
              {sightings.map((sighting) => (
                <SightingRow
                  key={sighting.id}
                  sighting={sighting}
                  now={now}
                  mine={activity.posts.has(sighting.id)}
                  pressed={sighting.id === selectedId}
                  onClick={() => showSighting(sighting.id)}
                />
              ))}
            </section>

            {placeNames.length ? (
              <section className="card area-card" aria-labelledby="places-card-title">
                <header>
                  <h2 id="places-card-title">Your places</h2>
                  <span>within 1 mile</span>
                </header>
                {placeNames.map((name) => {
                  const near = nearPlace(name).length;
                  return (
                    <button key={name} type="button" className="area-row" onClick={() => showPlace(name)}>
                      <span className="row-icon place-icon">
                        <PlaceIcon name={name} />
                      </span>
                      <span className="row-text">
                        <span className="row-address">{PLACE_LABEL[name]}</span>
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
              </section>
            ) : null}

            {rightsCardHidden ? null : (
              <section className="card rights-card" aria-labelledby="rights-card-title">
                <button
                  type="button"
                  className="icon-button rights-card-close"
                  aria-label="Dismiss"
                  onClick={() => setRightsCardHidden(true)}
                >
                  <CloseIcon />
                </button>
                <div className="rights-card-body">
                  <h2 id="rights-card-title">Know Your Rights</h2>
                  <p>
                    You have rights regardless of your immigration status. Keep trusted legal help
                    close.
                  </p>
                </div>
                <span className="rights-card-photo">
                  <Image src={rightsPhoto} alt="" fill sizes="10rem" className="rights-photo" />
                </span>
                <button
                  type="button"
                  className="rights-card-button"
                  onClick={() => setModal("rights")}
                >
                  See legal resources
                </button>
              </section>
            )}

            <section className="card area-card" aria-labelledby="area-title">
              <header>
                <h2 id="area-title">This area</h2>
                <span>
                  {sightings.length} {sightings.length === 1 ? "sighting" : "sightings"}
                </span>
              </header>
              <button
                type="button"
                className="area-row"
                onClick={() => showPoints(sightings)}
                disabled={!sightings.length}
              >
                <span className={`row-icon status-${counts.verified ? "verified" : "unverified"}`}>
                  <StatusIcon status={counts.verified ? "verified" : "unverified"} />
                </span>
                <span className="row-text">
                  <span className="row-address">Show all on the map</span>
                  <span className="row-meta">
                    {counts.verified} verified · {counts.unverified} unverified · {counts.disputed}{" "}
                    disputed
                  </span>
                </span>
                <ChevronIcon direction="right" />
              </button>
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

        {picking ? (
          <div className="pick-banner">
            <p>
              {picking === "report"
                ? draft
                  ? "Drag the pin, or tap somewhere else to move it."
                  : "Tap the map where you saw ICE."
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
            REPORT
          </button>
        )}

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
