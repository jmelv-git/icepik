import { NextResponse } from "next/server";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
// Nominatim's usage policy asks for a User-Agent that identifies the app.
const HEADERS = {
  "User-Agent": "ICEPik/1.0 (community safety map)",
  Accept: "application/json",
};
// Prefer results around Philadelphia without excluding other places.
const PHILADELPHIA_VIEWBOX = "-75.30,40.14,-74.95,39.86";

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  addresstype?: string;
  place_rank?: number;
  // [south, north, west, east], as strings.
  boundingbox?: string[];
};

// The search text arrives in the request body, not the URL, so an address
// someone looks up never lands in request logs. Never log it here either.
// Nominatim sees this server's IP address, not the visitor's.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const raw = (body as { q?: unknown } | null)?.q;
  const query = typeof raw === "string" ? raw.trim().slice(0, 200) : "";

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
        countrycodes: "us",
        viewbox: PHILADELPHIA_VIEWBOX,
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

    // What kind of place each result is, and how big, so the app can tell a
    // city or a park from an address before putting a pin there.
    const results = rawResults.map((item) => ({
      display_name: item.display_name,
      lat: item.lat,
      lon: item.lon,
      category: typeof item.category === "string" ? item.category : null,
      type: typeof item.type === "string" ? item.type : null,
      addresstype: typeof item.addresstype === "string" ? item.addresstype : null,
      place_rank: typeof item.place_rank === "number" ? item.place_rank : null,
      boundingbox:
        Array.isArray(item.boundingbox) && item.boundingbox.length === 4
          ? item.boundingbox.map(String)
          : null,
    }));

    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: "Search service unavailable" },
      { status: 502 },
    );
  }
}
