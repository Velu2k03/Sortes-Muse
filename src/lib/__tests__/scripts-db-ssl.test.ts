import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sslForScriptUrl, pgSslModeForUrl } from "../../../scripts/db-ssl.mjs";

const remote = "postgres://u:p@db.example.com:5432/d";
const local = "postgres://u:p@localhost:5432/d";
const loopback = "postgres://u:p@127.0.0.1:5432/d";

describe("sslForScriptUrl", () => {
  it.each([
    ["?sslmode=disable", false],
    ["?sslmode=require", "require"],
    ["?sslmode=verify-full", "verify-full"],
    ["?sslmode=verify-ca", "verify-full"],
    ["?sslmode=prefer", "prefer"],
    ["?sslmode=allow", "allow"],
  ])("explicit %s wins on remote and localhost", (qs, expected) => {
    expect(sslForScriptUrl(remote + qs)).toBe(expected);
    expect(sslForScriptUrl(local + qs)).toBe(expected);
    expect(sslForScriptUrl(loopback + qs)).toBe(expected);
  });

  it("no sslmode on a remote host fails closed", () => {
    expect(sslForScriptUrl(remote)).toBe("require");
  });

  it("no sslmode on a local host passes no ssl option", () => {
    expect(sslForScriptUrl(local)).toBeUndefined();
    expect(sslForScriptUrl(loopback)).toBeUndefined();
  });

  it("unrecognised sslmode: require remote, undefined local", () => {
    expect(sslForScriptUrl(remote + "?sslmode=bogus")).toBe("require");
    expect(sslForScriptUrl(local + "?sslmode=bogus")).toBeUndefined();
  });

  it("host lookalikes are not local", () => {
    expect(sslForScriptUrl("postgres://u:p@my-localhost.example.com/d")).toBe("require");
    expect(sslForScriptUrl("postgres://u:p@db.example.com/localhost")).toBe("require");
  });

  it("unparseable string fails closed", () => {
    expect(sslForScriptUrl("not a url")).toBe("require");
  });
});

describe("pgSslModeForUrl", () => {
  it.each([
    ["?sslmode=disable", "disable"],
    ["?sslmode=require", "require"],
    ["?sslmode=verify-full", "verify-full"],
    // libpq supports verify-ca natively (unlike sslForScriptUrl).
    ["?sslmode=verify-ca", "verify-ca"],
    ["?sslmode=prefer", "prefer"],
    ["?sslmode=allow", "allow"],
  ])("explicit %s wins on remote and localhost", (qs, expected) => {
    expect(pgSslModeForUrl(remote + qs)).toBe(expected);
    expect(pgSslModeForUrl(local + qs)).toBe(expected);
    expect(pgSslModeForUrl(loopback + qs)).toBe(expected);
  });

  it("no sslmode on a remote host fails closed", () => {
    expect(pgSslModeForUrl(remote)).toBe("require");
  });

  it("no sslmode on a local host returns undefined", () => {
    expect(pgSslModeForUrl(local)).toBeUndefined();
    expect(pgSslModeForUrl(loopback)).toBeUndefined();
  });

  it("unrecognised sslmode: require remote, undefined local", () => {
    expect(pgSslModeForUrl(remote + "?sslmode=bogus")).toBe("require");
    expect(pgSslModeForUrl(local + "?sslmode=bogus")).toBeUndefined();
  });

  it("host lookalikes are not local", () => {
    expect(pgSslModeForUrl("postgres://u:p@my-localhost.example.com/d")).toBe("require");
    expect(pgSslModeForUrl("postgres://u:p@db.example.com/localhost")).toBe("require");
  });

  it("unparseable string fails closed", () => {
    expect(pgSslModeForUrl("not a url")).toBe("require");
  });
});

describe("scripts/ SSL guard", () => {
  it("every scripts/*.mjs that calls postgres( also uses sslForScriptUrl(", () => {
    const dir = path.join(process.cwd(), "scripts");
    const violators = readdirSync(dir)
      .filter((f) => f.endsWith(".mjs"))
      .filter((f) => {
        const src = readFileSync(path.join(dir, f), "utf8");
        return src.includes("postgres(") && !src.includes("sslForScriptUrl(");
      });
    expect(violators).toEqual([]);
  });

  it("every scripts/*.mjs that spawns pg_dump/pg_restore/psql also uses pgSslModeForUrl(", () => {
    const dir = path.join(process.cwd(), "scripts");
    const spawnsLibpq =
      /\b(?:spawnSync|run)\(\s*["'`](?:pg_dump|pg_restore|psql)["'`]/;
    const violators = readdirSync(dir)
      .filter((f) => f.endsWith(".mjs"))
      .filter((f) => {
        const src = readFileSync(path.join(dir, f), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        return spawnsLibpq.test(src) && !src.includes("pgSslModeForUrl(");
      });
    expect(violators).toEqual([]);
  });
});
