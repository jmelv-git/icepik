import { NextRequest, NextResponse } from "next/server";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const HEADERS = {
  "User-Agent": "icepik-osm-demo/1.0 (Next.js demo)",
  Accept: "application/json",
};

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    const response = await fetch(
      `${NOMINATIM_BASE}/search?${new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "5",
        addressdetails: "0",
      }).toString()}`,
      {
        headers: HEADERS,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Nominatim responded with ${response.status}`);
    }

    const rawResults: NominatimResult[] = await response.json();

    const results = rawResults.map((item) => ({
      display_name: item.display_name,
      lat: item.lat,
      lon: item.lon,
      type: item.type,
    }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: "Search service unavailable" },
      { status: 502 },
    );
  }
}
