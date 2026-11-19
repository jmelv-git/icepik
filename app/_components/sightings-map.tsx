"use client";

import type * as Leaflet from "leaflet";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { MAP_CENTER } from "@/lib/geo";
import { readLayout } from "@/lib/layout";
import { type Sighting } from "@/lib/sightings";
import type { MyPosition } from "@/lib/use-my-position";
import {
  DRAFT_PIN_MARKUP,
  MY_LOCATION_MARKUP,
  clusterMarkup,
  clusterSightings,
  clusterTitle,
  pinMarkup,
  pinTitle,
  sameSpot,
  savedPlaceElement,
  searchedPlaceElement,
  type SavedPlaceKind,
} from "./map-pins";

// CARTO's free basemap key (https://carto.com/basemaps/apikey). Without it,
// every tile reads "API KEY REQUIRED".
const CARTO_KEY = (process.env.NEXT_PUBLIC_CARTO_KEY ?? "").trim();

// CARTO serves map images up to zoom 18 and refuses deeper ones, which
// would leave the map blank. They're the fallback for browsers without WebGL.
const RASTER_MAX_ZOOM = 18;
// With WebGL, MapLibre draws the map from CARTO's vector tiles instead. They
// stop at zoom 15, but MapLibre redraws them sharply when zoomed in further.
const VECTOR_MAX_ZOOM = 20;
// CARTO's Positron and Dark Matter styles for MapLibre. These URLs, and the
// tiles, fonts and icons the styles load, carry no key.
const VECTOR_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

export type Point = { lat: number; lng: number };
// A place saved on this device, as drawn on the map. "pending" is one being
// named, not saved yet.
export type MapPlace = Point & { key: string; kind: SavedPlaceKind; label: string; pending?: boolean };
export type Bounds = { south: number; west: number; north: number; east: number };
export type Padding = {
  paddingTopLeft: [number, number];
  paddingBottomRight: [number, number];
};

export type MapApi = {
  showPoint(point: Point, padding: Padding): void;
  showPoints(points: Point[], padding: Padding): void;
  // Center the free part of the map (inside the padding) on a point, zoomed
  // in to at least minZoom.
  centerOn(point: Point, padding: Padding, minZoom?: number): void;
  center(): Point | null;
  // Whether the map has moved since it loaded, other than by centerOn: the
  // person dragged or zoomed it, or the app showed them something.
  moved(): boolean;
  zoomIn(): void;
  zoomOut(): void;
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
  myPosition: MyPosition | null;
  savedPlaces: MapPlace[];
  onViewChange: (bounds: Bounds) => void;
  // Called with the URL template ({z}/{x}/{y}) of the vector tiles the map
  // draws from, once a style has loaded. Never called on the raster map.
  onVectorTiles?: (template: string) => void;
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
  myPosition,
  savedPlaces,
  onViewChange,
  onVectorTiles,
}: Props) {
  const node = useRef<HTMLDivElement>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const pins = useRef<Leaflet.LayerGroup | null>(null);
  const draftMarker = useRef<Leaflet.Marker | null>(null);
  const searchMarker = useRef<Leaflet.Marker | null>(null);
  const meMarker = useRef<Leaflet.Marker | null>(null);
  const meAccuracy = useRef<Leaflet.Circle | null>(null);
  const placeMarkers = useRef<Leaflet.LayerGroup | null>(null);
  const moved = useRef(false);
  // Set while centerOn moves the map, so that move doesn't count as moved.
  const centering = useRef(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(13);

  // Leaflet handlers are attached once; they call the latest props.
  const latest = useRef({ onSelect, onSelectGroup, onPlace, placing, onViewChange });
  useEffect(() => {
    latest.current = { onSelect, onSelectGroup, onPlace, placing, onViewChange };
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
      centerOn(point, padding, minZoom = 0) {
        const L = leaflet.current;
        const instance = map.current;
        if (!L || !instance) return;
        const zoom = Math.max(instance.getZoom(), minZoom);
        const [left, top] = padding.paddingTopLeft;
        const [right, bottom] = padding.paddingBottomRight;
        // Shift the center so the point lands in the middle of the free area.
        const shift = L.point((left - right) / 2, (top - bottom) / 2);
        const middle = instance.project([point.lat, point.lng], zoom).subtract(shift);
        centering.current = true;
        instance.setView(instance.unproject(middle, zoom), zoom, { animate: true });
        centering.current = false;
      },
      center() {
        const center = map.current?.getCenter();
        return center ? { lat: center.lat, lng: center.lng } : null;
      },
      moved() {
        return moved.current;
      },
      zoomIn() {
        map.current?.zoomIn();
      },
      zoomOut() {
        map.current?.zoomOut();
      },
    }),
    [],
  );

  const latestOnVectorTiles = useRef(onVectorTiles);
  useEffect(() => {
    latestOnVectorTiles.current = onVectorTiles;
  });

  useEffect(() => {
    let cancelled = false;
    const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
    let stopFollowingScheme = () => {};
    let stopWatchingSize = () => {};

    import("./leaflet").then(({ L, hasWebGL2, loadVectorMap, readableLabels }) => {
      if (cancelled || !node.current) return;

      // MapLibre needs WebGL2. Without it, the map shows CARTO's map images.
      const vector = hasWebGL2();
      const instance = L.map(node.current, {
        center: MAP_CENTER,
        zoom: 13,
        minZoom: 9,
        maxZoom: vector ? VECTOR_MAX_ZOOM : RASTER_MAX_ZOOM,
        zoomControl: false,
      });

      // The raster map: CARTO's Positron style, or its Dark Matter style when
      // the device is set to dark, with their attribution visible. Both come
      // from the same tile servers with the same key. Tiles load only after
      // the policy is accepted. A pinch can briefly go past the deepest zoom
      // before it springs back: enlarge the deepest tiles then, instead of
      // asking for ones CARTO refuses.
      const showRasterMap = () => {
        instance.setMaxZoom(RASTER_MAX_ZOOM);
        const tileOptions = { apikey: CARTO_KEY, maxNativeZoom: RASTER_MAX_ZOOM };
        // Dark Matter draws street and place names dim grey on near-black, too
        // faint to read. So in dark the names come from their own tiles, in a
        // pane above the map (below every pin), where CSS lightens them.
        const labels = instance.createPane("labels");
        labels.style.zIndex = "450";
        labels.style.pointerEvents = "none";
        const styleLayers = (dark: boolean) =>
          dark
            ? [
                L.tileLayer.provider("CartoDB.DarkMatterNoLabels", tileOptions),
                L.tileLayer.provider("CartoDB.DarkMatterOnlyLabels", {
                  ...tileOptions,
                  pane: "labels",
                  className: "map-labels",
                }),
              ]
            : [L.tileLayer.provider("CartoDB.Positron", tileOptions)];

        // Switching live keeps the style on screen under the new one until
        // the new one has loaded, so the map doesn't flash empty. A switch
        // that hasn't finished loading is dropped by the next one.
        let shown: Leaflet.TileLayer[] = [];
        let shownDark: boolean | null = null;
        let pending: Leaflet.TileLayer[] = [];
        const showTiles = () => {
          const dark = darkScheme.matches;
          pending.forEach((layer) => layer.remove());
          pending = [];
          if (dark === shownDark) return;
          const next = styleLayers(dark);
          next.forEach((layer) => layer.addTo(instance));
          if (shownDark === null) {
            shown = next;
            shownDark = dark;
            return;
          }
          pending = next;
          next[0].once("load", () => {
            if (pending !== next) return;
            shown.forEach((layer) => layer.remove());
            shown = next;
            shownDark = dark;
            pending = [];
          });
        };
        showTiles();
        darkScheme.addEventListener("change", showTiles);
        stopFollowingScheme = () => darkScheme.removeEventListener("change", showTiles);
      };

      // The vector map: MapLibre draws CARTO's Positron or Dark Matter style
      // in Leaflet's tile pane, under everything else. It only draws: Leaflet
      // keeps every tap, drag and zoom, and the credit line, which reads as
      // the raster map's. Light and dark switch live with setStyle, which
      // keeps the tiles, so the map doesn't flash empty. If MapLibre can't
      // start (its download, the WebGL context or the style failed), the
      // raster map takes its place.
      const showVectorMap = async () => {
        let layer: Leaflet.MaplibreGL | null = null;
        let failed = false;
        const fallBack = () => {
          if (failed || cancelled) return;
          failed = true;
          stopFollowingScheme();
          layer?.remove();
          showRasterMap();
        };
        try {
          const { MaplibreGL } = await loadVectorMap();
          if (cancelled) return;
          const style = () => (darkScheme.matches ? VECTOR_STYLES.dark : VECTOR_STYLES.light);
          const created = new MaplibreGL({
            style: style(),
            // Dark Matter draws names too faint to read: make them readable.
            transformStyle: readableLabels,
            interactive: false,
            attributionControl: {
              customAttribution: L.tileLayer.provider("CartoDB.Positron").getAttribution?.() ?? "",
            },
          });
          try {
            created.addTo(instance);
          } catch (error) {
            // MapLibre threw while starting: take out the half-added layer.
            created.onRemove = () => {
              created.getContainer()?.remove();
              return created;
            };
            instance.removeLayer(created);
            throw error;
          }
          layer = created;
          // A picture, like the raster map's images.
          created.getContainer().setAttribute("aria-hidden", "true");

          const glMap = created.getMaplibreMap();
          let styled = false;
          glMap.once("style.load", () => (styled = true));
          // Once a style has loaded, an error (a tile that didn't load, say)
          // leaves the rest of the map working. Before that, give up after
          // MapLibre has finished reporting it.
          glMap.on("error", () => {
            if (!styled) setTimeout(fallBack);
          });
          let template = "";
          glMap.on("sourcedata", (event) => {
            if (event.sourceDataType !== "metadata") return;
            const source = glMap.getSource(event.sourceId) as
              | { type?: string; tiles?: string[] }
              | undefined;
            const tiles = source?.type === "vector" ? source.tiles : undefined;
            if (!tiles?.[0] || tiles[0] === template) return;
            template = tiles[0];
            latestOnVectorTiles.current?.(template);
          });

          const followScheme = () => {
            glMap.setStyle(style(), { transformStyle: readableLabels });
          };
          darkScheme.addEventListener("change", followScheme);
          stopFollowingScheme = () => darkScheme.removeEventListener("change", followScheme);
        } catch {
          fallBack();
        }
      };

      if (vector) showVectorMap();
      else showRasterMap();

      // Leaflet only watches the window's size. On tablets the map also
      // changes size when the pane beside it opens or closes. Not on desktop,
      // where panels float over a map that only resizes with the window.
      const sizeWatcher = new ResizeObserver(() => {
        if (readLayout() !== "desktop") instance.invalidateSize();
      });
      sizeWatcher.observe(node.current);
      stopWatchingSize = () => sizeWatcher.disconnect();

      const reportView = () => {
        const bounds = instance.getBounds();
        latest.current.onViewChange({
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        });
      };

      instance.on("zoomend", () => setZoom(instance.getZoom()));
      instance.on("movestart zoomstart", () => {
        if (!centering.current) moved.current = true;
      });
      // Also fires after zooms and resizes.
      instance.on("moveend", reportView);
      instance.on("click", (event) => {
        if (latest.current.placing) {
          latest.current.onPlace({ lat: event.latlng.lat, lng: event.latlng.lng });
        }
      });

      leaflet.current = L;
      map.current = instance;
      pins.current = L.layerGroup().addTo(instance);
      // Searched places get their own layer: above the map, below every pin
      // and cluster (Leaflet's marker pane is 600), so sightings stay on top.
      instance.createPane("search").style.zIndex = "550";
      // The blue dot goes above the pins (600), or a pin could hide it. Taps
      // go through it to the pin. Its accuracy circle stays below them.
      instance.createPane("me").style.zIndex = "610";
      instance.createPane("me-accuracy").style.zIndex = "545";
      // Saved places: on the map, under everything else drawn on it.
      instance.createPane("saved").style.zIndex = "540";
      placeMarkers.current = L.layerGroup().addTo(instance);
      reportView();
      setReady(true);
    });

    return () => {
      cancelled = true;
      stopFollowingScheme();
      stopWatchingSize();
      map.current?.remove();
      map.current = null;
      pins.current = null;
      draftMarker.current = null;
      searchMarker.current = null;
      meMarker.current = null;
      meAccuracy.current = null;
      placeMarkers.current = null;
    };
  }, []);

  // Saved places. Nothing happens when they're tapped, so taps go through to
  // the map and a report can still be placed there.
  useEffect(() => {
    const L = leaflet.current;
    const layer = placeMarkers.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    for (const place of savedPlaces) {
      L.marker([place.lat, place.lng], {
        pane: "saved",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "saved-place-icon",
          html: savedPlaceElement(place.kind, place.label, place.pending),
          iconSize: [0, 0],
        }),
      }).addTo(layer);
    }
  }, [ready, savedPlaces]);

  // The blue dot follows the position. Nothing happens when it's tapped, so
  // taps go through to the map.
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (!ready || !L || !instance) return;

    if (!myPosition) {
      meMarker.current?.remove();
      meAccuracy.current?.remove();
      meMarker.current = null;
      meAccuracy.current = null;
      return;
    }

    const at: [number, number] = [myPosition.lat, myPosition.lng];
    // A faint circle shows how sure the position is, unless it's so rough
    // (worked out from the network, say) that it would tint the whole map.
    const rough = myPosition.accuracy > 1500;
    const circleStyle = { opacity: rough ? 0 : 0.35, fillOpacity: rough ? 0 : 0.1 };
    if (!meMarker.current) {
      meAccuracy.current = L.circle(at, {
        pane: "me-accuracy",
        radius: myPosition.accuracy,
        interactive: false,
        color: "#1a73e8",
        weight: 1,
        fillColor: "#1a73e8",
        ...circleStyle,
      }).addTo(instance);
      meMarker.current = L.marker(at, {
        pane: "me",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "my-location-icon", html: MY_LOCATION_MARKUP, iconSize: [0, 0] }),
      }).addTo(instance);
    } else {
      meMarker.current.setLatLng(at);
      meAccuracy.current?.setLatLng(at).setRadius(myPosition.accuracy).setStyle(circleStyle);
    }
  }, [ready, myPosition]);

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
          } else if (sameSpot(members) || instance.getZoom() >= instance.getMaxZoom()) {
            latest.current.onSelectGroup(members.map((s) => s.id));
          } else {
            instance.fitBounds(
              L.latLngBounds(members.map((s) => [s.lat, s.lng] as [number, number])),
              { padding: [80, 80], maxZoom: instance.getMaxZoom() },
            );
          }
        })
        .addTo(layer);
    }

    if (selected) layer.addLayer(pinMarker(L, selected, true));

    function pinMarker(L: typeof Leaflet, sighting: Sighting, active: boolean) {
      const marker = L.marker([sighting.lat, sighting.lng], {
        title: pinTitle(sighting),
        zIndexOffset: active ? 1000 : 0,
        icon: L.divIcon({
          className: active ? "pin-icon pin-active" : "pin-icon",
          html: pinMarkup(sighting, active),
          // The pin is drawn and sized in CSS (.pin) so it scales with the UI.
          iconSize: [0, 0],
        }),
      });
      // Leaflet has no option for this. Like the report list, it tells screen
      // readers which pin is selected.
      marker.on("add", () => {
        marker.getElement()?.setAttribute("aria-pressed", String(active));
      });
      return marker.on("click", () => {
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

    // Nothing happens when it's tapped, so it isn't a button or a Tab stop,
    // and taps go through to the map (a report can still be placed here).
    searchMarker.current = L.marker([searchResult.lat, searchResult.lng], {
      pane: "search",
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "searched-place",
        html: searchedPlaceElement(searchResult.label),
        iconSize: [0, 0],
      }),
    }).addTo(instance);
    instance.setView([searchResult.lat, searchResult.lng], 16, { animate: true });
  }, [ready, searchResult]);

  return <div ref={node} className="map" />;
}
