import { NextResponse } from "next/server";
import { roundCoord } from "@/lib/geo";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
// Nominatim's usage policy asks for a User-Agent that identifies the app.
const HEADERS = {
  "User-Agent": "ICEPik/1.0 (community safety map)",
  Accept: "application/json",
};
const MAX_LABEL = 120;

type NominatimAddress = Partial<
  Record<
    | "house_number"
    | "road"
    | "pedestrian"
    | "footway"
    | "path"
    | "neighbourhood"
    | "quarter"
    | "suburb"
    | "city_district",
    string
  >
>;

// Suggests a label for a new pin: street names only, never a full address.
// The point arrives in the request body, not the URL, and is rounded to
// about 100 m before it leaves this server, so Nominatim sees this server's
// IP address and only the rounded point. Never log the request.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { lat, lng } = (body ?? {}) as { lat?: unknown; lng?: unknown };

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { error: "lat and lng must be valid coordinates" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${NOMINATIM_BASE}/reverse?${new URLSearchParams({
        lat: String(roundCoord(lat)),
        lon: String(roundCoord(lng)),
        format: "jsonv2",
        zoom: "17",
        addressdetails: "1",
      }).toString()}`,
      {
        headers: HEADERS,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`);
    }

    const data: { address?: NominatimAddress } = await response.json();
    return NextResponse.json({ label: streetLabel(data.address ?? {}) });
  } catch {
    return NextResponse.json(
      { error: "Reverse geocoding service unavailable" },
      { status: 502 },
    );
  }
}

// "1200 block of North Broad Street", "North Broad Street", or the
// neighborhood when there's no street.
function streetLabel(address: NominatimAddress) {
  const street = address.road ?? address.pedestrian ?? address.footway ?? address.path;
  const area =
    address.neighbourhood ?? address.quarter ?? address.suburb ?? address.city_district;

  if (!street) return (area ?? "").slice(0, MAX_LABEL);

  const houseNumber = Number.parseInt(address.house_number ?? "", 10);
  const label =
    houseNumber >= 100
      ? `${Math.floor(houseNumber / 100) * 100} block of ${street}`
      : street;
  return label.slice(0, MAX_LABEL);
}
