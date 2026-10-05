import { NextRequest, NextResponse } from "next/server";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const HEADERS = {
  "User-Agent": "icepik-osm-demo/1.0 (Next.js demo)",
  Accept: "application/json",
};

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "lat and lon are required" },
      { status: 400 },
    );
  }

  const latNumber = Number(lat);
  const lonNumber = Number(lon);

  if (
    !Number.isFinite(latNumber) ||
    !Number.isFinite(lonNumber) ||
    latNumber < -90 ||
    latNumber > 90 ||
    lonNumber < -180 ||
    lonNumber > 180
  ) {
    return NextResponse.json(
      { error: "lat and lon must be valid coordinates" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${NOMINATIM_BASE}/reverse?${new URLSearchParams({
        lat,
        lon,
        format: "jsonv2",
      }).toString()}`,
      {
        headers: HEADERS,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      display_name: data.display_name ?? "No address found",
    });
  } catch {
    return NextResponse.json(
      { error: "Reverse geocoding service unavailable" },
      { status: 502 },
    );
  }
}
