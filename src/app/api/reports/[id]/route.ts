import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getReportForUser, deleteReportForUser } from "@/lib/db";

// M4.1: one saved report, signed-in only, scoped to the owning user.
// Guests load reports from device-local storage instead.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const report = await getReportForUser(session.userId, id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json({ report });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const ok = await deleteReportForUser(session.userId, id);
  if (!ok) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
