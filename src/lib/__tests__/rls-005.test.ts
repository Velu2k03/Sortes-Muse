import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { readFileSync } from "fs";
import path from "path";
import { pgTestUrl } from "./pg-test-url";

/**
 * Phase B (R1): migration 005 zero-policy RLS, executed against a
 * real Postgres. Runs ONLY when SORTES_TEST_DATABASE_URL_RLS is set,
 * against that dedicated database (never production, never the money
 * or migrations test databases).
 *
 * One-time setup (local Postgres only):
 *   sudo -u postgres psql -c "CREATE ROLE anon LOGIN PASSWORD 'sortes_test_local';"
 *   sudo -u postgres psql -c "CREATE ROLE authenticated LOGIN PASSWORD 'sortes_test_local';"
 *   sudo -u postgres createdb -O sortes_test sortes_pgtest_rls
 * (see docs/STAGING.md). The anon/authenticated roles share the
 * local test password; they are LOGIN roles here so the test can
 * connect as them directly. In real Supabase they are NOLOGIN and
 * PostgREST reaches them via SET ROLE from the authenticator role —
 * the RLS behaviour is identical either way, because RLS is
 * enforced on the current role.
 *
 * The test mirrors Supabase's default grants: after the migrations
 * apply, anon/authenticated hold USAGE on schema public plus
 * SELECT/INSERT/UPDATE/DELETE on the five tables (Supabase grants
 * ALL on all public tables to anon/authenticated by default). With
 * zero policies, RLS must then deny them everything, while the table
 * owner (sortes_test, the role the app connects as locally; the
 * postgres superuser in production) bypasses RLS entirely.
 *
 *   SORTES_TEST_DATABASE_URL_RLS=postgres://sortes_test:sortes_test_local@127.0.0.1:5432/sortes_pgtest_rls npm test -- src/lib/__tests__/rls-005.test.ts
 */
const TEST_URL = pgTestUrl("SORTES_TEST_DATABASE_URL_RLS");
const SKIP = !TEST_URL;

const RLS_TABLES = ["users", "auth_codes", "transactions", "readings", "free_readings"] as const;

type Db = typeof import("@/lib/db");

/** Same database, different role: reuses the host/port/db of TEST_URL. */
function roleUrl(role: string): string {
  return TEST_URL.replace(/:\/\/[^@]+@/, `://${role}:sortes_test_local@`);
}

async function freshDb(): Promise<Db> {
  vi.resetModules();
  (process.env as Record<string, string | undefined>).POSTGRES_URL = TEST_URL;
  delete (process.env as Record<string, string | undefined>).DATABASE_URL;
  return (await import("@/lib/db")) as Db;
}

describe.skipIf(SKIP)("005 zero-policy RLS on real Postgres (staging only)", () => {
  let db: Db;
  let raw: postgres.Sql;
  let anon: postgres.Sql;
  let authed: postgres.Sql;

  beforeAll(async () => {
    raw = postgres(TEST_URL, { prepare: false, max: 1 });
    // Start from an empty schema in THIS test database only.
    await raw.unsafe(
      `DROP TABLE IF EXISTS schema_migrations, users, auth_codes, transactions, readings, reports, free_interpretations, free_readings CASCADE`
    );
    db = await freshDb();
    await db.ensureSchema();
    // Apply 005 (approval-required; never auto-applied by the app).
    const sql005 = readFileSync(
      path.join(process.cwd(), "migrations", "approval-required", "005_rls-remaining-tables.sql"),
      "utf8"
    );
    await raw.unsafe(sql005);
    // Supabase-default grants, so the denial below is RLS doing the
    // work, not a missing grant.
    await raw.unsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await raw.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON users, auth_codes, transactions, readings, free_readings TO anon, authenticated`
    );
    // Seed one victim row per table as the owner (RLS bypass).
    await raw.unsafe(
      `INSERT INTO users (id, email, purchased_credits, password_hash) VALUES ('u_rls', 'rls-victim@example.com', 5, 'hash-secret')`
    );
    await raw.unsafe(
      `INSERT INTO auth_codes (email, code_hash, expires_at, attempts) VALUES ('rls-victim@example.com', 'codehash-secret', NOW() + interval '1 hour', 0)`
    );
    await raw.unsafe(
      `INSERT INTO transactions (id, user_id, email, pack_type, amount, readings) VALUES ('t_rls', 'u_rls', 'rls-victim@example.com', 'pack5 (lemonsqueezy:order-rls)', 3.99, 5)`
    );
    await raw.unsafe(
      `INSERT INTO readings (id, user_id, data) VALUES ('r_rls', 'u_rls', '{"id":"r_rls","question":"secret?"}'::jsonb)`
    );
    await raw.unsafe(`INSERT INTO free_readings (user_id) VALUES ('u_rls')`);
    // Connect as the two Supabase roles. A failure here means the
    // one-time role setup above was never run.
    anon = postgres(roleUrl("anon"), { prepare: false, max: 1 });
    authed = postgres(roleUrl("authenticated"), { prepare: false, max: 1 });
    try {
      await anon`SELECT 1`;
      await authed`SELECT 1`;
    } catch (err) {
      throw new Error(
        "RLS test roles missing: run the one-time setup in this file's header " +
          "(CREATE ROLE anon/authenticated LOGIN, CREATE DATABASE sortes_pgtest_rls). " +
          `Underlying error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, 30_000);

  afterAll(async () => {
    await anon?.end();
    await authed?.end();
    await raw?.end();
  });

  it("RLS is enabled on all five tables with zero policies", async () => {
    const enabled = (await raw`
      SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('users','auth_codes','transactions','readings','free_readings')
        AND relrowsecurity = true
    `) as Array<{ relname: string }>;
    expect(enabled.map((r) => r.relname).sort()).toEqual([...RLS_TABLES].sort());
    const policies = (await raw`
      SELECT count(*)::int AS n FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('users','auth_codes','transactions','readings','free_readings')
    `) as Array<{ n: number }>;
    expect(policies[0].n).toBe(0);
  });

  it("anon SELECT returns 0 rows on each table (victim rows exist)", async () => {
    for (const table of RLS_TABLES) {
      const rows = (await anon.unsafe(
        `SELECT count(*)::int AS n FROM public.${table}`
      )) as Array<{ n: number }>;
      expect(rows[0].n).toBe(0);
    }
    // The victim rows really are there; only anon cannot see them.
    const owner = (await raw`SELECT count(*)::int AS n FROM users`) as Array<{ n: number }>;
    expect(owner[0].n).toBe(1);
  });

  it("authenticated SELECT returns 0 rows on each table", async () => {
    for (const table of RLS_TABLES) {
      const rows = (await authed.unsafe(
        `SELECT count(*)::int AS n FROM public.${table}`
      )) as Array<{ n: number }>;
      expect(rows[0].n).toBe(0);
    }
  });

  it("anon INSERT fails with a row-level security violation", async () => {
    await expect(
      anon.unsafe(
        `INSERT INTO users (id, email, purchased_credits) VALUES ('u_anon', 'anon@example.com', 0)`
      )
    ).rejects.toThrow(/row-level security/);
    await expect(
      anon.unsafe(
        `INSERT INTO readings (id, user_id, data) VALUES ('r_anon', 'u_rls', '{}'::jsonb)`
      )
    ).rejects.toThrow(/row-level security/);
  });

  it("owner still reads and writes every row (RLS bypass)", async () => {
    const users = (await raw`SELECT email, password_hash FROM users WHERE id = 'u_rls'`) as Array<{
      email: string;
      password_hash: string;
    }>;
    expect(users).toEqual([{ email: "rls-victim@example.com", password_hash: "hash-secret" }]);
    const code = (await raw`SELECT code_hash FROM auth_codes WHERE email = 'rls-victim@example.com'`) as Array<{
      code_hash: string;
    }>;
    expect(code).toEqual([{ code_hash: "codehash-secret" }]);
    await raw.unsafe(
      `INSERT INTO users (id, email, purchased_credits) VALUES ('u_owner', 'owner@example.com', 0)`
    );
    const count = (await raw`SELECT count(*)::int AS n FROM users`) as Array<{ n: number }>;
    expect(count[0].n).toBe(2);
  });

  it("app code paths work against the RLS-enabled DB: sign-up, login, password change, delete", async () => {
    const { hashPassword, verifyPassword } = (await import("@/lib/auth")) as typeof import("@/lib/auth");
    const hash = await hashPassword("correct-horse-battery");
    const created = await db.createUserWithPassword("rls-app@example.com", hash);
    expect(created).not.toBeNull();
    expect(created?.pwd_ver).toBe(1);

    // Login: getUserByEmail + verifyPassword, the route's exact path.
    const found = await db.getUserByEmail("rls-app@example.com");
    expect(found?.id).toBe(created?.id);
    expect(await verifyPassword("correct-horse-battery", found!.password_hash!)).toBe(true);
    expect(await verifyPassword("wrong-password", found!.password_hash!)).toBe(false);

    // Password change bumps the session version (migration 006).
    const version = await db.setUserPassword(created!.id, await hashPassword("new-password-here"));
    expect(version).toBe(2);

    // Free-reading claim through the app, against free_readings.
    expect(await db.markFreeReadingUsed(created!.id)).toBe(true);
    expect(await db.hasUsedFreeReading(created!.id)).toBe(true);

    // Delete removes the user and the RLS tables stay consistent.
    expect(await db.deleteUser(created!.id)).toBe(true);
    expect(await db.getUserById(created!.id)).toBeNull();
  });
});
