import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveReadingForUser, listReadingsForUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ readings: [] });
  const readings = await listReadingsForUser(session.userId);
  return NextResponse.json({ readings });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { readings?: Array<{ id: string; [k: string]: unknown }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const readings = Array.isArray(body.readings) ? body.readings.slice(0, 100) : [];
  for (const r of readings) {
    if (r && typeof r.id === "string") {
      await saveReadingForUser(session.userId, r);
    }
  }
  return NextResponse.json({ ok: true, synced: readings.length });
}
