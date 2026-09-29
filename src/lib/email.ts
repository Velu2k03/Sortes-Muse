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
