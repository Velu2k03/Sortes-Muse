import type postgres from "postgres";
import { MIGRATION_FILES } from "./migrations.generated";

/**
 * Phase 6: versioned migrations. Replaces the old ensureSchema()
 * CREATE TABLE IF NOT EXISTS approach (db.ts) with numbered SQL
 * files in migrations/ + a schema_migrations ledger.
 *
 * Rules:
 * - Each file applies inside ONE transaction: its SQL plus the
 *   ledger insert commit together or not at all. A crash mid-file
 *   leaves the database exactly as it was.
 * - Files apply in version order, only once. Re-running is a no-op.
 * - Every migration must itself be idempotent (IF NOT EXISTS, the
 *   DO-block pattern for constraints), so a half-applied file from
 *   the old ensureSchema era can never break a re-run.
 * - No ORM. The SQL files are the schema; this file is only the
 *   runner. The generated list (migrations.generated.ts) is synced
 *   from migrations/*.sql by scripts/sync-migrations.mjs.
 * - Production application still needs Velu's explicit approval:
 *   apply with `npm run db:migrate` (scripts/migrate.mjs) against
 *   the target database, or let ensureSchema() apply pending files
 *   on first DB use in a staging/preview environment.
 */
export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";

export interface AppliedMigration {
  version: string;
  name: string;
}

/** Apply every pending migration, in order. Returns what was applied. */
export async function runMigrations(
  pg: postgres.Sql
): Promise<AppliedMigration[]> {
  // Dynamic identifiers use the postgres.js sql('name') helper
  // (values always go through template-tag parameters). The CREATE
  // below is a constant string, so unsafe is fine there.
  await pg.unsafe(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  const applied = (await pg`
    SELECT version FROM ${pg(SCHEMA_MIGRATIONS_TABLE)}`) as Array<{
    version: string;
  }>;
  const appliedVersions = new Set(applied.map((r) => r.version));
  const done: AppliedMigration[] = [];
  for (const file of MIGRATION_FILES) {
    if (appliedVersions.has(file.version)) continue;
    await pg.begin(async (tx) => {
      await tx.unsafe(file.sql);
      await tx`
        INSERT INTO ${tx(SCHEMA_MIGRATIONS_TABLE)} (version, name)
        VALUES (${file.version}, ${file.name})`;
    });
    done.push({ version: file.version, name: file.name });
  }
  return done;
}

/** Versions recorded as applied, in order. */
export async function listAppliedMigrations(
  pg: postgres.Sql
): Promise<AppliedMigration[]> {
  const rows = (await pg`
    SELECT version, name FROM ${pg(SCHEMA_MIGRATIONS_TABLE)}
    ORDER BY version ASC`) as AppliedMigration[];
  return rows;
}
