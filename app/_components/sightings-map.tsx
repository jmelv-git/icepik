"use client";

import type * as Leaflet from "leaflet";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { MAP_CENTER } from "@/lib/geo";
import { type Sighting } from "@/lib/sightings";
import {
  DRAFT_PIN_MARKUP,
  clusterMarkup,
  clusterSightings,
  clusterTitle,
  pinMarkup,
  pinTitle,
  sameSpot,
} from "./map-pins";

// CARTO's free basemap key (https://carto.com/basemaps/apikey). Without it,
// every tile reads "API KEY REQUIRED".
const CARTO_KEY = (process.env.NEXT_PUBLIC_CARTO_KEY ?? "").trim();

export type Point = { lat: number; lng: number };
export type Padding = {
  paddingTopLeft: [number, number];
  paddingBottomRight: [number, number];
};

export type MapApi = {
  showPoint(point: Point, padding: Padding): void;
  showPoints(points: Point[], padding: Padding): void;
  center(): Point | null;
};

type Props = {
  ref: Ref<MapApi>;
  sightings: Sighting[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectGroup: (ids: string[]) => void;
  placing: boolean;
  draft: Point | null;
  onPlace: (point: Point) => void;
  searchResult: (Point & { label: string }) | null;
};

export function SightingsMap({
  ref,
  sightings,
  selectedId,
  onSelect,
  onSelectGroup,
  placing,
  draft,
  onPlace,
  searchResult,
}: Props) {
  const node = useRef<HTMLDivElement>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const pins = useRef<Leaflet.LayerGroup | null>(null);
  const draftMarker = useRef<Leaflet.Marker | null>(null);
  const searchMarker = useRef<Leaflet.CircleMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(13);

  // Leaflet handlers are attached once; they call the latest props.
  const latest = useRef({ onSelect, onSelectGroup, onPlace, placing });
  useEffect(() => {
    latest.current = { onSelect, onSelectGroup, onPlace, placing };
  });

  useImperativeHandle(
    ref,
    () => ({
      showPoint(point, padding) {
        map.current?.panInside([point.lat, point.lng], padding);
      },
      showPoints(points, padding) {
        const L = leaflet.current;
        if (!L || !map.current || !points.length) return;
        map.current.fitBounds(
          L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
          { ...padding, maxZoom: 16 },
        );
      },
      center() {
        const center = map.current?.getCenter();
        return center ? { lat: center.lat, lng: center.lng } : null;
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    import("./leaflet").then(({ L }) => {
      if (cancelled || !node.current) return;

      const instance = L.map(node.current, {
        center: MAP_CENTER,
        zoom: 13,
        minZoom: 9,
        maxZoom: 19,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(instance);

      // CARTO's Positron style, with its attribution visible. Tiles load
      // only after the policy is accepted.
      L.tileLayer.provider("CartoDB.Positron", { apikey: CARTO_KEY }).addTo(instance);

      instance.on("zoomend", () => setZoom(instance.getZoom()));
      instance.on("click", (event) => {
        if (latest.current.placing) {
          latest.current.onPlace({ lat: event.latlng.lat, lng: event.latlng.lng });
        }
      });

      leaflet.current = L;
      map.current = instance;
      pins.current = L.layerGroup().addTo(instance);
      setReady(true);
    });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      pins.current = null;
      draftMarker.current = null;
      searchMarker.current = null;
    };
  }, []);

  // Redraw pins and clusters when the pins, the selection or the zoom change.
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    const layer = pins.current;
    if (!ready || !L || !instance || !layer) return;

    layer.clearLayers();
    const toPixels = (lat: number, lng: number) => instance.project([lat, lng], zoom);

    // The selected pin is always drawn on its own, on top.
    const selected = sightings.find((s) => s.id === selectedId);
    const others = sightings.filter((s) => s.id !== selectedId);

    for (const cluster of clusterSightings(others, toPixels)) {
      const { members } = cluster;

      if (members.length === 1) {
        layer.addLayer(pinMarker(L, members[0], false));
        continue;
      }

      L.marker([cluster.lat, cluster.lng], {
        title: clusterTitle(members),
        icon: L.divIcon({
          className: "cluster-icon",
          html: clusterMarkup(members),
          iconSize: [0, 0],
        }),
      })
        .on("click", () => {
          // While placing a new pin, a tap on a cluster places it there too.
          if (latest.current.placing) {
            latest.current.onPlace({ lat: cluster.lat, lng: cluster.lng });
          } else if (sameSpot(members) || instance.getZoom() >= instance.getMaxZoom() - 1) {
            latest.current.onSelectGroup(members.map((s) => s.id));
          } else {
            instance.fitBounds(
              L.latLngBounds(members.map((s) => [s.lat, s.lng] as [number, number])),
              { padding: [80, 80], maxZoom: 18 },
            );
          }
        })
        .addTo(layer);
    }

    if (selected) layer.addLayer(pinMarker(L, selected, true));

    function pinMarker(L: typeof Leaflet, sighting: Sighting, active: boolean) {
      return L.marker([sighting.lat, sighting.lng], {
        title: pinTitle(sighting),
        zIndexOffset: active ? 1000 : 0,
        icon: L.divIcon({
          className: active ? "pin-icon pin-active" : "pin-icon",
          html: pinMarkup(sighting),
          // The pin is drawn and sized in CSS (.pin) so it scales with the UI.
          iconSize: [0, 0],
        }),
      }).on("click", () => {
        if (latest.current.placing) {
          latest.current.onPlace({ lat: sighting.lat, lng: sighting.lng });
        } else {
          latest.current.onSelect(sighting.id);
        }
      });
    }
  }, [ready, sightings, selectedId, zoom]);

  // The pin someone is placing for a new report. It can be dragged.
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (!ready || !L || !instance) return;

    instance.getContainer().classList.toggle("placing", placing);

    if (!draft) {
      draftMarker.current?.remove();
      draftMarker.current = null;
      return;
    }

    if (!draftMarker.current) {
      draftMarker.current = L.marker([draft.lat, draft.lng], {
        draggable: true,
        title: "New sighting",
        zIndexOffset: 2000,
        icon: L.divIcon({ className: "pin-icon", html: DRAFT_PIN_MARKUP, iconSize: [0, 0] }),
      })
        .on("dragend", (event) => {
          const { lat, lng } = (event.target as Leaflet.Marker).getLatLng();
          latest.current.onPlace({ lat, lng });
        })
        .addTo(instance);
    } else {
      draftMarker.current.setLatLng([draft.lat, draft.lng]);
    }
  }, [ready, draft, placing]);

  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (!ready || !L || !instance) return;

    searchMarker.current?.remove();
    searchMarker.current = null;
    if (!searchResult) return;

    // Leaflet treats a string tooltip as HTML. Place names come from
    // OpenStreetMap, which anyone can edit, so pass them as plain text.
    const label = document.createElement("span");
    label.textContent = searchResult.label;

    searchMarker.current = L.circleMarker([searchResult.lat, searchResult.lng], {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: "#4f93c8",
      fillOpacity: 1,
    })
      .bindTooltip(label)
      .addTo(instance);
    instance.setView([searchResult.lat, searchResult.lng], 16, { animate: true });
  }, [ready, searchResult]);

  return <div ref={node} className="map" />;
}
