"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    L: any;
  }
}

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
};

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [readout, setReadout] = useState<{
    visible: boolean;
    lat: number;
    lon: number;
    address: string;
  }>({
    visible: false,
    lat: 0,
    lon: 0,
    address: "",
  });

  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapRef.current) return;

    const map = window.L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView([20, 0], 2.3);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;

    map.on("click", async (event: any) => {
      const lat = event.latlng.lat;
      const lon = event.latlng.lng;

      dropMarker(lat, lon);
      setReadout({
        visible: true,
        lat,
        lon,
        address: "Looking up address…",
      });

      try {
        const response = await fetch(
          `/api/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
          { cache: "no-store" },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Lookup failed");
        }

        setReadout((current) => ({
          ...current,
          address: data.display_name || "No address found",
        }));
      } catch {
        setReadout((current) => ({
          ...current,
          address: "Lookup failed",
        }));
      }
    });

    function dropMarker(lat: number, lon: number) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
      }

      markerRef.current = window.L.marker([lat, lon]).addTo(map);
      return markerRef.current;
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [leafletReady]);

  async function runSearch() {
    const trimmed = query.trim();
    setResults([]);
    setMessage("");

    if (!trimmed) return;

    setSearching(true);

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Search failed");
      }

      if (!Array.isArray(data) || data.length === 0) {
        setMessage("No matches found");
        return;
      }

      setResults(data);
    } catch {
      setMessage("Search failed — try again");
    } finally {
      setSearching(false);
    }
  }

  function selectResult(item: SearchResult) {
    const lat = Number.parseFloat(item.lat);
    const lon = Number.parseFloat(item.lon);

    if (!mapRef.current || !window.L) return;

    mapRef.current.setView([lat, lon], 15);

    if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current);
    }

    markerRef.current = window.L
      .marker([lat, lon])
      .addTo(mapRef.current)
      .bindPopup(item.display_name)
      .openPopup();

    setResults([]);
    setQuery(item.display_name);
  }

  return (
    <>
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        strategy="afterInteractive"
        onLoad={() => setLeafletReady(true)}
      />

      <div ref={mapContainerRef} id="map" />

      <div className="panel">
        <div className="panel-head">
          <h1>ICEPik Atlas</h1>
          <p>OpenStreetMap + Next.js demo</p>
        </div>

        <div className="search-row">
          <input
            id="q"
            type="text"
            placeholder="Search a place…"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runSearch();
            }}
          />
          <button type="button" onClick={runSearch} disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        <ul id="results">
          {message ? <li className="empty">{message}</li> : null}
          {results.map((item) => (
            <li
              key={`${item.lat}-${item.lon}-${item.display_name}`}
              onClick={() => selectResult(item)}
            >
              {item.display_name}
            </li>
          ))}
        </ul>
      </div>

      <div className="hint">Click anywhere on the map to look up that address</div>

      {readout.visible ? (
        <div className="readout">
          <div className="coords">
            {readout.lat.toFixed(5)}, {readout.lon.toFixed(5)}
          </div>
          <div className="addr">{readout.address}</div>
        </div>
      ) : null}
    </>
  );
}
