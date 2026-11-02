import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveReadingForUser, updateReadingForUser, listReadingsForUser } from "@/lib/db";

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

// M1.1: patch one field of an existing reading (currently only the
// chosen next step). The old POST path never updated server copies,
// so edits need their own route.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { id?: unknown; nextStep?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Missing reading id." }, { status: 400 });
  }
  if (typeof body.nextStep !== "string" || body.nextStep.trim().length < 1 || body.nextStep.length > 300) {
    return NextResponse.json({ error: "Next step must be 1 to 300 characters." }, { status: 400 });
  }
  const ok = await updateReadingForUser(session.userId, body.id, {
    nextStep: body.nextStep.trim(),
  });
  if (!ok) return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
