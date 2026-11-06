import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { MIGRATION_FILES } from "@/lib/migrations.generated";

/**
 * Phase 6 migration system: the generated bundle (what the app
 * actually runs) must match the SQL files in migrations/ (the
 * source of truth). If this test fails, run:
 *   node scripts/sync-migrations.mjs
 * and commit the regenerated file.
 */
describe("migrations.generated.ts matches migrations/*.sql", () => {
  it("lists the same files, in version order, with identical SQL", () => {
    const dir = path.resolve(process.cwd(), "migrations");
    const files = readdirSync(dir)
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    expect(MIGRATION_FILES.map((m) => m.version)).toEqual(
      files.map((f) => f.split("_")[0])
    );
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const expectedName = f.replace(/^\d+_/, "").replace(/\.sql$/, "");
      expect(MIGRATION_FILES[i].name).toBe(expectedName);
      expect(MIGRATION_FILES[i].sql).toBe(readFileSync(path.join(dir, f), "utf8"));
    }
  });

  it("has unique, ascending versions", () => {
    const versions = MIGRATION_FILES.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort());
  });

  it("does not include approval-required files (they are never auto-applied)", () => {
    const names = MIGRATION_FILES.map((m) => m.name);
    expect(names).not.toContain("rls-reports-free-interpretations");
  });
});
