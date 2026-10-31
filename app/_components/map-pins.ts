import { STATUS_LABEL, sightingTitle, statusOf, type Sighting, type Status } from "@/lib/sightings";

const PIN_SHAPE = "M32 95C26 79 7 59 6 36a26 26 0 0 1 52 0c-1 23-20 43-26 59Z";

const PIN_COLOR: Record<Status, string> = {
  verified: "#ff1d25",
  unverified: "#ffc800",
  disputed: "#6b6f78",
};

const GLYPH: Record<Status, (color: string) => string> = {
  verified: (color) =>
    `<circle cx="32" cy="35" r="15" fill="${color}"/>
     <path d="M24.5 35.5l5.5 5.5 10-11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  // A dark "!", like a warning sign: white on yellow is too faint.
  unverified: (color) =>
    `<path d="M32 17 50 48H14Z" fill="${color}" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>
     <rect x="29.5" y="26" width="5" height="13" rx="2.5" fill="#1d1f26"/>
     <circle cx="32" cy="43.5" r="2.7" fill="#1d1f26"/>`,
  // Disputed pins look clearly different: grey, dashed and marked "?".
  disputed: (color) =>
    `<path d="M25.5 29a6.5 6.5 0 1 1 9.5 5.8c-2 1-3 2.4-3 4.4v1.3" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
     <circle cx="32" cy="48" r="3" fill="${color}"/>`,
};

export function pinMarkup(sighting: Sighting) {
  const status = statusOf(sighting);
  const color = PIN_COLOR[status];
  const dash = status === "disputed" ? ` stroke-dasharray="9 7"` : "";
  // Yellow is almost as light as the map, so unverified pins get a dark amber
  // rim outside the yellow outline to keep their shape visible.
  const rim =
    status === "unverified"
      ? `<path d="${PIN_SHAPE}" fill="none" stroke="#8a6a00" stroke-width="11" stroke-linejoin="round"/>`
      : "";

  return `<svg class="pin pin-${status}" viewBox="0 0 64 100" overflow="visible" aria-hidden="true">
    ${rim}
    <path d="${PIN_SHAPE}" fill="#fff" stroke="${color}" stroke-width="6" stroke-linejoin="round"${dash}/>
    ${GLYPH[status](color)}
  </svg>`;
}

// The spot being chosen for a new sighting.
export const DRAFT_PIN_MARKUP = `<svg class="pin pin-draft" viewBox="0 0 64 100" aria-hidden="true">
  <path d="${PIN_SHAPE}" fill="#4f93c8" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
  <path d="M32 24v22M21 35h22" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
</svg>`;

const SEVERITY: Status[] = ["verified", "unverified", "disputed"];

export function clusterMarkup(members: Sighting[]) {
  const statuses = new Set(members.map(statusOf));
  const strongest = SEVERITY.find((status) => statuses.has(status)) ?? "unverified";
  // Hidden from screen readers, so they announce the marker's title instead
  // of just the number.
  return `<span class="cluster cluster-${strongest}" aria-hidden="true">${members.length}</span>`;
}

// Marker titles are what screen readers announce (the SVGs are hidden from
// them), so they include the status, not just the place.
export function pinTitle(sighting: Sighting) {
  return `${sightingTitle(sighting)}, ${STATUS_LABEL[statusOf(sighting)].toLowerCase()}`;
}

export function clusterTitle(members: Sighting[]) {
  const counts = SEVERITY.map((status) => ({
    status,
    count: members.filter((s) => statusOf(s) === status).length,
  }))
    .filter(({ count }) => count > 0)
    .map(({ status, count }) => `${count} ${STATUS_LABEL[status].toLowerCase()}`);
  return `${members.length} sightings here: ${counts.join(", ")}`;
}

export type Cluster = { members: Sighting[]; lat: number; lng: number };

// Groups pins that would overlap on screen. Rounding puts nearby reports on
// exactly the same coordinates, so without this they'd hide each other.
export function clusterSightings(
  sightings: Sighting[],
  toPixels: (lat: number, lng: number) => { x: number; y: number },
  radius = 40,
): Cluster[] {
  const clusters: (Cluster & { x: number; y: number })[] = [];

  for (const sighting of sightings) {
    const { x, y } = toPixels(sighting.lat, sighting.lng);
    const near = clusters.find((c) => Math.hypot(c.x - x, c.y - y) < radius);
    if (near) near.members.push(sighting);
    else clusters.push({ members: [sighting], lat: sighting.lat, lng: sighting.lng, x, y });
  }

  return clusters;
}

// True when every pin in the group sits on the same spot, so zooming in
// can't separate them.
export function sameSpot(members: Sighting[]) {
  return members.every((s) => s.lat === members[0].lat && s.lng === members[0].lng);
}
