import { NextResponse } from "next/server";
import { setGuestFreeUsed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Batch 2b (SSE): the reading route streams, so its Response headers
 * are sent before the generation finishes and it can no longer set
 * the guest-free cookie after a successful generation. The client
 * calls this endpoint after receiving the `done` event for a guest
 * free reading, so the cookie is still only set after a real
 * generation (never before, so a failed generation never burns the
 * free reading). Setting this cookie without generating only harms
 * the caller (it blocks their own free reading), so there is no
 * abuse incentive and the endpoint takes no body and no auth.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  await setGuestFreeUsed(res);
  return res;
}
