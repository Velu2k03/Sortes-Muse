import postgres, { type Parameter } from "postgres";
import { runMigrations } from "../migrations";
import { withTimeout } from "../fetch-timeout";
import { DB_SCHEMA_TIMEOUT_MS, withDbTimeout } from "../db-timeout";

/*
 * F9 (2026-11-09): Postgres client, connection checks, schema readiness.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

/**
 * Database layer.
 * - Production: standard Postgres TCP via the `postgres` package (Unlicense)
 *   using POSTGRES_URL / DATABASE_URL. This deliberately replaces
 *   @vercel/postgres: its Neon HTTP driver rewrites the first hostname label
 *   to "api.", turning a Supabase pooler host into api.pooler.supabase.com,
 *   which does not resolve (production 500s on signup/login, 2026-11-02).
 *   `prepare: false` is required: Supabase transaction mode (port 6543)
 *   does not support prepared statements.
 * - Local dev without a database: a gitignored JSON file store with the same
 *   interface, so auth/credits/transactions work end to end with zero setup.
 *
 * Tables: see migrations/001_baseline.sql (versioned migrations,
 * src/lib/migrations.ts). ensureSchema() below applies pending
 * migrations; explicit application is `npm run db:migrate`.
 */

export const usePostgres = Boolean(
  process.env.POSTGRES_URL || process.env.DATABASE_URL
);

const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL || "";

/**
 * Phase 6 (P1a): validate a Supabase pooler connection string.
 * The app runs against the pooler in transaction mode (port 6543,
 * `prepare: false`, `max: 1` — see below) or session mode (port
 * 5432, used for pg_dump and other long-lived sessions). A pooler
 * host on any other port — or with no explicit port — is a
 * misconfiguration: reject it loudly here, at import time, instead
 * of failing later as a mysterious connection error. Non-pooler
 * hosts (local Postgres, other providers) are not validated.
 */
export function validatePostgresUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("POSTGRES_URL/DATABASE_URL is not a valid URL.");
  }
  const host = parsed.hostname;
  const isPooler =
    host === "pooler.supabase.com" || host.endsWith(".pooler.supabase.com");
  if (!isPooler) return;
  const port = parsed.port;
  if (port !== "6543" && port !== "5432") {
    throw new Error(
      `Supabase pooler URL for host ${host} must use port 6543 (transaction mode, which this app requires: prepare:false, max:1) or 5432 (session mode); got port ${port || "(none — an explicit port is required)"}. ` +
        `Check the connection string in the Supabase dashboard (Database Settings -> Connection string) or Vercel env vars.`
    );
  }
}

if (connectionString) validatePostgresUrl(connectionString);

// Bug 3 (2026-11-07): server-side statement_timeout for the app
// pool. Verified mechanism (postgres.js 4.0.0, installed):
// node_modules/postgres/README.md "All Postgres options" lists a
// `connection: { application_name, ... }` bag of "Other connection
// parameters, see https://www.postgresql.org/docs/current/runtime-config-client.html",
// types/index.d.ts declares ConnectionParameters.statement_timeout
// (number, milliseconds), and src/startup.js sends the bag in the
// Startup message, so it applies session-wide to every connection
// the pool opens. Official Postgres docs
// (postgresql.org/docs/current/runtime-config-client.html):
// statement_timeout "Abort any statement that takes more than the
// specified amount of time... If this value is specified without
// units, it is taken as milliseconds", measured "from the time a
// command arrives at the server until it is completed", so it
// covers lock-wait time too. Postgres cancels the statement
// (error 57014), frees its locks, and the client gets the error —
// so the single max:1 connection is freed instead of being held
// until the 300 s function timeout. A client-side race alone would
// NOT do this: the timed-out query would keep holding the only
// connection.
// Value: 10 s. Normal app queries are single indexed SELECTs /
// short writes that run in milliseconds, so 10 s is generous for
// the app-query path while failing fast on hangs. Migrations are
// exempt: runMigrations() sets SET LOCAL statement_timeout = 0
// inside each file transaction (see migrations.ts), because DDL
// such as the 002 CREATE INDEX and row-by-row repair can
// legitimately exceed 10 s and must never be killed mid-file.
// No separate lock_timeout: the Postgres docs state that with a
// nonzero statement_timeout it is "rather pointless to set
// lock_timeout to the same or larger value, since the statement
// timeout would always trigger first", and lock_timeout "can only
// occur while waiting for locks" while statement_timeout covers
// the whole statement including lock wait.
export const APP_STATEMENT_TIMEOUT_MS = 10_000;

/**
 * Pool-unwedging (2026-11-07): wrap a tx-scoped Sql so every query
 * it creates carries the given AbortSignal. Used at the five
 * pg.begin sites with the same controller the outer withDbTimeout
 * aborts: an in-flight statement inside the transaction is
 * cancelled, the callback throws, scope() rolls back, done settles,
 * and transaction()'s finally runs lease.release() — so a timed-out
 * transaction frees the single max:1 connection instead of holding
 * it forever. Only the template-tag call and unsafe() are wrapped;
 * settled queries detach their abort listener on resolve/reject
 * (Query.resolve/reject call this.aborts()), and the COMMIT is a
 * control query this wrapper never sees, so a query that already
 * committed is never cancelled. The guard keeps non-query calls
 * (e.g. the identifier form tx("table")) working untouched.
 * Exported for the pool-recovery tests
 * (src/lib/__tests__/db-query-timeout.test.ts), which build a
 * transaction the same way the five pg.begin sites do.
 */
export function txWithSignal<T extends postgres.ISql>(tx: T, signal: AbortSignal): T {
  type QueryLike = { signal: (signal: AbortSignal) => unknown };
  const runQuery = tx as unknown as (
    strings: TemplateStringsArray,
    ...args: unknown[]
  ) => QueryLike;
  const call = ((strings: TemplateStringsArray, ...args: unknown[]) => {
    const q = runQuery(strings, ...args);
    if (typeof q.signal === "function") q.signal(signal);
    return q;
  }) as unknown as T;
  const wrapped = Object.assign(call, tx);
  const runUnsafe = tx.unsafe as unknown as (
    query: string,
    parameters?: unknown[],
    options?: unknown
  ) => QueryLike;
  wrapped.unsafe = ((query: string, parameters?: unknown[], options?: unknown) => {
    const q = runUnsafe(query, parameters, options);
    if (typeof q.signal === "function") q.signal(signal);
    return q;
  }) as T["unsafe"];
  return wrapped;
}

type PgSsl = false | "require" | "prefer" | "allow" | "verify-full";

/** Map the connection string's `sslmode` to postgres.js's `ssl` option.
 * An explicit ssl option would override the URL, so the URL is parsed
 * here instead. Absent or unrecognised -> "prefer": try TLS, fall back
 * to plain (production Supabase upgrades to TLS; plain CI/local works). */
export function sslFromConnectionString(connectionString: string): PgSsl {
  const m = /[?&]sslmode=([^&#]*)/i.exec(connectionString);
  const mode = m?.[1].toLowerCase();
  switch (mode) {
    case "disable":
      return false;
    case "require":
    case "allow":
    case "verify-full":
      return mode;
    case "verify-ca":
      // postgres.js has no verify-ca; verify-full is the stricter,
      // fail-closed equivalent.
      return "verify-full";
    default:
      return "prefer";
  }
}

/** The one place the app's Postgres client is constructed, so the
 * timeout above (and every other pool option) cannot drift between
 * the app and its tests. */
export function createAppPostgres(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    ssl: sslFromConnectionString(connectionString),
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    // Pool-unwedging hygiene (2026-11-07): a query waiting for the
    // single max:1 connection is rejected with QUEUE_TIMEOUT after
    // 12 s (seconds, not ms) AND removed from the pool's waiting
    // list (src/pool.js wait()), so it can never run later as a
    // ghost job. 12 s matches DB_QUERY_TIMEOUT_MS. This is hygiene,
    // not the un-wedger — the withDbTimeout cancellation above is
    // what frees a connection held by a never-settling operation.
    queue_timeout: 12,
    // Pool-unwedging round 2 (2026-11-07): postgres.js 4.1.0 adds
    // cancel_timeout — when a cancel goes unanswered, the
    // connection is closed after this many seconds and the pool
    // reconnects. That is the escape hatch for a backend stuck
    // mid-protocol-message (state active, wait_event ClientRead):
    // Postgres defers query-cancel interrupts while reading a
    // protocol message, so statement_timeout, the idle-in-
    // transaction timeout, and pool.cancel all fail to free it.
    // 5 s is the 4.1.0 default; set explicitly so the value is
    // visible here and survives a future default change.
    cancel_timeout: 5,
    connection: { statement_timeout: APP_STATEMENT_TIMEOUT_MS },
  });
}

// postgres.js template tag returns rows directly; wrap it so the rest of
// this file keeps its existing `{ rows }` shape from @vercel/postgres.
export const pg = usePostgres ? createAppPostgres(connectionString) : null;

export async function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ rows: unknown[] }> {
  return sqlWithLabel("db")(strings, ...values);
}

/**
 * Diagnosis round 4 (2026-11-07): the labelled form of sql() — call
 * it with a label to get back a template-tag function for one query.
 * The label names the call site in the structured timeout logs (see
 * logDbTimeout) so the next failure says which query stalled instead
 * of just "the database timed out". Only the call sites that matter
 * most are labelled so far (getUserById, the ensureSchema role
 * check); the rest keep the "db" default through sql() above.
 */
export function sqlWithLabel(label: string) {
  return async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<{ rows: unknown[] }> => {
    if (!pg) throw new Error("Database not configured");
    const rows = await withDbTimeout(
      (pg as unknown as (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => Promise<unknown[]>)(strings, ...values),
      undefined,
      label
    );
    return { rows };
  };
}

/**
 * Phase 6 (G2 finding): a JSONB parameter for postgres.js.
 * `${JSON.stringify(x)}::jsonb` DOUBLE-ENCODES under postgres.js —
 * it stores a JSON string, not an object (proven by the real-Postgres
 * suite: readings came back as strings, and jsonb_set failed with
 * "cannot set path in scalar"). The pattern worked under the old
 * @vercel/postgres driver and silently broke when the driver changed
 * (2026-11-02). Always pass JSONB values through here.
 * The cast is centralised: callers pass app objects that are
 * JSON-serialisable by construction (they come from JSON input).
 */
export function jsonbParam(value: unknown): Parameter {
  if (!pg) throw new Error("Database not configured");
  return pg.json(value as postgres.JSONValue);
}

let schemaReady = false;

/**
 * Phase G (F11): the RLS role startup assertion. The app connects to
 * Postgres as the owner (postgres) role, which bypasses RLS; the
 * anon and authenticated roles are denied by the zero-policy RLS
 * migrations (004, 005). If POSTGRES_URL ever pointed at one of
 * those roles, the app would silently see zero rows on every table
 * (sign-in, balances, readings, everything) with no error to point
 * at. So ensureSchema() asserts the live connection role at first
 * database use and fails loudly instead.
 *
 * Phase G follow-up: this is an ALLOWLIST, not a denylist. Only the
 * roles the project is known to connect as may run the app:
 * `postgres` (direct owner), `sortes_test` (local test role), and
 * `postgres.<ref>` (the Supabase pooler user form). Anything else,
 * including a hypothetical dedicated app role, throws: a future
 * dedicated role must be added to this list explicitly, and a silent
 * role change can no longer pass. A live probe (SELECT from a table)
 * was considered and rejected as the mechanism: an empty table
 * returns zero rows legitimately, so a probe cannot distinguish RLS
 * denial from an empty table. The allowlist fails closed at startup,
 * which is the behaviour F11 was built for. Matching is
 * case-insensitive on the trimmed role.
 */
const APP_DB_ROLES = new Set(["postgres", "sortes_test"]);
export function assertAppDbRole(role: string): void {
  const normalized = (role ?? "").trim().toLowerCase();
  const allowed =
    APP_DB_ROLES.has(normalized) || /^postgres\..+/.test(normalized);
  if (!allowed) {
    throw new Error(
      `Database role "${role}" must not run the app: only the postgres, sortes_test, and postgres.<ref> (Supabase pooler) roles are allowed, because RLS denies every other role and the app would see zero rows. Connect as the owner (postgres) role.`
    );
  }
}

export async function ensureSchema(): Promise<void> {
  // Phase 6 (P1a, readiness review N1): production fail-fast guard.
  // Without a database URL the data layer used to switch silently to
  // data/local-db.json — on Vercel that is per-instance ephemeral
  // storage, so accounts, credits, and reading history would be
  // written per-instance and lost on redeploy/cold start. In
  // production, refuse to run at all instead. Local development
  // keeps the JSON fallback (no URL, non-production env).
  // Phase 6B: fail CLOSED, not on an exact NODE_ENV match — an
  // unset, empty, or misspelled NODE_ENV in a real deployment must
  // not silently re-enable the JSON store. Only "development" and
  // "test" get the fallback.
  if (!usePostgres) {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      throw new Error(
        "POSTGRES_URL (or DATABASE_URL) is required in production. " +
          "Sortes refuses to run on the local JSON store in production, " +
          "because per-instance files lose customer data. Set POSTGRES_URL " +
          "in the production environment."
      );
    }
    return;
  }
  if (schemaReady) return;
  // Phase 6: the schema now lives in versioned migration files
  // (migrations/*.sql) applied by src/lib/migrations.ts. ensureSchema
  // stays as the single entry point every DB function calls — it is
  // the dev/staging/Preview safety net that applies pending
  // migrations on first use — but it no longer contains DDL itself.
  // Phase 6B: in production runMigrations only VERIFIES (it throws
  // naming any pending migration); it never applies. Explicit
  // application (the recommended path for staging/production) is:
  //   npm run db:migrate
  // which needs Velu's explicit approval for production.
  if (!pg) throw new Error("Database not configured");
  await withTimeout(runMigrations(pg), DB_SCHEMA_TIMEOUT_MS, "ensureSchema");
  // Phase G (F11): assert the connection role is not one RLS denies.
  // Runs once per instance (schemaReady caches below). The query is
  // one cheap SELECT; current_user is always readable.
  const { rows: roleRows } = await sqlWithLabel("ensureSchema:current-user")`SELECT current_user AS role`;
  assertAppDbRole(String((roleRows[0] as { role: string } | undefined)?.role ?? ""));
  schemaReady = true;
}

export function uid(): string {
  return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
