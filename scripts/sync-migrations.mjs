#!/usr/bin/env node
/**
 * sync-migrations.mjs — Phase 6 migration system.
 *
 * Source of truth: migrations/*.sql (numbered, top level only).
 * Generates src/lib/migrations.generated.ts, which the in-app runner
 * (src/lib/migrations.ts) imports, so the SQL ships inside the
 * Next.js bundle instead of being read from disk at runtime (Vercel
 * file tracing does not reliably include repo-root files).
 *
 * Run after adding or editing a migration, and commit the generated
 * file with it:
 *   node scripts/sync-migrations.mjs
 *
 * src/lib/__tests__/migrations-sync.test.ts fails if the generated
 * file is out of sync with migrations/*.sql.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "migrations");
const out = path.join(root, "src", "lib", "migrations.generated.ts");

const files = readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();

if (files.length === 0) {
  console.error("sync-migrations: no migrations found in migrations/");
  process.exit(1);
}

const escapeTemplate = (s) =>
  s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const entries = files.map((f) => {
  const version = f.split("_")[0];
  const name = f.replace(/^\d+_/, "").replace(/\.sql$/, "");
  const sql = readFileSync(path.join(dir, f), "utf8");
  return { version, name, sql };
});

const header = `// GENERATED — do not edit by hand.
// Source of truth: migrations/*.sql. Regenerate with:
//   node scripts/sync-migrations.mjs
export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
}

export const MIGRATION_FILES: MigrationFile[] = [
`;

const body = entries
  .map(
    (e) =>
      `  { version: ${JSON.stringify(e.version)}, name: ${JSON.stringify(e.name)}, sql: \`${escapeTemplate(e.sql)}\` },`
  )
  .join("\n");

writeFileSync(out, `${header}${body}\n];\n`);
console.log(`sync-migrations: wrote ${entries.length} migration(s) to src/lib/migrations.generated.ts`);
for (const e of entries) console.log(`  ${e.version} ${e.name}`);
