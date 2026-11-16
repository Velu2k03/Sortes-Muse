import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { getUserById, setWinbackOptedOut } from "@/lib/db";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status: number) {
  return new NextResponse(
    `<!doctype html><title>Sortes</title><body style="font-family: Georgia, serif; background: #0f1424; color: #ede6d6; padding: 40px;"><h1>${title}</h1><p>${body}</p></body>`,
    { status, headers: { "Content-Type": "text/html" } }
  );
}

function confirmPage(userId: string, token: string) {
  return new NextResponse(
    `<!doctype html><title>Sortes</title><body style="font-family: Georgia, serif; background: #0f1424; color: #ede6d6; padding: 40px;"><h1>Stop win-back emails?</h1><p>Sortes sends one gentle email if you have been away for a while. Turning it off changes nothing else: your readings, daily card, and account stay exactly as they are, and you can turn it back on from your account page, under Notifications.</p><form method="post" action="/api/unsubscribe"><input type="hidden" name="u" value="${userId}"><input type="hidden" name="t" value="${token}"><button type="submit" style="background: #d4af37; color: #0f1424; border: 0; border-radius: 12px; padding: 14px 28px; font-size: 16px; font-weight: 700; cursor: pointer;">Yes, stop win-back emails</button></form></body>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

/**
 * Batch 5.3: one-click unsubscribe for win-back emails.
 *
 * The token is an HMAC of the user id (see src/lib/unsubscribe.ts).
 * No login is needed: the link arrives in the user's own inbox, and
 * the token cannot be forged without AUTH_SECRET.
 *
 * GET shows a confirmation page and changes nothing, so a
 * link-scanning proxy fetching the URL cannot unsubscribe the user.
 * POST does the opt-out: mail clients honouring the
 * List-Unsubscribe-Post header POST here directly (RFC 8058
 * one-click), and the confirmation form POSTs here too. A bad token
 * gets a 400 and changes nothing.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u") ?? "";
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!verifyUnsubscribeToken(userId, token)) {
    return page(
      "This unsubscribe link is not valid.",
      "It may have been copied wrong. You can also turn win-back emails off from your account page, under Notifications.",
      400
    );
  }
  return confirmPage(userId, token);
}

export async function POST(req: NextRequest) {
  // RFC 8058 one-click: the mail client POSTs to the header URI,
  // which already carries u and t, with only
  // List-Unsubscribe=One-Click in the body. The confirmation form
  // posts u and t as fields instead. Read both, URI first.
  const fromUrl = req.nextUrl.searchParams;
  const form = await req.formData().catch(() => null);
  const userId = fromUrl.get("u") ?? form?.get("u")?.toString() ?? "";
  const token = fromUrl.get("t") ?? form?.get("t")?.toString() ?? "";
  if (!verifyUnsubscribeToken(userId, token)) {
    return page(
      "This unsubscribe link is not valid.",
      "It may have been copied wrong. You can also turn win-back emails off from your account page, under Notifications.",
      400
    );
  }
  const user = await getUserById(userId);
  if (!user) {
    return page(
      "This account no longer exists.",
      "There is nothing left to unsubscribe from.",
      404
    );
  }
  await setWinbackOptedOut(userId, true);
  return page(
    "You are unsubscribed.",
    "You will not receive win-back emails from Sortes again. Your readings, daily card, and account are unchanged, and you can turn these emails back on from your account page, under Notifications.",
    200
  );
}
