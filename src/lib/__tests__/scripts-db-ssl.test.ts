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

/** Index just past the `)` closing the call whose `(` is at `open`; string/template aware. */
function callEnd(src: string, open: number): number {
  let depth = 0;
  const skipString = (i: number): number => {
    const q = src[i];
    for (i++; i < src.length; i++) {
      if (src[i] === "\\") i++;
      else if (src[i] === q) return i;
      else if (q === "`" && src[i] === "$" && src[i + 1] === "{") i = skipBraces(i + 1);
    }
    return i;
  };
  const skipBraces = (i: number): number => {
    let d = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") i = skipString(i);
      else if (c === "{") d++;
      else if (c === "}" && --d === 0) return i;
    }
    return i;
  };
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") i = skipString(i);
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return src.length;
}

/** Each pg_dump/pg_restore/psql spawn whose own argument list lacks sslEnv( or PGSSLMODE. */
function libpqSpawnViolations(source: string): string[] {
  const src = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const re = /\b(?:spawnSync|run)\(\s*["'`](pg_dump|pg_restore|psql)["'`]/g;
  const out: string[] = [];
  for (let m; (m = re.exec(src)); ) {
    const open = src.indexOf("(", m.index);
    const call = src.slice(open, callEnd(src, open));
    if (!/\bsslEnv\(|\bPGSSLMODE\b/.test(call)) out.push(`${m[1]} spawn without sslEnv(/PGSSLMODE`);
  }
  return out;
}

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

  it("every libpq spawn call site in scripts/*.mjs passes the SSL helper itself", () => {
    const dir = path.join(process.cwd(), "scripts");
    const violations = readdirSync(dir)
      .filter((f) => f.endsWith(".mjs"))
      .flatMap((f) =>
        libpqSpawnViolations(readFileSync(path.join(dir, f), "utf8")).map((v) => `${f}: ${v}`),
      );
    expect(violations).toEqual([]);
  });
});

describe("libpqSpawnViolations", () => {
  it("flags a bare psql spawn", () => {
    expect(libpqSpawnViolations('spawnSync("psql", [url, "-c", "SELECT 1"]);')).toHaveLength(1);
  });
  it("passes a pg_dump spawn with PGSSLMODE in env", () => {
    const src = 'spawnSync("pg_dump", [url], { env: { ...process.env, PGSSLMODE: "require" } });';
    expect(libpqSpawnViolations(src)).toEqual([]);
  });
  it("passes run() with sslEnv", () => {
    expect(libpqSpawnViolations('run("psql", [url], sslEnv(url));')).toEqual([]);
  });
  it("ignores commented-out spawns", () => {
    const src = '// spawnSync("psql", [url]);\n/* run("psql", [url]); */';
    expect(libpqSpawnViolations(src)).toEqual([]);
  });
  it("flags a bare spawn even when another spawn in the file is covered", () => {
    const src = [
      'import { pgSslModeForUrl } from "./db-ssl.mjs";',
      'run("psql", [url], sslEnv(url));',
      'spawnSync("psql", [url, "-c", "SELECT 1"]);',
    ].join("\n");
    expect(libpqSpawnViolations(src)).toHaveLength(1);
  });
  it("handles template literals with parens and interpolation in args", () => {
    const bad = 'run("psql", [u, `SELECT (${a.replace(/\)/g, "")})`]);';
    const good = 'run("psql", [u, `SELECT (${f(")")})`], sslEnv(u));';
    expect(libpqSpawnViolations(bad)).toHaveLength(1);
    expect(libpqSpawnViolations(good)).toEqual([]);
  });
  it("does not touch non-libpq spawns", () => {
    expect(libpqSpawnViolations('spawnSync("age", ["--decrypt"], { stdio: "inherit" });')).toEqual([]);
  });
});
