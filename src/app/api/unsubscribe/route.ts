import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { getUserById, setWinbackOptedOut } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Batch 5.3: one-click unsubscribe for win-back emails.
 *
 * GET /api/unsubscribe?u=<userId>&t=<token>
 *
 * The token is an HMAC of the user id (see src/lib/unsubscribe.ts).
 * No login is needed: the link arrives in the user's own inbox, and
 * the token cannot be forged without AUTH_SECRET. A bad token gets a
 * 400 and changes nothing.
 *
 * Returns a small HTML confirmation page (this is a link a person
 * clicks from an email, not an API call).
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u") ?? "";
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!verifyUnsubscribeToken(userId, token)) {
    return new NextResponse(
      "<!doctype html><title>Sortes</title><body style=\"font-family: Georgia, serif; background: #0a1526; color: #faf6ec; padding: 40px;\"><h1>This unsubscribe link is not valid.</h1><p>It may have been copied wrong. You can also turn win-back emails off from your account page, under Notifications.</p></body>",
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }
  const user = await getUserById(userId);
  if (!user) {
    return new NextResponse(
      "<!doctype html><title>Sortes</title><body style=\"font-family: Georgia, serif; background: #0a1526; color: #faf6ec; padding: 40px;\"><h1>This account no longer exists.</h1><p>There is nothing left to unsubscribe from.</p></body>",
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }
  await setWinbackOptedOut(userId, true);
  return new NextResponse(
    "<!doctype html><title>Sortes</title><body style=\"font-family: Georgia, serif; background: #0a1526; color: #faf6ec; padding: 40px;\"><h1>You are unsubscribed.</h1><p>You will not receive win-back emails from Sortes again. Your readings, daily card, and account are unchanged, and you can turn these emails back on from your account page, under Notifications.</p></body>",
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
