import { describe, it, expect } from "vitest";
import { createAppPostgres, sslFromConnectionString } from "@/lib/db/client";
import { pgTestUrl } from "./pg-test-url";

const base = "postgres://u:p@h:5432/d";

describe("sslFromConnectionString", () => {
  it.each([
    ["?sslmode=disable", false],
    ["?sslmode=require", "require"],
    ["?sslmode=prefer", "prefer"],
    ["?sslmode=allow", "allow"],
    ["?sslmode=verify-ca", "verify-full"],
    ["?sslmode=verify-full", "verify-full"],
    ["?connect_timeout=5&sslmode=require", "require"],
    ["?sslmode=REQUIRE", "require"],
    ["", "prefer"],
    ["?sslmode=bogus", "prefer"],
  ])("%s", (qs, expected) => {
    expect(sslFromConnectionString(base + qs)).toBe(expected);
  });

  it("does not throw on an unparseable string", () => {
    expect(sslFromConnectionString("not a url")).toBe("prefer");
  });
});

const URL_ = pgTestUrl("SORTES_TEST_DATABASE_URL");

describe.skipIf(!URL_)("createAppPostgres sslmode (Postgres)", () => {
  const withMode = (mode: string) =>
    URL_.replace(/[?&]sslmode=[^&]*/i, "") + (URL_.includes("?") ? "&" : "?") + `sslmode=${mode}`;

  it.each(["disable", "require"])("connects with sslmode=%s", async (mode) => {
    const db = createAppPostgres(withMode(mode));
    try {
      const rows = await db`select 1 as one`;
      expect(rows[0].one).toBe(1);
    } finally {
      await db.end({ timeout: 2 });
    }
  });
});
