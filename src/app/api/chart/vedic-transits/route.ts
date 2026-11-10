import { NextRequest, NextResponse } from "next/server";
import { computeGochara } from "@/lib/vedic";
import { checkRateLimit, clientIp, ipLimitKey, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// M3.2: Vedic Gochara plus panchanga for one date. Calculation only,
// like /api/chart/calculate: free, unsaved, no credits, no session.
// The client sends the natal Moon longitude and natal planet
// longitudes from the chart it already calculated in-memory; nothing
// is stored here and nothing is sent to AI. Birth data itself is
// never required: only longitudes, which are positions.
export async function POST(req: NextRequest) {
  // Phase 6: this calculation route was unrated (N3). Same budget as
  // /api/chart/calculate: 20/hr/IP.
  if (!(await checkRateLimit(ipLimitKey("chart-calc", clientIp(req)), RATE_LIMITS.chartCalcIp)).allowed) {
    return rateLimitExceeded();
  }
  let body: { natalMoonLongitude?: unknown; natalPlanets?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.natalMoonLongitude !== "number" || !Number.isFinite(body.natalMoonLongitude)) {
    return NextResponse.json({ error: "natalMoonLongitude must be a finite number." }, { status: 400 });
  }
  if (!Array.isArray(body.natalPlanets) || body.natalPlanets.length === 0 || body.natalPlanets.length > 12) {
    return NextResponse.json({ error: "natalPlanets must be a non-empty array of at most 12 planets." }, { status: 400 });
  }
  for (const p of body.natalPlanets as unknown[]) {
    const planet = p as { name?: unknown; longitude?: unknown };
    if (!planet || typeof planet.name !== "string" || !planet.name || typeof planet.longitude !== "number" || !Number.isFinite(planet.longitude)) {
      return NextResponse.json({ error: "Each natal planet needs a name and a finite longitude." }, { status: 400 });
    }
  }
  const date =
    typeof body.date === "string" && body.date
      ? body.date
      : new Date().toISOString().slice(0, 10);
  try {
    const result = computeGochara(
      body.natalMoonLongitude,
      (body.natalPlanets as Array<{ name: string; longitude: number }>).map((p) => ({
        name: p.name,
        longitude: p.longitude,
      })),
      date
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gochara calculation failed." },
      { status: 400 }
    );
  }
}
