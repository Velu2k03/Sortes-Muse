import { NextRequest, NextResponse } from "next/server";
import { getWinbackCandidates, markWinbackSent } from "@/lib/db";
import { sendWinbackEmail } from "@/lib/email";

/**
 * Daily win-back cron: one gentle "the cards miss you" email to users who
 * have been quiet for 7+ days and were not nudged in the last 60 days.
 *
 * Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`.
 * Configure in vercel.json and set CRON_SECRET in env vars.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await getWinbackCandidates(50);
  let sent = 0;
  const failed: string[] = [];
  for (const u of candidates) {
    try {
      await sendWinbackEmail(u.email);
      await markWinbackSent(u.id);
      sent++;
    } catch (e) {
      failed.push(u.email);
      console.error("[winback] failed for", u.email, e);
    }
  }
  return NextResponse.json({
    candidates: candidates.length,
    sent,
    failed: failed.length,
  });
}
