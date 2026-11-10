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
