import { NextRequest, NextResponse } from "next/server";
import { calculateZiweiStacks } from "@/lib/charts";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// M3.3: Ziwei palace activation stacks for one year. Calculation
// only, like /api/chart/calculate: free, unsaved, no credits, no
// session. The client sends the birth inputs from the chart it
// already calculated in-memory; nothing is stored here and nothing
// is sent to AI. Birth data itself is never required beyond the
// inputs the natal chart already needed, and it stays in-memory.
export async function POST(req: NextRequest) {
  // Phase 6: this calculation route was unrated (N3). Same budget as
  // /api/chart/calculate: 20/hr/IP.
  if (!(await checkRateLimit(`chart-calc:${clientIp(req)}`, RATE_LIMITS.chartCalcIp)).allowed) {
    return rateLimitExceeded();
  }
  let body: {
    date?: unknown;
    hour?: unknown;
    minute?: unknown;
    gender?: unknown;
    longitude?: unknown;
    latitude?: unknown;
    timeZone?: unknown;
    year?: unknown;
    today?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.date !== "string" || !body.date) {
    return NextResponse.json({ error: "date must be a YYYY-MM-DD string." }, { status: 400 });
  }
  if (typeof body.hour !== "number" || !Number.isInteger(body.hour) || body.hour < 0 || body.hour > 23) {
    return NextResponse.json(
      { error: "Ziwei needs a birth hour: the twelve palaces are placed by the two-hour branch you were born in, so a chart from an unknown hour would be a guess." },
      { status: 400 }
    );
  }
  if (body.minute !== undefined && (typeof body.minute !== "number" || !Number.isInteger(body.minute) || body.minute < 0 || body.minute > 59)) {
    return NextResponse.json({ error: "minute must be an integer from 0 to 59." }, { status: 400 });
  }
  if (body.gender !== "male" && body.gender !== "female") {
    return NextResponse.json({ error: "gender must be male or female." }, { status: 400 });
  }
  if (body.longitude !== undefined && (typeof body.longitude !== "number" || !Number.isFinite(body.longitude))) {
    return NextResponse.json({ error: "longitude must be a finite number." }, { status: 400 });
  }
  // Phase 4B (4.3): optional latitude and timezone override, so the
  // stacks use the same IANA conversion as the natal chart. Both
  // are optional; without them the stacks keep the old
  // longitude-only correction, exactly like the natal chart does.
  if (body.latitude !== undefined && (typeof body.latitude !== "number" || !Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90)) {
    return NextResponse.json({ error: "latitude must be a finite number from -90 to 90." }, { status: 400 });
  }
  if (body.timeZone !== undefined && typeof body.timeZone !== "string") {
    return NextResponse.json({ error: "timeZone must be an IANA timezone name." }, { status: 400 });
  }
  if (typeof body.year !== "number" || !Number.isInteger(body.year)) {
    return NextResponse.json({ error: "year must be an integer." }, { status: 400 });
  }
  if (body.today !== undefined && (typeof body.today !== "string" || !body.today)) {
    return NextResponse.json({ error: "today must be a YYYY-MM-DD string." }, { status: 400 });
  }
  try {
    const result = calculateZiweiStacks(
      {
        date: body.date,
        hour: body.hour,
        minute: typeof body.minute === "number" ? body.minute : 0,
        gender: body.gender,
        longitude: typeof body.longitude === "number" ? body.longitude : undefined,
        latitude: typeof body.latitude === "number" ? body.latitude : undefined,
        timeZone: typeof body.timeZone === "string" && body.timeZone.trim() ? body.timeZone.trim() : undefined,
      },
      body.year,
      typeof body.today === "string" ? body.today : undefined
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Palace stacks calculation failed." },
      { status: 400 }
    );
  }
}
