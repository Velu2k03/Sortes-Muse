import { NextResponse } from "next/server";
import { MIGRATION_FILES } from "@/lib/migrations.generated";
import { sql } from "@/lib/db/client";

/**
 * Notes N2 (B1c): public migration-health endpoint. Runs
 * SELECT max(version) FROM schema_migrations and compares it to
 * the migration files the code ships (MIGRATION_FILES). An uptime
 * monitor points at this route so the next apply/merge drift is
 * caught in minutes, not when someone tries to sign up (the 009
 * incident: code needing 009 deployed against a DB without it).
 *
 * No auth: an uptime monitor must be able to hit it. Nothing
 * sensitive is returned — only migration versions and counts,
 * no PII, no secrets. A database that cannot be reached is a 503
 * (not a 500 crash): the service is unhealthy until the DB is.
 */

// Never prerendered at build time: the answer depends on the live
// database, and a build-time probe would cache a stale verdict.
export const dynamic = "force-dynamic";

/** Pure comparison, exported for tests. */
export function migrationHealth(appliedVersions: string[]): {
  ok: boolean;
  /** Highest applied version, or null when the ledger is empty. */
  applied: string | null;
  expected: number;
  latest: string;
  missing: string[];
} {
  const expectedVersions = MIGRATION_FILES.map((f) => f.version);
  const appliedSet = new Set(appliedVersions);
  const missing = expectedVersions.filter((v) => !appliedSet.has(v));
  const applied = appliedVersions.length > 0 ? [...appliedVersions].sort().at(-1) ?? null : null;
  return {
    ok: missing.length === 0,
    applied,
    expected: expectedVersions.length,
    latest: expectedVersions.at(-1) ?? "",
    missing,
  };
}

export async function GET() {
  try {
    const { rows } = await sql`SELECT version FROM schema_migrations`;
    const health = migrationHealth(
      (rows as Array<{ version: string }>).map((r) => r.version)
    );
    if (!health.ok) {
      return NextResponse.json(health, { status: 503 });
    }
    return NextResponse.json(health);
  } catch {
    // Unreachable DB (or no DB configured): unhealthy, not a crash.
    return NextResponse.json(
      {
        ok: false,
        applied: null,
        expected: MIGRATION_FILES.length,
        latest: MIGRATION_FILES.at(-1)?.version ?? "",
        missing: MIGRATION_FILES.map((f) => f.version),
        error: "Database unreachable",
      },
      { status: 503 }
    );
  }
}
