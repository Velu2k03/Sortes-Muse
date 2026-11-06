import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveReadingForUser, updateReadingForUser, listReadingsForUser, deleteReadingForUser } from "@/lib/db";
import { checkRateLimit, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

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
  // Phase 6 (N3): guest journal sync was unrated — up to 100 readings
  // per call, unbounded calls, unbounded JSON size. 20/hour per user.
  // (Per-reading size is still unbounded; the 100-item cap stays.)
  if (!checkRateLimit(`history:${session.userId}`, RATE_LIMITS.historySyncUser).allowed) {
    return rateLimitExceeded();
  }
  let body: { readings?: Array<{ id: string; [k: string]: unknown }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const readings = Array.isArray(body.readings) ? body.readings.slice(0, 100) : [];
  // Phase B (R9): per-reading byte cap. The 100-item cap bounds the
  // count, but each reading body was unbounded in size; a single
  // multi-megabyte reading JSON would be stored as-is. 64 KB per
  // reading is far above any real reading (interpretations are a few
  // KB) and keeps one sync call bounded.
  for (const r of readings) {
    if (r && typeof r.id === "string" && Buffer.byteLength(JSON.stringify(r), "utf8") > 64 * 1024) {
      return NextResponse.json(
        { error: "Reading too large (max 64 KB per reading)." },
        { status: 413 }
      );
    }
  }
  for (const r of readings) {
    if (r && typeof r.id === "string") {
      await saveReadingForUser(session.userId, r);
    }
  }
  return NextResponse.json({ ok: true, synced: readings.length });
}

// M1.1: patch editable fields of an existing reading. The old POST
// path never updated server copies, so edits need their own route.
// M2.2 adds the 7-day revisit note alongside the chosen next step.
// Only the keys present in the body are patched; at least one must
// be present and valid. followUps are never patched here: the
// follow-up route already updates the server copy itself.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Phase B (R9): journal writes are rate-limited per user (shared
  // PATCH/DELETE bucket, 20/hour). Previously these authenticated
  // writes had no limit at all.
  if (!checkRateLimit(`history-write:${session.userId}`, RATE_LIMITS.historyWriteUser).allowed) {
    return rateLimitExceeded();
  }
  let body: { id?: unknown; nextStep?: unknown; revisitNote?: unknown; revisitAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Missing reading id." }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.nextStep !== undefined) {
    if (typeof body.nextStep !== "string" || body.nextStep.trim().length < 1 || body.nextStep.length > 300) {
      return NextResponse.json({ error: "Next step must be 1 to 300 characters." }, { status: 400 });
    }
    patch.nextStep = body.nextStep.trim();
  }
  if (body.revisitNote !== undefined) {
    if (typeof body.revisitNote !== "string" || body.revisitNote.trim().length < 1 || body.revisitNote.length > 1000) {
      return NextResponse.json({ error: "Revisit note must be 1 to 1000 characters." }, { status: 400 });
    }
    patch.revisitNote = body.revisitNote.trim();
    if (typeof body.revisitAt === "string" && body.revisitAt.length < 100) {
      patch.revisitAt = body.revisitAt;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const ok = await updateReadingForUser(session.userId, body.id, patch);
  if (!ok) return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// M2.2: delete a stored reading. Scoped to the owning user, so one
// user can never delete another user's reading by id.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Phase B (R9): same shared per-user write bucket as PATCH.
  if (!checkRateLimit(`history-write:${session.userId}`, RATE_LIMITS.historyWriteUser).allowed) {
    return rateLimitExceeded();
  }
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Missing reading id." }, { status: 400 });
  }
  const ok = await deleteReadingForUser(session.userId, body.id);
  if (!ok) return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
