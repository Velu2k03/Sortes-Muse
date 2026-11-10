import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authConfigured, createSession } from "@/lib/auth";

/**
 * AF-005: the session-signing secret chain. NEXTAUTH_SECRET was a
 * legacy alias nothing is supposed to set (docs/ENVIRONMENT.md:
 * "Not needed — do NOT add"); it must not be able to sign sessions.
 * Item 9: the SUPABASE_JWT_SECRET fallback is deleted; AUTH_SECRET is required.
 */
describe("authConfigured() secret chain (AF-005)", () => {
  const KEYS = ["AUTH_SECRET", "NEXTAUTH_SECRET", "SUPABASE_JWT_SECRET"] as const;
  const saved: Record<string, string | undefined> = {};
  // NODE_ENV is typed read-only; write it through a cast.
  const env = process.env as Record<string, string | undefined>;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // authConfigured() returns true in non-production regardless of
    // secrets, so the chain is only observable as production.
    env.NODE_ENV = "production";
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    if (savedNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = savedNodeEnv;
  });

  it("NEXTAUTH_SECRET alone does not configure auth", () => {
    process.env.NEXTAUTH_SECRET = "legacy-alias-value";
    expect(authConfigured()).toBe(false);
  });

  it("SUPABASE_JWT_SECRET alone does not configure auth (fallback deleted)", () => {
    process.env.SUPABASE_JWT_SECRET = "supabase-jwt-value";
    expect(authConfigured()).toBe(false);
  });

  it("signing a session without AUTH_SECRET throws in production, even with SUPABASE_JWT_SECRET", async () => {
    process.env.SUPABASE_JWT_SECRET = "supabase-jwt-value";
    await expect(createSession("u1", "a@b.co")).rejects.toThrow(/AUTH_SECRET is required/);
  });

  it("AUTH_SECRET alone configures auth", () => {
    process.env.AUTH_SECRET = "dedicated-value";
    expect(authConfigured()).toBe(true);
  });

  it("no secret at all does not configure auth in production", () => {
    expect(authConfigured()).toBe(false);
  });
});
