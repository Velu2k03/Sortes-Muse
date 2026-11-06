import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Phase 6 (P1a): the production fail-fast guard (readiness review N1)
 * and the Supabase pooler URL validation.
 *
 * - In production with no POSTGRES_URL/DATABASE_URL, the first DB call
 *   must throw instead of silently using data/local-db.json.
 * - Outside production the local JSON fallback keeps working.
 * - A Supabase pooler host must use port 6543 (transaction mode) or
 *   5432 (session mode); any other port is a misconfiguration and
 *   must fail loudly at import time, not as a mysterious connection
 *   failure later.
 *
 * These tests re-import the module with a controlled environment
 * (the module reads env at import time), so each case gets a fresh
 * module registry.
 */
async function freshDb(env: Record<string, string | undefined>) {
  vi.resetModules();
  const mutableEnv = process.env as Record<string, string | undefined>;
  for (const key of ["POSTGRES_URL", "DATABASE_URL", "NODE_ENV"]) {
    if (env[key] === undefined) delete mutableEnv[key];
    else mutableEnv[key] = env[key] as string;
  }
  return (await import("@/lib/db")) as typeof import("@/lib/db");
}

afterEach(() => {
  vi.resetModules();
  const mutableEnv = process.env as Record<string, string | undefined>;
  delete mutableEnv.POSTGRES_URL;
  delete mutableEnv.DATABASE_URL;
  mutableEnv.NODE_ENV = "test";
});

describe("production fail-fast guard (N1)", () => {
  it("throws in production with no database URL instead of using local JSON", async () => {
    const db = await freshDb({ NODE_ENV: "production" });
    await expect(db.ensureSchema()).rejects.toThrow(
      /POSTGRES_URL.*required in production/i
    );
  });

  it("keeps the local JSON fallback outside production", async () => {
    const db = await freshDb({ NODE_ENV: "development" });
    await expect(db.ensureSchema()).resolves.toBeUndefined();
  });

  it("keeps the local JSON fallback under vitest (NODE_ENV=test)", async () => {
    const db = await freshDb({ NODE_ENV: "test" });
    await expect(db.ensureSchema()).resolves.toBeUndefined();
  });
});

describe("Supabase pooler URL validation", () => {
  it("accepts a transaction-mode pooler URL (port 6543)", async () => {
    const db = await freshDb({
      NODE_ENV: "test",
      POSTGRES_URL:
        "postgres://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
    });
    expect(db.validatePostgresUrl).toBeDefined();
  });

  it("accepts a session-mode pooler URL (port 5432)", async () => {
    await freshDb({
      NODE_ENV: "test",
      POSTGRES_URL:
        "postgres://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
    });
  });

  it("rejects a pooler URL on any other port at import time", async () => {
    await expect(
      freshDb({
        NODE_ENV: "test",
        POSTGRES_URL:
          "postgres://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:9999/postgres",
      })
    ).rejects.toThrow(/port 6543.*5432|5432.*6543/i);
  });

  it("rejects a pooler URL with no usable port", async () => {
    // A pooler host without an explicit port would silently land on
    // the session-mode default while the code assumes transaction
    // mode settings; require the port to be explicit.
    await expect(
      freshDb({
        NODE_ENV: "test",
        POSTGRES_URL:
          "postgres://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com/postgres",
      })
    ).rejects.toThrow(/port 6543.*5432|5432.*6543/i);
  });

  it("does not validate non-pooler hosts", async () => {
    await freshDb({
      NODE_ENV: "test",
      POSTGRES_URL: "postgres://user:pass@localhost:5433/sortes_staging",
    });
  });

  it("rejects a malformed URL", async () => {
    await expect(
      freshDb({ NODE_ENV: "test", POSTGRES_URL: "not-a-url" })
    ).rejects.toThrow(/not a valid URL/i);
  });

  it("validatePostgresUrl throws directly for a bad pooler port", async () => {
    const db = await freshDb({ NODE_ENV: "test" });
    expect(() =>
      db.validatePostgresUrl(
        "postgres://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:7777/postgres"
      )
    ).toThrow(/6543/);
    expect(() =>
      db.validatePostgresUrl(
        "postgres://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
      )
    ).not.toThrow();
  });
});
