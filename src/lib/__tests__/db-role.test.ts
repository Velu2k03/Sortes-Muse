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
    expect(() => assertAppDbRole("app_user")).not.toThrow();
  });
});
