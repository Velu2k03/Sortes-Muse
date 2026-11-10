import { NextRequest, NextResponse } from "next/server";
import { calculateChart, calculateZiwei } from "@/lib/charts";
import { calculateVedic } from "@/lib/vedic";
import { checkRateLimit, clientIp, ipLimitKey, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

// Calculation only: no AI, no credit charge, no storage, no database.
// Birth data in the request is used in-memory for this calculation only
// and is never persisted or sent to any AI model.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Phase 6: shared limiter (was a per-route map: 20/hr/IP).
  if (!(await checkRateLimit(ipLimitKey("chart-calc", clientIp(req)), RATE_LIMITS.chartCalcIp)).allowed) {
    return rateLimitExceeded();
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const system = body.system;
  const date = body.date;
  const gender = body.gender ?? "female";
  if (system !== "ziwei" && system !== "western" && system !== "vedic") {
    return NextResponse.json({ error: "system must be ziwei, western, or vedic." }, { status: 400 });
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  if (gender !== "male" && gender !== "female") {
    return NextResponse.json({ error: "gender must be male or female." }, { status: 400 });
  }
  const unknownTime = body.unknownTime === true;
  const hour = unknownTime ? null : typeof body.hour === "number" ? body.hour : null;
  if (!unknownTime && (hour === null || hour < 0 || hour > 23 || !Number.isInteger(hour))) {
    return NextResponse.json({ error: "hour must be 0-23, or unknownTime true." }, { status: 400 });
  }
  const minute = typeof body.minute === "number" && body.minute >= 0 && body.minute <= 59 ? Math.floor(body.minute) : 0;
  const latitude = typeof body.latitude === "number" ? body.latitude : NaN;
  const longitude = typeof body.longitude === "number" ? body.longitude : NaN;
  // Phase 4B (4.3): optional IANA timezone override, so a user who
  // sees the wrong zone on their chart can correct it. An invalid
  // name is refused by the lib (400 below), never guessed. Empty
  // means auto-detect from the coordinates.
  const timeZone = typeof body.timeZone === "string" && body.timeZone.trim() ? body.timeZone.trim() : undefined;
  if (system !== "ziwei" && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    return NextResponse.json({ error: "latitude and longitude are required for Western and Vedic charts." }, { status: 400 });
  }
  try {
    if (system === "vedic") {
      const result = calculateVedic({
        date,
        hour,
        minute,
        latitude: Number(latitude),
        longitude: Number(longitude),
        timeZone,
      });
      return NextResponse.json({ result });
    }
    if (system === "ziwei") {
      // Latitude is passed only when supplied: the old route default
      // of 0 would look a zone up at the equator for the birthplace
      // longitude, which is a wrong zone, not a missing one. Without
      // a latitude the lib keeps the longitude-only correction.
      const result = calculateZiwei({
        date,
        hour,
        minute,
        gender,
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined,
        timeZone,
      });
      return NextResponse.json({ result });
    }
    const result = calculateChart({
      system,
      date,
      hour,
      minute,
      gender,
      latitude: Number(latitude),
      longitude: Number(longitude),
      timeZone,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not calculate this chart." }, { status: 400 });
  }
}
