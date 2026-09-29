/**
 * Sends the sign-in code by email.
 * - Production: set RESEND_API_KEY (https://resend.com) and optionally EMAIL_FROM.
 * - Local dev without a key: the code is logged to the server console AND
 *   returned by the API response, so sign-in works end to end with zero setup.
 */
export async function sendSignInCode(
  email: string,
  code: string
): Promise<{ delivered: boolean; devCode?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[sortes-auth] sign-in code for ${email}: ${code}`);
      return { delivered: false, devCode: code };
    }
    throw new Error("No email provider configured.");
  }

  const from = process.env.EMAIL_FROM ?? "Sortes <noreply@tarot.resonantatlas.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `Your Sortes sign-in code: ${code}`,
      html: `
        <div style="font-family: Georgia, serif; background: #0A0E1A; color: #EDE6D6; padding: 32px; border-radius: 12px;">
          <h1 style="color: #D4AF37;">✦ Sortes</h1>
          <p>Your sign-in code is:</p>
          <p style="font-size: 32px; letter-spacing: 8px; color: #F4D03F;"><strong>${code}</strong></p>
          <p style="color: #9aa3b2; font-size: 14px;">It expires in 10 minutes. If you did not request this, you can ignore this email.</p>
        </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status}`);
  return { delivered: true };
}

/**
 * Win-back email: one gentle nudge to users quiet for 7+ days.
 * Sent by the daily /api/cron/winback job. Dev without a key: logs only.
 */
export async function sendWinbackEmail(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://tarot.resonantatlas.com";
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[sortes-winback] would email ${email}`);
      return;
    }
    throw new Error("No email provider configured.");
  }

  const from =
    process.env.EMAIL_FROM ?? "Sortes <noreply@tarot.resonantatlas.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "The cards have been waiting for you ✦",
      html: `
        <div style="font-family: Georgia, serif; background: #0A0E1A; color: #EDE6D6; padding: 40px 32px; border-radius: 12px; max-width: 560px;">
          <h1 style="color: #D4AF37; font-size: 28px; margin: 0 0 8px;">✦ Sortes</h1>
          <p style="font-size: 20px; font-style: italic; color: #F4D03F;">The cards have been waiting for you.</p>
          <p style="line-height: 1.7;">It has been a little while since your last visit. Your daily card is ready, free as always, and your journal is keeping every reading you have cast.</p>
          <p style="line-height: 1.7;">Come back for one quiet minute. See what the lots say today.</p>
          <p style="margin: 28px 0;">
            <a href="${site}/daily" style="display: inline-block; background: linear-gradient(135deg, #e8c55a, #d4af37); color: #14100a; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 12px;">Draw today&apos;s card</a>
          </p>
          <p style="color: #9aa3b2; font-size: 13px; line-height: 1.6;">Readings are for reflection and perspective, never guaranteed predictions.<br/>You received this because you created a Sortes account. Reply STOP and we will not write again.</p>
        </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status}`);
}
