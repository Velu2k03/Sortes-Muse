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
    URL_.replace(/[?&]sslmode=[^&]*/i, "").replace(/[?&]$/, "") +
    (URL_.replace(/[?&]sslmode=[^&]*/i, "").includes("?") ? "&" : "?") +
    `sslmode=${mode}`;

  async function run(mode: string) {
    const db = createAppPostgres(withMode(mode));
    try {
      const [r] = await db`select 1 as one, coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as ssl`;
      return r as { one: number; ssl: boolean };
    } finally {
      await db.end({ timeout: 2 });
    }
  }

  it("connects in plain text with sslmode=disable", async () => {
    const r = await run("disable");
    expect(r.one).toBe(1);
    expect(r.ssl).toBe(false);
  });

  it("sslmode=prefer connects whether or not the server has SSL", async () => {
    expect((await run("prefer")).one).toBe(1);
  });

  it("sslmode=require is honoured: TLS if the server has SSL, SSL_NOT_SUPPORTED if not", async () => {
    // Local Ubuntu Postgres has SSL on; CI's postgres:16 image has it off.
    // Either way require must be strict (no silent plain fallback).
    const serverHasSsl = (await run("prefer")).ssl;
    if (serverHasSsl) {
      const r = await run("require");
      expect(r.one).toBe(1);
      expect(r.ssl).toBe(true);
    } else {
      await expect(run("require")).rejects.toThrow(/SSL_NOT_SUPPORTED/);
    }
  });
});
