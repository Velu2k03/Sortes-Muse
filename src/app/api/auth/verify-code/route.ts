import { NextRequest, NextResponse } from "next/server";
import {
  getAuthCode,
  deleteAuthCode,
  bumpAuthCodeAttempts,
  getUserByEmail,
  createUser,
} from "@/lib/db";
import {
  hashCode,
  codesMatch,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }

  const record = await getAuthCode(email);
  if (!record) {
    return NextResponse.json(
      { error: "No code was requested for this email. Please request a new one." },
      { status: 400 }
    );
  }
  if (record.attempts >= 5) {
    await deleteAuthCode(email);
    return NextResponse.json(
      { error: "Too many attempts. Please request a new code." },
      { status: 429 }
    );
  }
  if (Date.parse(record.expires_at) < Date.now()) {
    await deleteAuthCode(email);
    return NextResponse.json(
      { error: "That code expired. Please request a new one." },
      { status: 400 }
    );
  }
  if (!codesMatch(hashCode(code), record.code_hash)) {
    await bumpAuthCodeAttempts(email);
    return NextResponse.json({ error: "That code is not correct. Try again." }, { status: 400 });
  }

  await deleteAuthCode(email);
  const user = (await getUserByEmail(email)) ?? (await createUser(email));
  const token = await createSession(user.id, user.email);

  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, credits: user.credits },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
