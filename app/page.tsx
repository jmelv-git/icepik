"use client";

import type { LatLngExpression, Layer, Map as LeafletMap, Marker } from "leaflet";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import logo from "../public/brand/icepik-logo.png";
import rightsPhoto from "../public/brand/know-your-rights.jpg";
import { reports, type Report, type Status } from "./reports";

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
};

type Vote = "up" | "down";

const MAP_CENTER: LatLngExpression = [26.1165, -80.1365];

const STATUS_LABEL: Record<Status, string> = {
  confirmed: "Confirmed sighting",
  suspected: "Unconfirmed sighting",
};

const PIN_COLOR: Record<Status, string> = {
  confirmed: "#ff1d25",
  suspected: "#ffc800",
};

function pinMarkup(status: Status) {
  const color = PIN_COLOR[status];
  const glyph =
    status === "confirmed"
      ? `<path d="M25 23l3-5h8l3 5z" fill="${color}"/>
         <rect x="15" y="23" width="34" height="24" rx="5" fill="${color}"/>
         <circle cx="32" cy="35" r="8" fill="#fff"/>
         <circle cx="32" cy="35" r="4.5" fill="${color}"/>
         <circle cx="20" cy="28" r="1.8" fill="#fff"/>`
      : `<path d="M32 17 50 48H14Z" fill="${color}" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>
         <rect x="29.5" y="26" width="5" height="13" rx="2.5" fill="#fff"/>
         <circle cx="32" cy="43.5" r="2.7" fill="#fff"/>`;

  return `<svg class="pin" viewBox="0 0 64 100" aria-hidden="true">
    <path d="M32 95C26 79 7 59 6 36a26 26 0 0 1 52 0c-1 23-20 43-26 59Z" fill="#fff" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>
    ${glyph}
  </svg>`;
}

export default function Home() {
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const searchMarker = useRef<Layer | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(reports[0].id);
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [modal, setModal] = useState<"rights" | "report" | null>(null);

  const selected = reports.find((report) => report.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    const markerMap = markers.current;

    import("leaflet").then((L) => {
      if (cancelled || !mapNode.current) return;

      const instance = L.map(mapNode.current, {
        center: MAP_CENTER,
        zoom: 14,
        minZoom: 9,
        maxZoom: 19,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomleft" }).addTo(instance);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(instance);

      reports.forEach((report) => {
        const marker = L.marker([report.lat, report.lon], {
          title: report.title,
          alt: STATUS_LABEL[report.status],
          icon: L.divIcon({
            className: "pin-icon",
            html: pinMarkup(report.status),
            // The pin is drawn and sized in CSS (.pin) so it scales with the UI.
            iconSize: [0, 0],
          }),
        })
          .on("click", () => setSelectedId(report.id))
          .addTo(instance);

        markerMap.set(report.id, marker);
      });

      map.current = instance;
    });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markerMap.clear();
    };
  }, []);

  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const active = id === selectedId;
      marker.getElement()?.classList.toggle("pin-active", active);
      marker.setZIndexOffset(active ? 1000 : 0);
    });
  }, [selectedId]);

  useEffect(() => {
    if (!modal) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setModal(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  function showReport(report: Report) {
    setSelectedId(report.id);
    map.current?.panTo([report.lat, report.lon], { duration: 0.35 });
  }

  function vote(id: string, value: Vote) {
    setVotes((current) => {
      const next = { ...current };
      if (next[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function searchPlaces(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setSearchError(false);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      setResults(await response.json());
    } catch {
      setResults([]);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  }

  async function chooseSearchResult(item: SearchResult) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const instance = map.current;

    if (instance && Number.isFinite(lat) && Number.isFinite(lon)) {
      const L = await import("leaflet");
      searchMarker.current?.remove();
      searchMarker.current = L.circleMarker([lat, lon], {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: "#4f93c8",
        fillOpacity: 1,
      })
        .bindTooltip(item.display_name)
        .addTo(instance);
      instance.setView([lat, lon], 15, { animate: true });
    }

    setQuery(item.display_name);
    setResults([]);
  }

  const selectedVote = selected ? votes[selected.id] : undefined;

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <Image src={logo} alt="ICEPik" preload className="brand-logo" />

          <button
            type="button"
            className="rights-pill"
            onClick={() => setModal("rights")}
          >
            <Image
              src={rightsPhoto}
              alt=""
              fill
              sizes="(max-width: 899px) 60vw, 22rem"
              className="rights-photo"
            />
            <span>Know Your Rights</span>
          </button>
        </header>

        <form className="search" role="search" onSubmit={searchPlaces}>
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search an address or place"
            aria-label="Search an address or place"
          />
          {searching ? <span className="search-status">Searching…</span> : null}

          {results.length > 0 || searchError ? (
            <ul className="search-results">
              {searchError ? (
                <li className="search-empty">Search is unavailable right now.</li>
              ) : (
                results.map((item) => (
                  <li key={`${item.lat},${item.lon}`}>
                    <button
                      type="button"
                      onClick={() => chooseSearchResult(item)}
                    >
                      {item.display_name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </form>

        <section className="report-list" aria-label="Recent reports">
          <div className="report-list-inner">
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                className="report-card"
                aria-pressed={report.id === selectedId}
                onClick={() => showReport(report)}
              >
                <span className="report-card-head">
                  <span className={`status-dot status-${report.status}`}>
                    <span className="sr-only">{STATUS_LABEL[report.status]}</span>
                  </span>
                  <span className="report-card-address">{report.address}</span>
                </span>
                <span className={`photo photo-${report.accent}`} />
                <span className="report-card-title">{report.title}</span>
                <span className="report-card-meta">
                  {report.time} · {report.reporter}
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="map-shell">
        <div ref={mapNode} className="map" />

        {selected ? (
          <section className="detail-card" aria-labelledby="detail-address">
            <header className="detail-head">
              <PinIcon />
              <h2 id="detail-address" title={selected.address}>
                {selected.address}
              </h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedId(null)}
                aria-label="Close report"
              >
                <CloseIcon />
              </button>
            </header>

            <div className="detail-body">
              <div className="detail-media">
                <span className={`photo photo-${selected.accent}`} />
                {selected.photoCount > 1 ? (
                  <span className="photo photo-more">
                    {selected.photoCount - 1}+
                  </span>
                ) : null}
              </div>

              <p className="detail-title" title={selected.title}>
                {selected.title}
              </p>
              <p className="detail-meta">
                {selected.time} - reported by {selected.reporter}
              </p>

              <div className="detail-actions">
                <button
                  type="button"
                  className="vote vote-up"
                  aria-label="Confirm sighting"
                  aria-pressed={selectedVote === "up"}
                  onClick={() => vote(selected.id, "up")}
                >
                  <ChevronIcon direction="up" />
                </button>
                <button
                  type="button"
                  className="vote vote-down"
                  aria-label="Dispute sighting"
                  aria-pressed={selectedVote === "down"}
                  onClick={() => vote(selected.id, "down")}
                >
                  <ChevronIcon direction="down" />
                </button>
                <button type="button" className="still-there">
                  <span className="still-there-icon" aria-hidden="true">
                    ???
                  </span>
                  Are they still there?
                </button>
              </div>
            </div>

            <div className="comments">
              <h3>Comment Thread</h3>
              {selected.comments.length > 0 ? (
                selected.comments.map((comment, index) => (
                  <article key={index} className="comment">
                    <div className="comment-author">
                      <AvatarIcon />
                      {comment.author}
                    </div>
                    <p>{comment.body}</p>
                  </article>
                ))
              ) : (
                <p className="comments-empty">No comments yet.</p>
              )}
            </div>
          </section>
        ) : null}

        <button
          type="button"
          className="report-button"
          onClick={() => setModal("report")}
        >
          REPORT
        </button>
      </main>

      {modal ? (
        <div
          className="modal-layer"
          onClick={() => setModal(null)}
          role="presentation"
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <h2 id="modal-title">
                {modal === "rights" ? "Know Your Rights" : "Report a sighting"}
              </h2>
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
                  Trusted legal resources to keep close at hand. You have rights
                  regardless of your immigration status.
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
            ) : (
              <form
                className="report-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setModal(null);
                }}
              >
                <label>
                  Location
                  <input defaultValue={selected?.address} required />
                </label>
                <label>
                  What did you see?
                  <textarea
                    rows={5}
                    placeholder="Describe only what you personally observed."
                    required
                  />
                </label>
                <div className="report-form-actions">
                  <span>Reports aren&apos;t saved yet in this prototype.</span>
                  <button type="submit">Submit</button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function PinIcon() {
  return (
    <svg className="detail-pin" viewBox="0 0 24 32" aria-hidden="true">
      <path
        d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 32 12 32s12-11.6 12-20.3C24 5.2 18.6 0 12 0Zm0 16.5a4.8 4.8 0 1 1 0-9.6 4.8 4.8 0 0 1 0 9.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 5l14 14M19 5 5 19"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === "up" ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function AvatarIcon() {
  return (
    <svg className="avatar" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#4f93c8" />
      <circle cx="16" cy="12.5" r="5.5" fill="#fff" />
      <path d="M6.5 26.5c1.8-4.6 5.4-7 9.5-7s7.7 2.4 9.5 7a13 13 0 0 1-19 0Z" fill="#fff" />
    </svg>
  );
}
