"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    L: any;
  }
}

type Status = "confirmed" | "suspected";

type Report = {
  id: string;
  lat: number;
  lon: number;
  address: string;
  title: string;
  time: string;
  reporter: string;
  status: Status;
  votesUp: number;
  votesDown: number;
  count: string;
  accent: "purple" | "green" | "gray";
};

const reports: Report[] = [
  {
    id: "1",
    lat: 26.1244,
    lon: -80.1435,
    address: "400 North 5th Street",
    title: "Unmarked White Vans & Officers Outside Tr...",
    time: "2 hours ago",
    reporter: "Flying Seal",
    status: "confirmed",
    votesUp: 2,
    votesDown: 1,
    count: "2+",
    accent: "purple",
  },
  {
    id: "2",
    lat: 26.1172,
    lon: -80.1493,
    address: "Northwest 6th Avenue",
    title: "Possible officers near the intersection",
    time: "48 min ago",
    reporter: "Blue Finch",
    status: "confirmed",
    votesUp: 1,
    votesDown: 0,
    count: "1+",
    accent: "green",
  },
  {
    id: "3",
    lat: 26.109,
    lon: -80.1375,
    address: "Southwest 4th Avenue",
    title: "Unmarked vehicles parked outside",
    time: "3 hours ago",
    reporter: "Quiet Harbor",
    status: "suspected",
    votesUp: 0,
    votesDown: 1,
    count: "3+",
    accent: "gray",
  },
];

function markerMarkup(status: Status) {
  const fill = status === "confirmed" ? "#ff161c" : "#ffc516";
  const icon =
    status === "confirmed"
      ? `
        <circle cx="24" cy="22" r="11" fill="none" stroke="#fff" stroke-width="3"/>
        <rect x="16" y="16" width="16" height="12" rx="2" fill="none" stroke="#fff" stroke-width="3"/>
        <circle cx="24" cy="22" r="3.5" fill="#fff"/>
      `
      : `
        <path d="M24 13 34 31H14Z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
        <path d="M24 19v7" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="24" cy="29" r="1.4" fill="#fff"/>
      `;

  return `
    <div class="report-marker">
      <svg viewBox="0 0 48 64" aria-hidden="true">
        <path d="M24 2C13 2 4 11 4 22c0 15 20 39 20 39s20-24 20-39C44 11 35 2 24 2Z" fill="${fill}" stroke="#fff" stroke-width="3"/>
        ${icon}
      </svg>
    </div>`;
}

function ReportThumbnail({ accent }: { accent: Report["accent"] }) {
  return (
    <div className={`report-thumbnail thumbnail-${accent}`}>
      <div className="thumb-noise" />
      <div className="thumb-van">
        <span className="thumb-window" />
        <span className="thumb-window thumb-window-2" />
        <span className="thumb-wheel thumb-wheel-1" />
        <span className="thumb-wheel thumb-wheel-2" />
      </div>
    </div>
  );
}

export default function Home() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const markerLayer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState(reports[0].id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const selected = useMemo(
    () => reports.find((report) => report.id === selectedId) ?? reports[0],
    [selectedId],
  );

  useEffect(() => {
    if (!ready || !mapNode.current || map.current) return;

    const instance = window.L.map(mapNode.current, {
      zoomControl: true,
      minZoom: 9,
      maxZoom: 19,
    }).setView([26.1185, -80.144], 13);

    instance.zoomControl.setPosition("bottomleft");

    window.L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      },
    ).addTo(instance);

    const layer = window.L.layerGroup().addTo(instance);
    markerLayer.current = layer;

    reports.forEach((report) => {
      const marker = window.L.marker([report.lat, report.lon], {
        icon: window.L.divIcon({
          className: "report-marker-icon",
          html: markerMarkup(report.status),
          iconSize: [48, 64],
          iconAnchor: [24, 62],
        }),
      });

      marker.on("click", () => setSelectedId(report.id));
      marker.addTo(layer);
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      markerLayer.current = null;
    };
  }, [ready]);

  useEffect(() => {
    if (!map.current || !selected) return;

    map.current.setView([selected.lat, selected.lon], 14, {
      animate: true,
      duration: 0.35,
    });
  }, [selected]);

  async function searchPlaces() {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    setSearching(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const data = await response.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function chooseSearchResult(item: any) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);

    if (map.current && Number.isFinite(lat) && Number.isFinite(lon)) {
      map.current.setView([lat, lon], 15, { animate: true, duration: 0.35 });
      window.L.marker([lat, lon])
        .addTo(map.current)
        .bindPopup(item.display_name)
        .openPopup();
    }

    setQuery(item.display_name);
    setResults([]);
    setSearchOpen(false);
  }

  return (
    <>
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />

      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="brand-lockup">
            <div className="brand-camera" aria-hidden="true">
              <div className="camera-body">
                <div className="camera-lens" />
              </div>
            </div>
            <div className="brand-wordmark">
              <span>ICE</span>
              <span>Pik</span>
            </div>
          </div>

          <button
            type="button"
            className="rights-card"
            onClick={() => setRightsOpen(true)}
          >
            <div className="rights-bg" aria-hidden="true">
              <div className="rights-statue" />
              <div className="rights-blue-glow" />
            </div>
            <span>Know Your Rights</span>
          </button>
        </header>

        <button
          type="button"
          className={`sidebar-handle ${searchOpen ? "sidebar-handle-open" : ""}`}
          aria-label="Toggle search"
          onClick={() => setSearchOpen((open) => !open)}
        >
          <span />
        </button>

        {searchOpen ? (
          <div className="search-box">
            <div className="search-box-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchPlaces();
                }}
                placeholder="Search a place..."
                autoFocus
              />
              <button type="button" onClick={searchPlaces} disabled={searching}>
                {searching ? "..." : "Search"}
              </button>
            </div>
            {results.length > 0 ? (
              <div className="search-results">
                {results.map((item) => (
                  <button
                    key={`${item.lat}-${item.lon}-${item.display_name}`}
                    type="button"
                    onClick={() => chooseSearchResult(item)}
                  >
                    {item.display_name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="report-list" aria-label="Recent reports">
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              className={`report-card ${selectedId === report.id ? "report-card-active" : ""}`}
              onClick={() => setSelectedId(report.id)}
            >
              <div className="report-card-head">
                <span
                  className={`report-status report-status-${report.status}`}
                />
                <span className="report-address">{report.address}</span>
                <span className="report-count">{report.count}</span>
              </div>
              <ReportThumbnail accent={report.accent} />
              <div className="report-title">{report.title}</div>
              <div className="report-meta">
                {report.time} - reported by {report.reporter}
              </div>
            </button>
          ))}
        </section>
      </aside>

      <main className="map-shell">
        <div ref={mapNode} id="map" />

        <section className="detail-card">
          <div className="detail-head">
            <div className="detail-location">
              <span className="detail-pin" aria-hidden="true">
                <svg viewBox="0 0 24 30">
                  <path
                    d="M12 1C5.9 1 1.5 5.6 1.5 11.1 1.5 18.4 12 29 12 29s10.5-10.6 10.5-17.9C22.5 5.6 18.1 1 12 1Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  />
                  <circle cx="12" cy="11" r="3" fill="currentColor" />
                </svg>
              </span>
              <span>{selected.address}...</span>
            </div>

            <button
              type="button"
              className="detail-close"
              onClick={() => setSelectedId(reports[0].id)}
              aria-label="Close report"
            >
              ×
            </button>
          </div>

          <div className="detail-body">
            <div className="detail-images">
              <ReportThumbnail accent={selected.accent} />
              <div className="detail-secondary">
                <div className="detail-people" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span>{selected.count}</span>
              </div>
            </div>

            <div className="detail-title">{selected.title}</div>
            <div className="detail-meta">
              {selected.time} - reported by {selected.reporter}
            </div>

            <div className="detail-votes">
              <button type="button" className="vote-button vote-up" aria-label="Agree">
                <span>⌃</span>
              </button>
              <button type="button" className="vote-button vote-down" aria-label="Disagree">
                <span>⌄</span>
              </button>
              <button type="button" className="still-button">
                <span className="still-icon">?</span>
                <span>Are they still there?</span>
              </button>
            </div>

            <div className="comments">
              <div className="comments-title">Comment Thread</div>
              <div className="comment-user">
                <span className="comment-avatar">F</span>
                <span>Flying Seal</span>
              </div>
              <p>
                Lorem&nbsp;&nbsp;ipsum&nbsp;&nbsp;dolor&nbsp;&nbsp;sit&nbsp;&nbsp;amet,
                consectetur adipiscing elit. Pellentesque vel tellus sed tellus.
              </p>
            </div>
          </div>
        </section>

        <button
          type="button"
          className="report-action"
          onClick={() => setReportOpen(true)}
        >
          REPORT
        </button>
      </main>

      {rightsOpen ? (
        <div
          className="modal-layer"
          onClick={() => setRightsOpen(false)}
          role="presentation"
        >
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rights-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="modal-kicker">RESOURCES</div>
                <h2 id="rights-title">Know Your Rights</h2>
              </div>
              <button type="button" className="modal-x" onClick={() => setRightsOpen(false)}>
                ×
              </button>
            </div>
            <p>
              Keep trusted legal and public resources close at hand while you
              navigate the city.
            </p>
            <div className="resource-list">
              <a href="https://www.ilrc.org/" target="_blank" rel="noreferrer">
                Immigrant Legal Resource Center
              </a>
              <a
                href="https://www.immigrantdefenseproject.org/ice-ruses/"
                target="_blank"
                rel="noreferrer"
              >
                Immigrant Defense Project
              </a>
              <a
                href="https://www.phila.gov/departments/office-of-immigrant-affairs/resources/"
                target="_blank"
                rel="noreferrer"
              >
                Philadelphia Office of Immigrant Affairs
              </a>
            </div>
          </section>
        </div>
      ) : null}

      {reportOpen ? (
        <div
          className="modal-layer"
          onClick={() => setReportOpen(false)}
          role="presentation"
        >
          <section
            className="modal-card report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="modal-kicker">NEW SIGHTING</div>
                <h2 id="report-title">Report what you saw</h2>
              </div>
              <button type="button" className="modal-x" onClick={() => setReportOpen(false)}>
                ×
              </button>
            </div>

            <label>
              Location
              <input defaultValue={selected.address} />
            </label>

            <label>
              What happened?
              <textarea
                rows={5}
                placeholder="Describe only what you personally observed."
              />
            </label>

            <div className="report-modal-actions">
              <span>Prototype flow</span>
              <button type="button" onClick={() => setReportOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
