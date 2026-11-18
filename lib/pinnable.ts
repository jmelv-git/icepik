// TEMPORARY (step 0): today's rule behind the final API. Every 0.001° grid
// point is pinnable, so snapping is plain rounding. Replaced by the real
// land-and-road check (change 4).
export const SNAP_RANGE_M = 300;
export const ROAD_RANGE_M = 200;
export type LatLng = { lat: number; lng: number };
export type SnapResult =
  | { ok: true; spot: LatLng }
  | { ok: false; reason: "none-nearby" | "unavailable" };

const grid = (value: number) => Math.round(value * 1000) / 1000;

export async function snapToPinnable(point: LatLng): Promise<SnapResult> {
  return { ok: true, spot: { lat: grid(point.lat), lng: grid(point.lng) } };
}

export async function isPinnable(gridPoint: LatLng): Promise<boolean> {
  return Number.isFinite(gridPoint.lat) && Number.isFinite(gridPoint.lng);
}

export function setTileTemplate(template: string) {
  void template;
}

export function tilesAround(point: LatLng): { z: number; x: number; y: number }[] {
  void point;
  return [];
}
