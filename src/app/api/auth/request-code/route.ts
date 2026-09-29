import { NextRequest, NextResponse } from "next/server";
import { storeAuthCode, getAuthCode } from "@/lib/db";
import { newCode, hashCode, isValidEmail } from "@/lib/auth";
import { sendSignInCode } from "@/lib/email";

export const dynamic = "force-dynamic";

// Light rate limit: 5 code requests per email per hour (best effort, in memory).
const recent = new Map<string, number[]>();

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
  const email = (body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const now = Date.now();
  const stamps = (recent.get(email) ?? []).filter((t) => now - t < 3600_000);
  if (stamps.length >= 5) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }
  recent.set(email, [...stamps, now]);

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
      // Only present in local dev without an email provider configured.
      ...(devCode ? { devCode } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not send the email. Please try again later." },
      { status: 500 }
    );
  }
}
