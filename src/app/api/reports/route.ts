import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  listReportsForUser,
  saveReportForUser,
} from "@/lib/db";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

// M4.1: keep-forever reports, signed-in storage. Guests never call
// this route; they keep reports in device-local storage. Saving is
// idempotent (same id twice stores once), so a failed save can be
// retried after generation without another charge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["transit", "year-ahead", "comparison"];

function validReport(r: unknown): r is { id: string; [k: string]: unknown } {
  if (!r || typeof r !== "object" || Array.isArray(r)) return false;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return false;
  if (typeof o.type !== "string" || !TYPES.includes(o.type)) return false;
  if (typeof o.title !== "string" || !o.title) return false;
  if (typeof o.targetLabel !== "string") return false;
  if (typeof o.createdAt !== "string" || !o.createdAt) return false;
  if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) return false;
  if ((o.data as Record<string, unknown>).kind !== o.type) return false;
  if (typeof o.interpretation !== "string" || !o.interpretation.trim()) return false;
  if (o.interpretation.length > 20000) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Phase 6 (N3): report reads were unrated.
  if (!checkRateLimit(`reports-read:${clientIp(req)}`, RATE_LIMITS.readIp).allowed) {
    return rateLimitExceeded();
  }
  const reports = await listReportsForUser(session.userId);
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Phase 6 (N3): report saves were unrated.
  if (!checkRateLimit(`reports-save:${clientIp(req)}`, RATE_LIMITS.readIp).allowed) {
    return rateLimitExceeded();
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const report = body.report;
  if (!validReport(report)) {
    return NextResponse.json({ error: "report is incomplete or malformed." }, { status: 400 });
  }
  await saveReportForUser(session.userId, report);
  return NextResponse.json({ saved: true, id: report.id });
}
