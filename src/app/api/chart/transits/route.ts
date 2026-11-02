import { NextRequest, NextResponse } from "next/server";
import { computeTransits } from "@/lib/charts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// M3.1: transit-to-natal aspects for a Western chart. Calculation
// only, like /api/chart/calculate: free, unsaved, no credits, no
// session. The client sends the natal planet longitudes from the
// chart it already calculated in-memory; nothing is stored here and
// nothing is sent to AI. Birth data itself is never required: only
// longitudes, which are positions, not birth records.
export async function POST(req: NextRequest) {
  let body: { natalPlanets?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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
    const result = computeTransits(
      (body.natalPlanets as Array<{ name: string; longitude: number }>).map((p) => ({
        name: p.name,
        longitude: p.longitude,
      })),
      date
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Transit calculation failed." },
      { status: 400 }
    );
  }
}
