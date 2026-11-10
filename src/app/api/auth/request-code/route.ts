import { NextRequest, NextResponse } from "next/server";
import { storeAuthCode, getAuthCode } from "@/lib/db";
import { newCode, hashCode, isValidEmail, authConfigured } from "@/lib/auth";
import { sendSignInCode } from "@/lib/email";
import { checkRateLimit, emailLimitKey, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("request-code failed:", err);
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again in a moment." },
      { status: 500 }
    );
  }
}

async function handleRequest(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Sign-in is not configured on this server yet. Please try again later." },
      { status: 503 }
      );
    }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // Production without an email provider cannot send a code at all:
  // fail fast before storing a code the user will never receive.
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email sign-in is not configured on this server yet. Please use email + password instead." },
      { status: 503 }
    );
  }

  const now = Date.now();
  // 5 code requests per email per hour (shared limiter; same budget
  // as the old per-route map it replaces).
  if (!(await checkRateLimit(emailLimitKey("code", email), RATE_LIMITS.codeEmail)).allowed) {
    return rateLimitExceeded();
  }

  // If a code was issued in the last 60s, don't regenerate (avoid email floods).
  const existing = await getAuthCode(email);
  if (existing && Date.parse(existing.expires_at) - now > 9 * 60_000) {
    return NextResponse.json({ ok: true, email });
  }

  const code = newCode();
  await storeAuthCode(email, hashCode(code), new Date(now + 10 * 60_000));

  try {
    const { devCode } = await sendSignInCode(email, code);
    return NextResponse.json({
      ok: true,
      email,
      // Only present when the explicit local-only flag
      // SORTES_LOCAL_DEV_CODE=1 is set (see src/lib/email.ts).
      // Never present in production or on Vercel.
      ...(devCode ? { devCode } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not send the email. Please try again later." },
      { status: 500 }
    );
  }
}
