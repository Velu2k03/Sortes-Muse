/**
 * db-ssl.mjs — the one place the operator scripts decide the postgres.js
 * `ssl` option. Mirrors sslFromConnectionString in src/lib/db/client.ts
 * (the scripts are plain .mjs and cannot import the TypeScript mapper).
 *
 * An explicit sslmode in the URL always wins. Otherwise fail closed
 * ("require"), except for localhost / 127.0.0.1, where undefined keeps
 * postgres.js's own default so local no-SSL test databases still work.
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

export function sslForScriptUrl(connectionString) {
  const raw = /[?&]sslmode=([^&#]*)/i.exec(connectionString)?.[1];
  const mode = raw?.toLowerCase();
  if (mode !== undefined && Object.hasOwn(MODES, mode)) return MODES[mode];
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
