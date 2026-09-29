import { NextRequest, NextResponse } from "next/server";
import { getUserById, setUserPassword } from "@/lib/db";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Signed-in users can set a password (or change it with the current one). */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }
    let body: { password?: string; currentPassword?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const password = body.password ?? "";
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (user.password_hash) {
      const ok = await verifyPassword(
        body.currentPassword ?? "",
        user.password_hash
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Current password is not correct." },
          { status: 401 }
        );
      }
    }
    await setUserPassword(user.id, await hashPassword(password));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("set-password failed:", err);
    return NextResponse.json(
      { error: "Could not save the password. Please try again in a moment." },
      { status: 500 }
    );
  }
}
