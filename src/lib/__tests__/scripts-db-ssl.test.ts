import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sslForScriptUrl, pgSslModeForUrl, libpqEnv } from "../../../scripts/db-ssl.mjs";

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

describe("sslForScriptUrl with operator PGSSLMODE", () => {
  const vf = { PGSSLMODE: "verify-full" };

  it("env verify-full applies when the URL has no sslmode (remote and localhost)", () => {
    expect(sslForScriptUrl(remote, vf)).toBe("verify-full");
    expect(sslForScriptUrl(local, vf)).toBe("verify-full");
    expect(sslForScriptUrl(loopback, vf)).toBe("verify-full");
  });
  it("env verify-ca maps to verify-full for postgres.js; value is case-insensitive", () => {
    expect(sslForScriptUrl(remote, { PGSSLMODE: "verify-ca" })).toBe("verify-full");
    expect(sslForScriptUrl(remote, { PGSSLMODE: "VERIFY-FULL" })).toBe("verify-full");
    expect(sslForScriptUrl(remote, { PGSSLMODE: "disable" })).toBe(false);
  });
  it("an explicit URL sslmode still beats the env value", () => {
    expect(sslForScriptUrl(remote + "?sslmode=require", vf)).toBe("require");
    expect(sslForScriptUrl(remote + "?sslmode=disable", vf)).toBe(false);
  });
  it("fails closed when neither URL nor env sets a mode", () => {
    expect(sslForScriptUrl(remote, {})).toBe("require");
    expect(sslForScriptUrl(local, {})).toBeUndefined();
    expect(sslForScriptUrl("not a url", {})).toBe("require");
  });
  it("empty or unrecognised env PGSSLMODE counts as unset", () => {
    expect(sslForScriptUrl(remote, { PGSSLMODE: "" })).toBe("require");
    expect(sslForScriptUrl(remote, { PGSSLMODE: "bogus" })).toBe("require");
    expect(sslForScriptUrl(local, { PGSSLMODE: "bogus" })).toBeUndefined();
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

describe("libpqEnv", () => {
  it("keeps an operator PGSSLMODE over the derived require (no sslmode in URL)", () => {
    expect(libpqEnv(remote, { PGSSLMODE: "verify-full" }).PGSSLMODE).toBe("verify-full");
  });
  it("keeps an operator PGSSLMODE over a URL sslmode=require", () => {
    expect(libpqEnv(remote + "?sslmode=require", { PGSSLMODE: "verify-full" }).PGSSLMODE).toBe(
      "verify-full",
    );
  });
  it("derives require for a remote URL when PGSSLMODE is unset", () => {
    expect(libpqEnv(remote, {}).PGSSLMODE).toBe("require");
  });
  it("omits PGSSLMODE for localhost when unset", () => {
    expect("PGSSLMODE" in libpqEnv(local, {})).toBe(false);
  });
  it("treats an empty PGSSLMODE as unset", () => {
    expect(libpqEnv(remote, { PGSSLMODE: "" }).PGSSLMODE).toBe("require");
  });
  it("does not mutate the passed env and keeps other vars", () => {
    const env = { FOO: "1" };
    const out = libpqEnv(remote, env);
    expect(env).toEqual({ FOO: "1" });
    expect(out).toEqual({ FOO: "1", PGSSLMODE: "require" });
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

/**
 * Each pg_dump/pg_restore/psql spawn (any child_process wrapper, incl. shell-string
 * exec/execSync) whose own argument list lacks libpqEnv( / sslEnv( or PGSSLMODE.
 */
function libpqSpawnViolations(source: string): string[] {
  const src = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const re =
    /\b(?:spawnSync|spawn|execFileSync|execFile|execSync|exec|fork|run)\(\s*["'`]\s*(pg_dump|pg_restore|psql)(?=[\s"'`])/g;
  const out: string[] = [];
  for (let m; (m = re.exec(src)); ) {
    const open = src.indexOf("(", m.index);
    const call = src.slice(open, callEnd(src, open));
    if (!/\b(?:libpqEnv|sslEnv)\(|\bPGSSLMODE\b/.test(call)) out.push(`${m[1]} spawn without libpqEnv(/PGSSLMODE`);
  }
  return out;
}

/**
 * Shell scripts: a line that invokes pg_dump/pg_restore/psql as a command word
 * (line start, or after && || ; | ( or an env-assignment prefix) without
 * PGSSLMODE on that line, unless the file assigns/exports PGSSLMODE anywhere.
 * Accepted limits, same as the .mjs guard: tool paths (/usr/bin/psql) and
 * commands built from variables are not detected.
 */
function shLibpqViolations(source: string): string[] {
  const src = source.replace(/(^|\s)#.*$/gm, "$1");
  if (/^\s*(?:export\s+)?PGSSLMODE=/m.test(src)) return [];
  const cmd = /(?:^|[;&|(]|&&|\|\|)\s*(?:[A-Za-z_]\w*=\S*\s+)*(pg_dump|pg_restore|psql)(?=\s|$)/;
  return src
    .split("\n")
    .filter((line) => cmd.test(line) && !/\bPGSSLMODE\b/.test(line))
    .map((line) => `${cmd.exec(line)![1]} without PGSSLMODE: ${line.trim()}`);
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

describe("scripts/*.sh libpq guard", () => {
  it("every scripts/*.sh invokes libpq tools only with PGSSLMODE", () => {
    const dir = path.join(process.cwd(), "scripts");
    const violations = readdirSync(dir)
      .filter((f) => f.endsWith(".sh"))
      .flatMap((f) => shLibpqViolations(readFileSync(path.join(dir, f), "utf8")).map((v) => `${f}: ${v}`));
    expect(violations).toEqual([]);
  });
});

describe("shLibpqViolations", () => {
  it("flags a bare pg_dump line, also after a pipe or &&", () => {
    expect(shLibpqViolations('pg_dump "$URL" > out.sql')).toHaveLength(1);
    expect(shLibpqViolations('cd /tmp && psql "$URL" -c "SELECT 1"')).toHaveLength(1);
    expect(shLibpqViolations('echo x | pg_restore -d "$URL"')).toHaveLength(1);
  });
  it("passes a PGSSLMODE env prefix on the same line", () => {
    expect(shLibpqViolations('PGSSLMODE=require pg_dump "$URL"')).toEqual([]);
  });
  it("passes when the file exports PGSSLMODE earlier", () => {
    const src = 'export PGSSLMODE=require\npg_dump "$URL"';
    expect(shLibpqViolations(src)).toEqual([]);
    expect(shLibpqViolations('PGSSLMODE=verify-full\npsql "$URL"')).toEqual([]);
  });
  it("ignores a comment that mentions pg_dump", () => {
    expect(shLibpqViolations("# runs pg_dump nightly")).toEqual([]);
    expect(shLibpqViolations("echo ok # then pg_dump later")).toEqual([]);
  });
  it("does not flag psqlfoo or non-libpq commands", () => {
    expect(shLibpqViolations('psqlfoo "$URL"')).toEqual([]);
    expect(shLibpqViolations("node scripts/backup.mjs")).toEqual([]);
    expect(shLibpqViolations('echo "pg_dump is slow"')).toEqual([]);
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
  it("flags a bare execFile psql and passes one with libpqEnv", () => {
    expect(libpqSpawnViolations('execFile("psql", [url, "-c", "SELECT 1"]);')).toHaveLength(1);
    expect(libpqSpawnViolations('execFile("psql", [url], { env: libpqEnv(url) });')).toEqual([]);
  });
  it("flags shell-string exec of a libpq tool unless PGSSLMODE is passed", () => {
    expect(libpqSpawnViolations(`exec("psql -c 'SELECT 1'");`)).toHaveLength(1);
    expect(libpqSpawnViolations(`execSync("  pg_dump mydb");`)).toHaveLength(1);
    const ok = `exec("psql -c 'SELECT 1'", { env: { PGSSLMODE: "require" } });`;
    expect(libpqSpawnViolations(ok)).toEqual([]);
  });
  it("flags bare spawn/execFileSync/fork and cp.-prefixed forms", () => {
    expect(libpqSpawnViolations('spawn("pg_dump", [url]);')).toHaveLength(1);
    expect(libpqSpawnViolations('execFileSync("pg_restore", [url]);')).toHaveLength(1);
    expect(libpqSpawnViolations('child_process.spawnSync("psql", [url]);')).toHaveLength(1);
  });
  it("does not flag an exec of a non-libpq command or a tool-name prefix", () => {
    expect(libpqSpawnViolations('exec("psqlfoo --x");')).toEqual([]);
    expect(libpqSpawnViolations('exec("ls -la");')).toEqual([]);
  });
  it("does not touch non-libpq spawns", () => {
    expect(libpqSpawnViolations('spawnSync("age", ["--decrypt"], { stdio: "inherit" });')).toEqual([]);
  });
});
