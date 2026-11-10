import { SignJWT, jwtVerify } from "jose";
import { createHash, randomInt, timingSafeEqual, scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { getUserById } from "./db";

const COOKIE_NAME = "sortes_session";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  // AUTH_SECRET is required. The old SUPABASE_JWT_SECRET fallback was
  // deleted (item 9): sessions must not be signed with the shared
  // Supabase secret. In production a missing secret fails loudly.
  const s = process.env.AUTH_SECRET;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function codesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Phase B (R5): sessions are revocable. The JWT carries a `pwdVer`
 * claim (the user's session version, column `users.pwd_ver`,
 * migration 006). Callers that sign a user in pass the user's
 * current version; a fresh account is version 1, which is also the
 * column DEFAULT and the value assumed for legacy tokens issued
 * before this change (they carry no claim). Changing the password
 * bumps the column (setUserPassword), so every token issued before
 * the change fails the check in getSession below.
 */
export async function createSession(userId: string, email: string, pwdVer = 1): Promise<string> {
  return new SignJWT({ sub: userId, email, pwdVer })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function getSession(): Promise<{ userId: string; email: string } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  let payload: { sub?: unknown; email?: unknown; pwdVer?: unknown };
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    // Bad signature, expired token, wrong secret: a dead session.
    return null;
  }
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    return null;
  }
  // Session-version check: a token whose pwdVer does not match the
  // user's current version is dead (password changed since it was
  // issued). A missing claim reads as 1 (legacy token); a missing
  // column value reads as 1 (row written before migration 006).
  // A database error here is NOT an auth failure: it propagates so
  // the caller returns an honest 500 instead of silently reporting
  // the user as signed out.
  const tokenVer = typeof payload.pwdVer === "number" ? payload.pwdVer : 1;
  const user = await getUserById(payload.sub);
  if (!user) return null;
  if (tokenVer !== (user.pwd_ver ?? 1)) return null;
  return { userId: payload.sub, email: payload.email };
}

/** True when a session can actually be signed. In production this
 * requires AUTH_SECRET; without it, createSession throws, so auth
 * routes must fail fast BEFORE creating a user or deleting a code,
 * instead of creating an account and then returning a 500 with no
 * session (which made retry look like a 409 duplicate). */
export function authConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET ||
      process.env.NODE_ENV !== "production"
  );
}

export const SESSION_COOKIE = COOKIE_NAME;

// Guest first-free Quick Insight: a server-signed, HttpOnly cookie records
// that the free use was consumed. Nothing the client sends is trusted.
// shortcut: clearing cookies resets it, so a guest can repeat the free
// Quick Insight; upgrade to a DB-backed device/IP record if that is abused.
export const GUEST_FREE_COOKIE = "sortes_guest_free";

export async function guestFreeUsed(): Promise<boolean> {
  const token = (await cookies()).get(GUEST_FREE_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.purpose === "guest-free";
  } catch {
    return false;
  }
}

export async function setGuestFreeUsed(res: { cookies: { set: (name: string, value: string, opts: object) => unknown } }) {
  const token = await new SignJWT({ purpose: "guest-free" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(secret());
  res.cookies.set(GUEST_FREE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

const scryptAsync = promisify(scrypt);

/** scrypt password hash, stored as `saltHex:derivedHex`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}
