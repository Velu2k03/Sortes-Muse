/**
 * db-ssl.mjs — the one place the operator scripts decide the postgres.js
 * `ssl` option. Mirrors sslFromConnectionString in src/lib/db/client.ts
 * (the scripts are plain .mjs and cannot import the TypeScript mapper).
 *
 * Precedence: an explicit sslmode in the URL, then an operator-set
 * PGSSLMODE (same rule as libpqEnv; postgres.js honoured it before this
 * helper existed), then fail closed ("require"), except for localhost /
 * 127.0.0.1, where undefined keeps postgres.js's own default so local
 * no-SSL test databases still work.
 */
const MODES = {
  disable: false,
  require: "require",
  allow: "allow",
  prefer: "prefer",
  "verify-full": "verify-full",
  // postgres.js has no verify-ca; fail closed to the stricter value.
  "verify-ca": "verify-full",
};

/**
 * @param {string} connectionString
 * @param {Record<string, string | undefined>} [env]
 */
export function sslForScriptUrl(connectionString, env = process.env) {
  const raw = /[?&]sslmode=([^&#]*)/i.exec(connectionString)?.[1];
  const mode = raw?.toLowerCase();
  if (mode !== undefined && Object.hasOwn(MODES, mode)) return MODES[mode];
  const envMode = env.PGSSLMODE?.toLowerCase();
  if (envMode !== undefined && Object.hasOwn(MODES, envMode)) return MODES[envMode];
  try {
    const { hostname } = new URL(connectionString);
    if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  } catch {
    // unparseable: fall through to fail closed
  }
  return "require";
}

const PG_MODES = new Set(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]);

/**
 * PGSSLMODE value for libpq tools (pg_dump, pg_restore, psql), or
 * undefined to leave libpq's own default. libpq defaults to "prefer"
 * (silent plaintext fallback); this fails closed for non-local hosts.
 * An sslmode in the URL overrides PGSSLMODE inside libpq, so explicit
 * choices are always kept. verify-ca is native to libpq, unlike
 * postgres.js (see sslForScriptUrl).
 */
export function pgSslModeForUrl(connectionString) {
  const mode = /[?&]sslmode=([^&#]*)/i.exec(connectionString)?.[1]?.toLowerCase();
  if (mode !== undefined && PG_MODES.has(mode)) return mode;
  try {
    const { hostname } = new URL(connectionString);
    if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  } catch {
    // unparseable: fall through to fail closed
  }
  return "require";
}

/**
 * Env for a libpq tool. An operator-set PGSSLMODE (non-empty) always wins;
 * otherwise it is derived from the URL via pgSslModeForUrl. The one place
 * backup.mjs and restore.mjs build their spawn env. Does not mutate `env`.
 * @param {string} connectionString
 * @param {Record<string, string | undefined>} [env]
 */
export function libpqEnv(connectionString, env = process.env) {
  if (env.PGSSLMODE) return { ...env };
  const mode = pgSslModeForUrl(connectionString);
  return { ...env, ...(mode ? { PGSSLMODE: mode } : {}) };
}
