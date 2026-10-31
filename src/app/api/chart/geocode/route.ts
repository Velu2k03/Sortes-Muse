import { NextRequest, NextResponse } from "next/server";

// Free, no-key geocoding via OpenStreetMap Nominatim. The place string is
// used only to look up coordinates in this request: it is never stored,
// never logged, and never sent to any AI model. The response carries
// latitude and longitude ONLY, no place name, so callers cannot store
// the raw place string from this route. Data: OpenStreetMap contributors,
// ODbL 1.0. Rate limit mirrors /api/chart/calculate: 20 per IP per hour.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 20;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many lookups right now. Please try again later." }, { status: 429 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 100) {
    return NextResponse.json({ error: "Place name must be 3-100 characters." }, { status: 400 });
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "SortesCharts/1.0 (tarot.resonantatlas.com)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const latitude = first ? Number(first.lat) : NaN;
    const longitude = first ? Number(first.lon) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "No place found. Try a city name, or enter coordinates directly." }, { status: 404 });
    }
    return NextResponse.json({ latitude, longitude });
  } catch {
    return NextResponse.json({ error: "Place lookup failed. Enter coordinates directly." }, { status: 502 });
  }
}
