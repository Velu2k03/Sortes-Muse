import { describe, it, expect } from "vitest";
import { buildVerifySql } from "../../../scripts/restore-verify.mjs";

/**
 * Batch N3 (A4/B6): the restore verify query must never name a table
 * that does not exist in the restored dump. Postgres resolves table
 * names at parse time, so a to_regclass guard in a WHERE clause does
 * not save a statement that mentions the table anywhere else — the
 * old query failed with "relation credit_grants does not exist" on
 * every pre-008 dump, after the data was already restored.
 */
describe("restore verify SQL builder", () => {
  it("omits credit_grants and subscriptions on a pre-008 dump", () => {
    const sql = buildVerifySql({
      hasCreditGrants: false,
      hasSubscriptions: false,
    });
    expect(sql).not.toContain("credit_grants");
    expect(sql).not.toContain("subscriptions");
    expect(sql).toContain("FROM users");
    expect(sql).toContain("FROM schema_migrations");
  });

  it("includes credit_grants but not subscriptions on an 008-only dump", () => {
    const sql = buildVerifySql({
      hasCreditGrants: true,
      hasSubscriptions: false,
    });
    expect(sql).toContain("SELECT 'credit_grants', count(*) FROM credit_grants");
    expect(sql).not.toContain("subscriptions");
  });

  it("includes both optional tables on a post-009 dump", () => {
    const sql = buildVerifySql({
      hasCreditGrants: true,
      hasSubscriptions: true,
    });
    expect(sql).toContain("SELECT 'credit_grants', count(*) FROM credit_grants");
    expect(sql).toContain("SELECT 'subscriptions', count(*) FROM subscriptions");
  });

  it("omits schema_migrations on a pre-ledger dump", () => {
    // Claude review, PR #93: schema_migrations itself predates nothing
    // in practice, but a dump from before the migration system existed
    // would hit the same parse-time failure, so it is probed too.
    const sql = buildVerifySql({
      hasCreditGrants: false,
      hasSubscriptions: false,
      hasSchemaMigrations: false,
    });
    expect(sql).not.toContain("schema_migrations");
    expect(sql).toContain("FROM users");
  });

  it("never references a table only inside a subquery guard", () => {
    // The old bug: the table name appeared inside a SELECT guarded by
    // to_regclass in the WHERE clause. A guarded mention is still a
    // parse-time reference, so the built query must contain no
    // to_regclass at all — absence is decided by the caller.
    const sql = buildVerifySql({
      hasCreditGrants: false,
      hasSubscriptions: false,
    });
    expect(sql).not.toContain("to_regclass");
  });
});
