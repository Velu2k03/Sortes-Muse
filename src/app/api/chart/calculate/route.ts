import { NextRequest, NextResponse } from "next/server";
import { calculateChart } from "@/lib/charts";
import { calculateVedic } from "@/lib/vedic";

// Calculation only: no AI, no credit charge, no storage, no database.
// Birth data in the request is used in-memory for this calculation only
// and is never persisted or sent to any AI model.
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

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many charts right now. Please try again later." }, { status: 429 });
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
      });
      return NextResponse.json({ result });
    }
    const result = calculateChart({
      system,
      date,
      hour,
      minute,
      gender,
      latitude: Number.isFinite(latitude) ? latitude : 0,
      longitude: Number.isFinite(longitude) ? longitude : 0,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not calculate this chart." }, { status: 400 });
  }
}
