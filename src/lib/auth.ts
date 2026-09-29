import { SignJWT, jwtVerify } from "jose";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "sortes_session";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required in production.");
    }
    return new TextEncoder().encode("dev-only-secret-do-not-use-in-prod");
  }
  return new TextEncoder().encode(s);
}

export function newCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function codesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function createSession(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function getSession(): Promise<{ userId: string; email: string } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
