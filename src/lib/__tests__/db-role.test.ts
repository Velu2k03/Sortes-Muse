import { describe, it, expect } from "vitest";
import { assertAppDbRole } from "@/lib/db";

// Phase G (F11): the RLS role startup assertion. The app connects to
// Postgres as the owner (postgres) role, which bypasses RLS; the
// anon and authenticated roles are denied by the zero-policy RLS
// migrations (004, 005). If POSTGRES_URL ever pointed at one of those
// roles, the app would silently see zero rows on every table. The
// assertion below is the fail-fast guard: ensureSchema() calls it on
// the live connection role at first database use. These unit tests
// pin the rule itself; the real-Postgres suite (db-postgres.test.ts)
// proves the live test-database role passes it.
//
// Phase G follow-up: the rule is an ALLOWLIST, not a denylist. Only
// the roles the project is known to connect as may run the app:
// postgres (direct owner), sortes_test (local test role), and
// postgres.<ref> (the Supabase pooler user form). Any other role,
// including a hypothetical dedicated app role such as sortes_app,
// throws: a silent role change can no longer pass, and a future
// dedicated role must be added to the list explicitly. A live probe
// (SELECT from a table) was considered and rejected: an empty table
// returns zero rows legitimately, so a probe cannot distinguish RLS
// denial from an empty table.

describe("assertAppDbRole (F11)", () => {
  it("throws for the anon role", () => {
    expect(() => assertAppDbRole("anon")).toThrow(/must not run the app/);
  });

  it("throws for the authenticated role", () => {
    expect(() => assertAppDbRole("authenticated")).toThrow(/must not run the app/);
  });

  it("throws regardless of case", () => {
    expect(() => assertAppDbRole("ANON")).toThrow();
    expect(() => assertAppDbRole("Authenticated")).toThrow();
  });

  it("throws for an empty or missing role (fail closed)", () => {
    expect(() => assertAppDbRole("")).toThrow();
  });

  it("accepts the owner and test roles", () => {
    expect(() => assertAppDbRole("postgres")).not.toThrow();
    expect(() => assertAppDbRole("sortes_test")).not.toThrow();
  });

  it("accepts the Supabase pooler user form postgres.<ref>", () => {
    expect(() => assertAppDbRole("postgres.abcdefghijklmnop")).not.toThrow();
  });

  it("accepts allowlisted roles regardless of case and surrounding space", () => {
    expect(() => assertAppDbRole("Postgres")).not.toThrow();
    expect(() => assertAppDbRole("POSTGRES.abcdefghijklmnop")).not.toThrow();
    expect(() => assertAppDbRole("  sortes_test  ")).not.toThrow();
  });

  it("throws for any other role, including a hypothetical dedicated app role", () => {
    expect(() => assertAppDbRole("sortes_app")).toThrow(/must not run the app/);
    expect(() => assertAppDbRole("app_user")).toThrow(/must not run the app/);
  });

  it("throws for a malformed pooler form with an empty ref", () => {
    expect(() => assertAppDbRole("postgres.")).toThrow();
  });
});
