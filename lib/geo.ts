// Philadelphia City Hall. The map opens here.
export const MAP_CENTER: [number, number] = [39.9526, -75.1652];

export const ONE_MILE_M = 1609;
// The server's limit for confirming or disputing a sighting.
export const VOTE_RADIUS_M = 1000;
// "Already reported nearby?" before posting a new sighting.
export const NEARBY_RADIUS_M = 200;

const toRad = (d: number) => (d * Math.PI) / 180;

// Same haversine formula the database uses, so a pre-check here agrees with
// the server's own check.
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// The database rounds pins to 3 decimals (about 100 m). Rounding here too
// means the map preview and the reverse geocoder only see the rounded point.
export function roundCoord(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
