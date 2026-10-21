"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { ReportForm } from "./report-form";
import { PLACE_LABEL, SettingsDialog } from "./settings-dialog";
import { SightingCard } from "./sighting-card";
import { SightingsMap, type MapApi, type Padding, type Point } from "./sightings-map";

type SearchResult = { display_name: string; lat: string; lon: string };

// Choosing a spot on the map: for a new report, or for a saved place.
type Picking = "report" | PlaceName | null;

// Matches the stacked phone layout in globals.css.
const PHONE_QUERY = "(max-width: 899px)";

function isPhone() {
  return window.matchMedia(PHONE_QUERY).matches;
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
  const mapApi = useRef<MapApi>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const selected = selectedId ? (sightings.find((s) => s.id === selectedId) ?? null) : null;
  const group = groupIds ? sightings.filter((s) => groupIds.includes(s.id)) : [];
  const panelState = panelOpen === null ? "auto" : panelOpen ? "open" : "closed";

  function togglePanel() {
    setPanelOpen((open) => !(open ?? !isPhone()));
  }

  // Keep the floating panel and the detail card from covering a point the map
  // is asked to show.
  function mapPadding(): Padding {
    const shell = document.querySelector(".map-shell")?.getBoundingClientRect();
    const panel = document.querySelector(".panel-cards");
    const detail = document.querySelector(".detail-card")?.getBoundingClientRect();
    if (!shell) return { paddingTopLeft: [48, 96], paddingBottomRight: [48, 48] };

    // On phones the detail card spans the top of the map.
    if (isPhone()) {
      const top = detail ? detail.bottom - shell.top : 96;
      // Leave room for the pin, which is drawn above its point.
      return { paddingTopLeft: [24, top + 88], paddingBottomRight: [24, 96] };
    }

    const left =
      panel && getComputedStyle(panel).visibility !== "hidden"
        ? panel.getBoundingClientRect().right - shell.left
        : 0;
    const right = detail ? shell.right - detail.left : 0;
    return { paddingTopLeft: [left + 48, 96], paddingBottomRight: [right + 48, 48] };
  }

  function showSighting(id: string) {
    const sighting = sightings.find((s) => s.id === id);
    setSelectedId(id);
    setGroupIds(null);
    // On phones the panel covers the map, so get it out of the way.
    if (isPhone()) setPanelOpen(false);
    if (sighting) mapApi.current?.showPoint(sighting, mapPadding());
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
    setSelectedId(sighting.id);
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

    setSearching(true);
    setSearchError(false);

    try {
      // In the body, not the URL, so the search never lands in request logs.
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
      });
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      setResults(await response.json());
    } catch {
      setResults([]);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  }

  function chooseSearchResult(item: SearchResult) {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setSearchResult({ lat, lng, label: item.display_name });
      if (isPhone()) setPanelOpen(false);
    }
    setQuery(item.display_name);
    setResults([]);
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
          onSelect={(id) => {
            setSelectedId(id);
            setGroupIds(null);
          }}
          onSelectGroup={(ids) => {
            setSelectedId(null);
            setGroupIds(ids);
          }}
          placing={picking !== null}
          draft={draft}
          onPlace={place}
          searchResult={searchResult}
        />

        <div className="panel">
          <form className="search" role="search" onSubmit={searchPlaces}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search an address or place"
              aria-label="Search an address or place"
            />
            {searching ? <span className="search-status">Searching…</span> : null}
            <button type="submit" className="icon-button search-submit" aria-label="Search">
              <SearchIcon />
            </button>

            {results.length > 0 || searchError ? (
              <ul className="search-results">
                {searchError ? (
                  <li className="search-empty">Search is unavailable right now.</li>
                ) : (
                  results.map((item) => (
                    <li key={`${item.lat},${item.lon}`}>
                      <button type="button" onClick={() => chooseSearchResult(item)}>
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
          {notice}
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
