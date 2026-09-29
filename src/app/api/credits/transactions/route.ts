import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listTransactions } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const transactions = await listTransactions(session.userId);
  return NextResponse.json({ transactions });
}
