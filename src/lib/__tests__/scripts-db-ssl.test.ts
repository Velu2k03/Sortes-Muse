import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sslForScriptUrl } from "../../../scripts/db-ssl.mjs";

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
});
