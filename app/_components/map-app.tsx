"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  CUSTOM_PLACES_MAX,
  PLACE_NAME_MAX,
  addCustomPlace,
  shorten,
  savePlace,
  useBackgroundMotion,
  useCustomPlaces,
  useSavedPlaces,
  type PlaceName,
} from "@/lib/device-storage";
import { ONE_MILE_M, distanceMeters, roundCoord } from "@/lib/geo";
import { readLayout, useLayout } from "@/lib/layout";
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
import { LavaLamp, LavaToggle } from "./lava-lamp";
import {
  ArrowIcon,
  ChevronIcon,
  CloseIcon,
  DocumentIcon,
  GearIcon,
  LocateIcon,
  MinusIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
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

// Shown while the browser asks for the person's location.
const LOCATION_ASK =
  "ICEPik asks for your location to show where you are and center the map. It stays on this device.";
const LOCATION_DENIED =
  "ICEPik can't see your location. To center the map on you, allow location for this site in your browser's settings.";
const LOCATION_UNAVAILABLE = "Your device couldn't find your location. Try again in a moment.";

// The phone layout in globals.css: a tab bar, and sheets that cover the map.
function isPhone() {
  return readLayout() === "phone";
}

type Edge = "top" | "right" | "bottom" | "left";

// Everything that can float over the map on phones and tablets. globals.css
// gives each one a --map-edge: the side of the map it takes up there.
const MAP_COVERS =
  ".search, .detail-card, .map-controls, .report-button, .pick-banner, .leaflet-control-attribution";

// Phones and tablets: a point is shown in the part of the map that nothing
// floats over. Pins are drawn above their point, so this leaves room for
// one: 88px above the point and 32px on either side.
function compactPadding(): Padding {
  const map = document.querySelector(".map")?.getBoundingClientRect();
  if (!map) return { paddingTopLeft: [32, 96 + 88], paddingBottomRight: [32, 96] };

  const taken: Record<Edge, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const element of document.querySelectorAll<HTMLElement>(MAP_COVERS)) {
    const style = getComputedStyle(element);
    const edge = style.getPropertyValue("--map-edge").trim() as Edge;
    if (!(edge in taken) || style.visibility === "hidden") continue;
    const box = element.getBoundingClientRect();
    const overMap =
      box.width > 0 &&
      box.height > 0 &&
      box.left < map.right &&
      box.right > map.left &&
      box.top < map.bottom &&
      box.bottom > map.top;
    if (!overMap) continue;
    const depth = {
      top: box.bottom - map.top,
      right: map.right - box.left,
      bottom: map.bottom - box.top,
      left: box.right - map.left,
    }[edge];
    taken[edge] = Math.max(taken[edge], depth);
  }

  let left = taken.left + 32;
  let right = taken.right + 32;
  let top = taken.top + 88;
  let bottom = taken.bottom + 8;
  // A window too small to leave any room: Leaflet can't fit a point into
  // nothing, so let it use the whole map.
  if (map.width - left - right < 64) left = right = 16;
  if (map.height - top - bottom < 64) top = bottom = 16;
  return { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom] };
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
  // The moving background behind Log in and Save account: off for good from
  // Settings, or paused for now with its button.
  const backgroundMotion = useBackgroundMotion();
  const [lavaPaused, setLavaPaused] = useState(false);
  const [picking, setPicking] = useState<Picking>(null);
  const [draft, setDraft] = useState<Point | null>(null);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  // null until the user toggles it: CSS then shows the panel on desktop and
  // hides it on phones, so neither layout flashes the wrong state on load.
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  // Phones show the Reports sheet one tab at a time: the list, or the search.
  const [reportsTab, setReportsTab] = useState<"nearby" | "search">("nearby");
  const layout = useLayout();
  // Phones and tablets: a tab bar or rail with Home in it, and docked panes.
  const compact = layout !== "desktop";
  const [starterHidden, setStarterHidden] = useState(false);
  // The part of the map on screen, once the map has loaded.
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | undefined>(undefined);
  const mainRef = useRef<HTMLElement>(null);

  // The dialog on screen, if any. The report form's layer is hidden while its
  // pin is moved on the map, and then it isn't one.
  const reportShown = reportFormOpen && draft !== null && picking !== "report";
  const dialog = modal ?? (reportShown ? "report" : null);
  // While a dialog shows, everything behind it is inert: Tab stays in the
  // dialog layer (and the account set-up message, which sits above it). On
  // phones Know Your Rights is a tab, and the tab bar beside it stays in reach.
  const railInert = dialog !== null && !(dialog === "rights" && layout === "phone");
  // The control that opened the dialog, to go back to when it closes.
  const dialogOpener = useRef<HTMLElement | null>(null);
  // Where focus goes when the dialog closes, instead of its opener.
  const focusAfterDialog = useRef<string | null>(null);
  // Where focus goes when the report form shows again after moving its pin.
  const focusInReport = useRef<string | null>(null);
  // The row or pin that opened the alert card, to go back to when it closes.
  const cardOpener = useRef<HTMLElement | null>(null);
  // Upright phones: the Reports sheet covers the whole map. The map, its pins
  // and buttons are then out of the Tab order, since nobody can see them.
  const [sheetCovers, setSheetCovers] = useState(false);
  // Whether the map has keyboard focus (the banner then says to press Enter).
  const [mapKeyboardFocus, setMapKeyboardFocus] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  // A search that found nothing. Nothing shows for it; screen readers hear it.
  const [noResults, setNoResults] = useState(false);
  const [searchResult, setSearchResult] = useState<(Point & { label: string }) | null>(null);
  const searchForm = useRef<HTMLFormElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const resultsOpen = results.length > 0 || searchError || noResults;

  // The saved session is this device's account. Keep up with sign-ins,
  // sign-outs and token refreshes.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // A notice stays 20 seconds (it was 6: too short to read for many people).
  // The time stops while the pointer is over it or focus is in it, and its
  // pause button keeps it until it's played again (WCAG 2.2.1).
  const NOTICE_MS = 20000;
  const [noticePaused, setNoticePaused] = useState(false);
  const noticePausedRef = useRef(false);
  const startNoticeTimer = useCallback(() => {
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), NOTICE_MS);
  }, []);
  const showNotice = useCallback(
    (message: string) => {
      noticePausedRef.current = false;
      setNoticePaused(false);
      setNotice(message);
      startNoticeTimer();
    },
    [startNoticeTimer],
  );
  const holdNotice = () => window.clearTimeout(noticeTimer.current);
  const releaseNotice = () => {
    if (!noticePausedRef.current) startNoticeTimer();
  };
  const toggleNoticePause = () => {
    const paused = !noticePausedRef.current;
    noticePausedRef.current = paused;
    setNoticePaused(paused);
    // Played again: the 20 seconds start over at once, even if focus stays on
    // the button (a tap on a touch screen leaves it there).
    if (paused) holdNotice();
    else startNoticeTimer();
  };

  const cancelReport = useCallback(() => {
    setPicking(null);
    setDraft(null);
    setReportFormOpen(false);
  }, []);

  // Focus the first of these that is on screen and can take focus.
  function focusFirst(candidates: (HTMLElement | string | null)[]) {
    for (const candidate of candidates) {
      const element =
        typeof candidate === "string" ? document.querySelector<HTMLElement>(candidate) : candidate;
      if (
        element?.isConnected &&
        element.getClientRects().length &&
        getComputedStyle(element).visibility !== "hidden" &&
        !element.closest("[inert]")
      ) {
        element.focus({ preventScroll: true });
        return;
      }
    }
  }

  // The map takes Enter to place a pin at its center (onMapKeyDown).
  function focusMap() {
    window.requestAnimationFrame(() => focusFirst([".map-shell .leaflet-container"]));
  }

  // Open a dialog, remembering the control that opened it.
  function openModal(kind: "rights" | "settings") {
    if (!dialog) {
      const active = document.activeElement;
      dialogOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    setModal(kind);
  }

  // Close the alert card. If focus was in it, go back to the row or pin that
  // opened it, or else to the map.
  function closeCard(close: () => void) {
    const card = document.querySelector(".detail-card");
    const wasInCard = Boolean(card?.contains(document.activeElement));
    const opener = cardOpener.current;
    cardOpener.current = null;
    close();
    if (wasInCard) {
      window.requestAnimationFrame(() => focusFirst([opener, ".map-shell .leaflet-container"]));
    }
  }

  // Pick-mode keyboard: Enter or Space on the focused map places the pin (or
  // the place) at the map's center. The arrow keys move the map first.
  function onMapKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    // Pins and clusters are Tab stops with role="button", but Leaflet only
    // listens for clicks on them: Enter and Space click them, as on a button.
    if (target.classList?.contains("leaflet-marker-icon") && target.getAttribute("role") === "button") {
      event.preventDefault();
      target.click();
      return;
    }
    if (!target.classList?.contains("leaflet-container")) return;
    if (!picking && !naming) return;
    const center = mapApi.current?.center();
    if (!center) return;
    event.preventDefault();
    place(center);
  }

  // Escape closes one thing at a time, the top one first: a dialog, the
  // report form, the place being named, choosing a spot, then a card.
  const onEscape = useEffectEvent(() => {
    if (modal) setModal(null);
    else if (reportShown) cancelReport();
    else if (naming) closeNaming();
    else if (picking === "report" && !reportFormOpen) cancelReport();
    else if (picking) setPicking(null);
    else if (selectedId) closeCard(() => setSelectedId(null));
    else if (groupIds) closeCard(() => setGroupIds(null));
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onEscape();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeResults = useCallback(() => {
    setResults([]);
    setSearchError(false);
    setNoResults(false);
  }, []);

  // Focus follows the dialogs: into one when it opens, and back to the
  // control that opened it when it closes. If that control is gone or hidden,
  // the nearest one that does the same job.
  const previousDialog = useRef(dialog);
  const onDialogChange = useEffectEvent(() => {
    const before = previousDialog.current;
    previousDialog.current = dialog;
    if (dialog === before) return;

    if (dialog) {
      const into = focusInReport.current;
      focusInReport.current = null;
      const section = document.querySelector<HTMLElement>(".modal-layer:not([hidden]) .modal");
      const target = (into && section?.querySelector<HTMLElement>(into)) || section;
      target?.focus({ preventScroll: true });
      return;
    }

    // The report form hid to let its pin move: the map takes focus, so the
    // pin can be placed with the keyboard, and "Move pin" gets it back after.
    if (before === "report" && reportFormOpen) {
      focusInReport.current = ".spot-row .text-button";
      focusMap();
      return;
    }

    // Focus moved on by itself (a tab in the tab bar closed the dialog):
    // leave it there.
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected && !active.closest(".modal-layer"))
      return;

    const fallbacks: Record<string, string[]> = {
      settings: [".rail-settings", ".panel-settings"],
      rights: [".rail-rights", ".rights-card .link-button"],
      // Posting, or choosing a sighting near the spot, opens its card.
      report: [".detail-card .icon-button", ".report-button"],
    };
    const candidates: (HTMLElement | string | null)[] = [
      focusAfterDialog.current,
      before === "report" ? null : dialogOpener.current,
      ...(fallbacks[before ?? ""] ?? []),
    ];
    focusAfterDialog.current = null;
    dialogOpener.current = null;
    window.requestAnimationFrame(() => focusFirst(candidates));
  });
  useEffect(() => {
    onDialogChange();
  }, [dialog, reportFormOpen]);

  // Phones: the account set-up message can cover "Submit a report". While it
  // does, the button is out of the Tab order, like the map buttons under a card.
  const starterShown = Boolean(supabase && user === null && !starterHidden);
  const [starterCovers, setStarterCovers] = useState(false);
  useEffect(() => {
    const measure = () => {
      const starter = document.querySelector(".starter")?.getBoundingClientRect();
      const button = document.querySelector(".report-button")?.getBoundingClientRect();
      setStarterCovers(
        Boolean(
          starter &&
            button?.width &&
            starter.left <= button.left &&
            starter.right >= button.right &&
            starter.top <= button.top &&
            starter.bottom >= button.bottom,
        ),
      );
    };
    const frame = window.requestAnimationFrame(measure);
    const starter = document.querySelector(".starter");
    const observer = new ResizeObserver(measure);
    if (starter) observer.observe(starter);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [starterShown, layout, picking, selectedId, groupIds]);

  // The map element belongs to the map component: mark it here.
  useEffect(() => {
    document.querySelector(".map-shell > .map")?.toggleAttribute("inert", sheetCovers);
  }, [sheetCovers]);

  // While the map waits for a spot, focusing it reads the banner's words.
  const waitingForSpot = picking !== null && naming === null;
  useEffect(() => {
    const container = document.querySelector(".map-shell .leaflet-container");
    if (!container) return;
    if (waitingForSpot) container.setAttribute("aria-describedby", "pick-help");
    else container.removeAttribute("aria-describedby");
  }, [waitingForSpot]);

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
  // Phones start with the list closed, everything else with it open. Desktop
  // leaves an untouched panel to CSS ("auto"); phones and tablets always say
  // which it is, so the tabs know what's showing.
  const panelShown = panelOpen ?? layout !== "phone";
  const panelState =
    panelOpen === null && !compact ? "auto" : panelShown ? "open" : "closed";

  // Upright phones: whether the Reports sheet covers the whole map.
  // Measured after each render that can change it, and on resize.
  useEffect(() => {
    const measure = () => {
      const panel = document.querySelector(".panel")?.getBoundingClientRect();
      const map = document.querySelector(".map")?.getBoundingClientRect();
      setSheetCovers(
        Boolean(
          panelState === "open" &&
            panel &&
            map &&
            panel.left <= map.left + 1 &&
            panel.right >= map.right - 1 &&
            panel.top <= map.top + 1 &&
            panel.bottom >= map.bottom - 1,
        ),
      );
    };
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [panelState, layout]);


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
  // On phones and tablets the card is docked beside or under the map, and it
  // grows after it opens (the vote buttons arrive once the person's position
  // is known). Keep its pin in view when it does.
  useEffect(() => {
    if (!selectedId || !compact) return;
    const card = document.querySelector(".detail-card");
    if (!card) return;
    const observer = new ResizeObserver(() => revealSelected());
    observer.observe(card);
    return () => observer.disconnect();
  }, [selectedId, compact]);

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

  // The Reports button. On desktop it shows and hides the panel. On phones
  // and tablets it's a tab next to Home: it always opens the list, from the
  // top, over whatever else was open.
  function openReports() {
    if (!compact) return togglePanel();
    setModal(null);
    setReportsTab("nearby");
    closeResults();
    // On tablets a sighting's card takes the list's place: back to the list.
    if (layout === "tablet") {
      setSelectedId(null);
      setGroupIds(null);
    }
    document.getElementById("panel-cards")?.scrollTo(0, 0);
    setPanelOpen(true);
  }

  // The Home tab (phones and tablets): just the map.
  function goHome() {
    setModal(null);
    setPanelOpen(false);
    if (layout === "tablet") {
      setSelectedId(null);
      setGroupIds(null);
    }
  }

  // The Search tab of the Reports sheet (phones): ready to type.
  function showSearchTab() {
    setReportsTab("search");
    searchInput.current?.focus();
  }

  // Keep the floating panel and the detail card from covering a point the map
  // is asked to show.
  function mapPadding(): Padding {
    if (readLayout() !== "desktop") return compactPadding();

    const shell = document.querySelector(".map-shell")?.getBoundingClientRect();
    const panel = document.querySelector(".panel-cards");
    const detail = document.querySelector(".detail-card")?.getBoundingClientRect();
    if (!shell) return { paddingTopLeft: [48, 96], paddingBottomRight: [48, 48] };

    const left =
      panel && getComputedStyle(panel).visibility !== "hidden"
        ? panel.getBoundingClientRect().right - shell.left
        : 0;
    const right = detail ? shell.right - detail.left : 0;
    return { paddingTopLeft: [left + 48, 96], paddingBottomRight: [right + 48, 48] };
  }

  // Open a sighting's card and bring its pin into view.
  function selectSighting(id: string) {
    const active = document.activeElement;
    cardOpener.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      !active.closest(".detail-card, .modal-layer")
        ? active
        : null;
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
    // The button goes away: the map takes focus, ready for Enter.
    focusMap();
  }

  // Moving the pin of an open report goes back to the form; otherwise stop.
  function leavePicking() {
    if (picking === "report" && !reportFormOpen) cancelReport();
    else setPicking(null);
  }

  function pickPlace(name: PlaceName | "custom") {
    // Settings closes and the map waits for the spot: it takes focus.
    focusAfterDialog.current = ".map-shell .leaflet-container";
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
    // In the phone's Reports sheet, results are listed under its Search tab.
    setReportsTab("search");

    // Only the latest search may show its results.
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchError(false);
    setNoResults(false);

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
      if (!controller.signal.aborted) {
        setResults(found);
        setNoResults(found.length === 0);
      }
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
      // On phones the detail card would cover the place. Searched from the
      // map, the place shows on the map. Searched from the Reports sheet, the
      // sheet stays, with its list now showing the reports around the place.
      if (isPhone()) {
        setSelectedId(null);
        setGroupIds(null);
      }
    }
    setReportsTab("nearby");
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

  const noticeText = notice || (me.status === "asking" ? LOCATION_ASK : "");

  return (
    <div className="app" data-panel={panelState} data-modal={modal ?? undefined} data-tab={reportsTab}>
      {/* The first Tab stop. Shown only while focused; fixed, so it moves
          nothing. It focuses the main content without changing the URL. */}
      <a
        className="skip-link"
        href="#main"
        inert={dialog !== null}
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to main content
      </a>
      {/* Notices sit on top of everything (desktop: top right; tablets and
          phones: top center), outside the map and the dialogs, so their
          pause button works while a dialog is open. Screen readers hear them
          from the live copy at the end. */}
      {noticeText ? (
        <div
          className="notice"
          onPointerEnter={holdNotice}
          onPointerLeave={releaseNotice}
          onFocus={holdNotice}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) releaseNotice();
          }}
        >
          <p>{noticeText}</p>
          {notice ? (
            <button
              type="button"
              className="icon-button notice-pause"
              aria-label={noticePaused ? "Let this message close" : "Keep this message"}
              onClick={toggleNoticePause}
            >
              {noticePaused ? <PlayIcon /> : <PauseIcon />}
            </button>
          ) : null}
        </div>
      ) : null}
      <nav className="rail" aria-label="ICEPik" inert={railInert}>
        <BrandLogo className="brand-logo brand-logo-tall" variant="tall" loading="lazy" />
        <BrandLogo className="brand-logo brand-logo-wide" loading="lazy" />

        {/* Phones and tablets only (hidden on desktop): back to just the map. */}
        <button
          type="button"
          className="rail-item rail-home"
          aria-current={compact && !panelShown && !modal ? "page" : undefined}
          onClick={goHome}
        >
          <span className="rail-icon">
            <PlaceIcon name="home" />
          </span>
          Home
        </button>

        <button
          type="button"
          className="rail-item rail-reports"
          aria-expanded={panelState !== "closed"}
          aria-controls="panel-cards"
          onClick={openReports}
        >
          <span className="rail-icon">
            <ReportsIcon />
          </span>
          Reports
        </button>

        <button
          type="button"
          className="rail-item rail-rights"
          aria-current={compact && modal === "rights" ? "page" : undefined}
          onClick={() => openModal("rights")}
        >
          <span className="rail-icon">
            <DocumentIcon />
          </span>
          Know Your Rights
        </button>

        <button
          type="button"
          className="rail-item rail-settings"
          onClick={() => openModal("settings")}
        >
          <span className="rail-icon">
            <GearIcon />
          </span>
          Settings
        </button>
      </nav>

      <main
        ref={mainRef}
        id="main"
        className="map-shell"
        tabIndex={-1}
        inert={dialog !== null}
        onKeyDown={onMapKeyDown}
        onFocus={(event) => {
          const target = event.target as HTMLElement;
          if (target.classList.contains("leaflet-container"))
            setMapKeyboardFocus(target.matches(":focus-visible"));
        }}
        onBlur={(event) => {
          if ((event.target as HTMLElement).classList.contains("leaflet-container"))
            setMapKeyboardFocus(false);
        }}
      >
        <h1 className="visually-hidden">ICEPik map</h1>
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
          {/* Phones only: Settings sits beside the search box, because the
              tab bar there holds just the three main sections. */}
          <button
            type="button"
            className="panel-settings"
            aria-label="Settings"
            onClick={() => openModal("settings")}
          >
            <GearIcon />
          </button>

          <form
            ref={searchForm}
            className="search"
            role="search"
            onSubmit={searchPlaces}
            onKeyDown={onSearchKeyDown}
            onBlur={(event) => {
              // Where the results float over the map, they close when focus
              // moves on, as they do on a click elsewhere, so they never hide
              // the control that has focus. In the phone's Reports sheet
              // they are the sheet's content and stay.
              const next = event.relatedTarget as Node | null;
              const inSheet = layout === "phone" && panelShown;
              if (resultsOpen && next && !event.currentTarget.contains(next) && !inSheet)
                closeResults();
            }}
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
                  ) : noResults ? (
                    <li className="search-empty">No places found.</li>
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
          {/* Tells screen readers what the search is doing. */}
          <p className="visually-hidden" role="status">
            {searching
              ? "Searching…"
              : searchError
                ? "Search is unavailable right now."
                : results.length
                  ? `${results.length} ${results.length === 1 ? "place" : "places"} found, listed after the search box.`
                  : noResults
                    ? "No places found."
                    : ""}
          </p>

          {/* Phones only: the Reports sheet shows the list or the search. */}
          <div className="panel-tabs" role="group" aria-label="Reports">
            <button
              type="button"
              aria-pressed={reportsTab === "nearby"}
              onClick={() => {
                setReportsTab("nearby");
                closeResults();
              }}
            >
              Nearby
            </button>
            <button type="button" aria-pressed={reportsTab === "search"} onClick={showSearchTab}>
              Search
            </button>
          </div>
          <div className="search-pane list-empty">
            <span className="list-empty-icon">
              <SearchIcon />
            </span>
            <p className="list-empty-title">Search an address or place</p>
          </div>

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
                  <button type="button" className="link-button places-more" onClick={() => openModal("settings")}>
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
                <button type="button" className="link-button" onClick={() => openModal("rights")}>
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
            onClose={() => closeCard(() => setSelectedId(null))}
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
                onClick={() => closeCard(() => setGroupIds(null))}
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
            {/* Also the description of the map while it waits for a spot. */}
            <p id="pick-help" role="status">
              {picking === "report"
                ? draft
                  ? "Drag the pin, or tap somewhere else to move it."
                  : "Tap the map where you saw ICE."
                : picking === "custom"
                  ? "Tap the place you want to save. It's saved on this device only."
                  : `Tap your ${picking === "home" ? "home" : "workplace"} on the map. It's saved on this device only.`}
              <span className="visually-hidden">
                {" "}
                With a keyboard, move the map with the arrow keys, then press Enter on the map to
                choose its center.
              </span>
            </p>
            {mapKeyboardFocus ? (
              <p className="pick-key-hint" aria-hidden="true">
                {picking === "report"
                  ? "Press Enter to put the pin at the center of the map."
                  : "Press Enter to choose the center of the map."}
              </p>
            ) : null}
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
          <button type="button" className="report-button" onClick={startReport} inert={sheetCovers || starterCovers}>
            <PlusIcon />
            Submit a report
          </button>
        )}

        {/* Hidden, and out of the Tab order, while a card covers them. Out of
            the Tab order too while the phone's Reports sheet covers them. */}
        <div
          className="map-controls"
          data-covered={controlsCovered || undefined}
          inert={controlsCovered || sheetCovers}
        >
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

        {/* Tells screen readers the searched place is on the map. */}
        <p className="visually-hidden" role="status">
          {searchResult
            ? `Searched place marked on the map: ${shortPlaceName(searchResult.label)}. Clear the search to remove it.`
            : ""}
        </p>
      </main>

      {reportFormOpen && draft ? (
        <div className="modal-layer" data-kind="report" role="presentation" hidden={picking === "report"}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            tabIndex={-1}
          >
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
        <div
          className="modal-layer"
          data-kind={modal}
          onClick={() => setModal(null)}
          role="presentation"
        >
          {/* Log in and Save account only (CSS :has): the logo above the
              dialog on tablets and desktop. */}
          {modal === "settings" ? (
            <div className="account-logo" aria-hidden="true">
              <BrandLogo className="account-logo-image" />
            </div>
          ) : null}
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex={-1}
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
                      <span className="visually-hidden"> (opens in a new tab)</span>
                      <ArrowIcon />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.immigrantdefenseproject.org/ice-ruses/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Immigrant Defense Project
                      <span className="visually-hidden"> (opens in a new tab)</span>
                      <ArrowIcon />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.phila.gov/departments/office-of-immigrant-affairs/resources/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Philadelphia Office of Immigrant Affairs
                      <span className="visually-hidden"> (opens in a new tab)</span>
                      <ArrowIcon />
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
          {/* Shown only with Log in or Save account (CSS :has). */}
          {modal === "settings" ? (
            <>
              <LavaLamp paused={!backgroundMotion || lavaPaused} />
              {backgroundMotion ? (
                <LavaToggle paused={lavaPaused} onToggle={() => setLavaPaused(!lavaPaused)} />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {supabase && user === null && !starterHidden ? (
        <AccountStarter
          supabase={supabase}
          onSession={setUser}
          onDismiss={() => setStarterHidden(true)}
        />
      ) : null}

      {/* The notice for screen readers. Outside the map and the dialogs, so
          it's heard even while a dialog is open (Account saved, Logged in). */}
      <p className="visually-hidden" role="status">
        {noticeText}
      </p>
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
