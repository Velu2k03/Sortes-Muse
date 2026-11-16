import { createHmac, timingSafeEqual } from "crypto";

/**
 * Batch 5.3: the signed one-click unsubscribe for win-back emails.
 *
 * The win-back email is marketing mail, so it needs a working opt-out.
 * The link is `/api/unsubscribe?u=<userId>&t=<token>` where the token is
 * an HMAC-SHA256 of the user id, keyed by AUTH_SECRET. No login is
 * needed to unsubscribe (the link arrives in the user's own inbox),
 * and the token cannot be forged without the secret.
 *
 * The same URL is sent as the List-Unsubscribe header (RFC 8058), so
 * mail clients can offer a one-click unsubscribe.
 */

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required to sign an unsubscribe link.");
  return s;
}

export function signUnsubscribeToken(userId: string): string {
  return createHmac("sha256", getSecret())
    .update(`winback-unsubscribe:${userId}`)
    .digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expected = Buffer.from(signUnsubscribeToken(userId));
  const provided = Buffer.from(token);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function unsubscribeUrl(userId: string): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://sortes.resonantatlas.com";
  const token = signUnsubscribeToken(userId);
  return `${site}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}
