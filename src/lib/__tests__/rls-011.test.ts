import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import { readFileSync } from "fs";
import path from "path";
import { pgTestUrl } from "./pg-test-url";

/**
 * Notes batch N4 (A9): migration 011 zero-policy RLS on credit_grants
 * and subscriptions, executed against a real Postgres. Runs ONLY when
 * SORTES_TEST_DATABASE_URL_RLS2 is set, against that dedicated
 * database (never production, never the money, migrations, or RLS-005
 * test databases). It uses its OWN database (sortes_pgtest_rls2)
 * because rls-005.test.ts shares sortes_pgtest_rls and both files
 * drop + rebuild in beforeAll; two files on one DB race on
 * concurrent DDL (observed: duplicate key on pg_type_typname_nsp_index).
 *
 * One-time setup (local Postgres only): same roles as rls-005.test.ts —
 * roles anon/authenticated LOGIN with the local test password, and
 * database sortes_pgtest_rls2 owned by sortes_test (see
 * docs/STAGING.md). The anon/authenticated roles share the local
 * test password; they are LOGIN roles here so the test can connect
 * as them directly. In real Supabase they are NOLOGIN and PostgREST
 * reaches them via SET ROLE from the authenticator role — the RLS
 * behaviour is identical either way, because RLS is enforced on the
 * current role.
 *
 * The test mirrors Supabase's default grants: after the migrations
 * apply, anon/authenticated hold USAGE on schema public plus
 * SELECT/INSERT/UPDATE/DELETE on the two tables (Supabase grants
 * ALL on all public tables to anon/authenticated by default). With
 * zero policies, RLS must then deny them everything, while the table
 * owner (sortes_test, the role the app connects as locally; the
 * postgres superuser in production) bypasses RLS entirely.
 *
 *   SORTES_TEST_DATABASE_URL_RLS2=<redacted>
 */
const TEST_URL = pgTestUrl("SORTES_TEST_DATABASE_URL_RLS2");
const SKIP = !TEST_URL;

const RLS_TABLES = ["credit_grants", "subscriptions"] as const;

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

describe.skipIf(SKIP)("011 zero-policy RLS on real Postgres (staging only)", () => {
  let db: Db;
  let raw: postgres.Sql;
  let anon: postgres.Sql;
  let authed: postgres.Sql;

  beforeAll(async () => {
    raw = postgres(TEST_URL, { prepare: false, max: 1 });
    // Start from an empty schema in THIS test database only.
    await raw.unsafe(
      `DROP TABLE IF EXISTS schema_migrations, users, auth_codes, transactions, readings, reports, free_interpretations, free_readings, credit_grants, subscriptions CASCADE`
    );
    db = await freshDb();
    await db.ensureSchema();
    // Apply 011 explicitly (a no-op re-run if ensureSchema already
    // applied it — ENABLE ROW LEVEL SECURITY is idempotent), so the
    // file itself is proven, not just the runner.
    const sql011 = readFileSync(
      path.join(process.cwd(), "migrations", "011_rls-credit-grants-subscriptions.sql"),
      "utf8"
    );
    await raw.unsafe(sql011);
    // Supabase-default grants, so the denial below is RLS doing the
    // work, not a missing grant.
    await raw.unsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated`);
    await raw.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON credit_grants, subscriptions TO anon, authenticated`
    );
    // Seed one victim user + one row per table as the owner (RLS bypass).
    await raw.unsafe(
      `INSERT INTO users (id, email, purchased_credits, password_hash) VALUES ('u_rls011', 'rls011-victim@example.com', 5, 'hash-secret')`
    );
    await raw.unsafe(
      `INSERT INTO credit_grants (id, user_id, kind, amount) VALUES ('cg_rls011', 'u_rls011', 'purchased', 300)`
    );
    await raw.unsafe(
      `INSERT INTO subscriptions (id, user_id, lemonsqueezy_subscription_id, tier, billing_interval, status) VALUES ('s_rls011', 'u_rls011', 'ls-sub-rls011', 'spark', 'monthly', 'active')`
    );
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
          "(CREATE ROLE anon/authenticated LOGIN, CREATE DATABASE sortes_pgtest_rls2). " +
          `Underlying error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, 30_000);

  afterAll(async () => {
    await anon?.end();
    await authed?.end();
    await raw?.end();
  });

  it("RLS is enabled on both tables with zero policies", async () => {
    const enabled = (await raw`
      SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('credit_grants','subscriptions')
        AND relrowsecurity = true
    `) as Array<{ relname: string }>;
    expect(enabled.map((r) => r.relname).sort()).toEqual([...RLS_TABLES].sort());
    const policies = (await raw`
      SELECT count(*)::int AS n FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('credit_grants','subscriptions')
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
    const owner = (await raw`SELECT count(*)::int AS n FROM credit_grants`) as Array<{
      n: number;
    }>;
    expect(owner[0].n).toBe(1);
    const subs = (await raw`SELECT count(*)::int AS n FROM subscriptions`) as Array<{
      n: number;
    }>;
    expect(subs[0].n).toBe(1);
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
        `INSERT INTO credit_grants (id, user_id, kind, amount) VALUES ('cg_anon', 'u_rls011', 'purchased', 100)`
      )
    ).rejects.toThrow(/row-level security/);
    await expect(
      anon.unsafe(
        `INSERT INTO subscriptions (id, user_id, lemonsqueezy_subscription_id, tier, billing_interval, status) VALUES ('s_anon', 'u_rls011', 'ls-sub-anon', 'spark', 'monthly', 'active')`
      )
    ).rejects.toThrow(/row-level security/);
  });

  it("anon UPDATE/DELETE affect 0 rows (zero policies, no error)", async () => {
    // With zero policies, UPDATE/DELETE do not throw; they match 0
    // rows. Verify by reading the rows back as the owner: the
    // amount is unchanged and the subscription row is still there.
    await anon.unsafe(
      `UPDATE public.credit_grants SET amount = 999 WHERE id = 'cg_rls011'`
    );
    await anon.unsafe(`DELETE FROM public.subscriptions WHERE id = 's_rls011'`);
    const grants = (await raw`SELECT amount FROM credit_grants WHERE id = 'cg_rls011'`) as Array<{
      amount: number;
    }>;
    expect(grants).toEqual([{ amount: 300 }]);
    const subs = (await raw`SELECT count(*)::int AS n FROM subscriptions WHERE id = 's_rls011'`) as Array<{
      n: number;
    }>;
    expect(subs[0].n).toBe(1);
  });

  it("owner still reads and writes every row (RLS bypass)", async () => {
    const grants = (await raw`SELECT kind, amount FROM credit_grants WHERE id = 'cg_rls011'`) as Array<{
      kind: string;
      amount: number;
    }>;
    expect(grants).toEqual([{ kind: "purchased", amount: 300 }]);
    const subs = (await raw`SELECT tier, status FROM subscriptions WHERE id = 's_rls011'`) as Array<{
      tier: string;
      status: string;
    }>;
    expect(subs).toEqual([{ tier: "spark", status: "active" }]);
    await raw.unsafe(
      `INSERT INTO credit_grants (id, user_id, kind, amount) VALUES ('cg_owner', 'u_rls011', 'purchased', 100)`
    );
    const count = (await raw`SELECT count(*)::int AS n FROM credit_grants`) as Array<{
      n: number;
    }>;
    expect(count[0].n).toBe(2);
  });

  it("BEFORE: with RLS disabled, anon sees the victim rows (control)", async () => {
    // Proves the denial above is RLS doing the work, not an empty
    // table or a missing grant: disable RLS, anon sees the rows,
    // then re-enable it so the database is left in the migrated state.
    await raw.unsafe(
      `ALTER TABLE public.credit_grants DISABLE ROW LEVEL SECURITY; ALTER TABLE public.subscriptions DISABLE ROW LEVEL SECURITY`
    );
    try {
      const grants = (await anon.unsafe(
        `SELECT count(*)::int AS n FROM public.credit_grants`
      )) as Array<{ n: number }>;
      expect(grants[0].n).toBeGreaterThan(0);
      const subs = (await anon.unsafe(
        `SELECT count(*)::int AS n FROM public.subscriptions`
      )) as Array<{ n: number }>;
      expect(subs[0].n).toBeGreaterThan(0);
    } finally {
      await raw.unsafe(
        `ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY; ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY`
      );
    }
    // RLS is back on: anon is denied again.
    const denied = (await anon.unsafe(
      `SELECT count(*)::int AS n FROM public.credit_grants`
    )) as Array<{ n: number }>;
    expect(denied[0].n).toBe(0);
  });
});
