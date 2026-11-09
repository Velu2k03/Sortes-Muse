import postgres, { type Parameter } from "postgres";
import { promises as fs } from "fs";
import path from "path";
import { runMigrations } from "./migrations";
import { withTimeout } from "./fetch-timeout";
import { DB_SCHEMA_TIMEOUT_MS, withDbTimeout } from "./db-timeout";

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

export interface DbUser {
  id: string;
  email: string;
  credits: number;
  created_at: string;
  winback_sent_at?: string | null;
  password_hash?: string | null;
  // Phase B (R5): session version, carried in the JWT as the `pwdVer`
  // claim and checked in getSession. Bumped on every password set or
  // change, so a stolen token dies when the owner changes password.
  // DEFAULT 1 (migration 006); legacy rows/tokens without it read as 1.
  pwd_ver?: number | null;
}

export interface DbTransaction {
  id: string;
  user_id: string | null;
  email: string;
  pack_type: string;
  amount: number;
  readings: number;
  created_at: string;
  // AF-004 (migration 007): the Lemon Squeezy order id of a fulfilled
  // order, UNIQUE where not null. Null/absent on refund rows, markers,
  // and rows written before 007.
  order_id?: string | null;
}

const usePostgres = Boolean(
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

export {
  DB_INSTANCE_ID,
  DB_QUERY_TIMEOUT_MS,
  DB_SCHEMA_TIMEOUT_MS,
  logDbTimeout,
  withDbTimeout,
} from "./db-timeout";

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

/** The one place the app's Postgres client is constructed, so the
 * timeout above (and every other pool option) cannot drift between
 * the app and its tests. */
export function createAppPostgres(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    ssl: "require",
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
const pg = usePostgres ? createAppPostgres(connectionString) : null;

async function sql(
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
function sqlWithLabel(label: string) {
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
function jsonbParam(value: unknown): Parameter {
  if (!pg) throw new Error("Database not configured");
  return pg.json(value as postgres.JSONValue);
}

const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

interface LocalDb {
  users: DbUser[];
  codes: Record<string, { code_hash: string; expires_at: string; attempts: number }>;
  transactions: DbTransaction[];
  readings: Array<{ id: string; user_id: string; data: unknown; created_at: string }>;
  freeInterpretations: Array<{ user_id: string; system: string; used_at: string }>;
  // Phase 2, 2.1: optional because local files written before Phase 2
  // have no freeReadings key; the functions fall back to an empty list.
  freeReadings?: Array<{ user_id: string; used_at: string }>;
  // M4.1: optional because local files written before M4.1 have no
  // reports key; report functions fall back to an empty list.
  reports?: Array<{ id: string; user_id: string; data: unknown; created_at: string }>;
}

async function readLocal(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf8");
    return JSON.parse(raw) as LocalDb;
  } catch {
    return { users: [], codes: {}, transactions: [], readings: [], freeInterpretations: [], reports: [] };
  }
}

async function writeLocal(db: LocalDb): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, JSON.stringify(db, null, 2));
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

function uid(): string {
  return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Users
export async function getUserByEmail(email: string): Promise<DbUser | null> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`;
    return (rows[0] as DbUser) ?? null;
  }
  const db = await readLocal();
  return db.users.find((u) => u.email === email) ?? null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sqlWithLabel("getUserById")`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    return (rows[0] as DbUser) ?? null;
  }
  const db = await readLocal();
  return db.users.find((u) => u.id === id) ?? null;
}

export async function createUser(email: string): Promise<DbUser> {
  await ensureSchema();
  const user: DbUser = {
    id: uid(),
    email,
    credits: 0,
    created_at: new Date().toISOString(),
    pwd_ver: 1,
  };
  if (usePostgres) {
    await sql`INSERT INTO users (id, email, credits, password_hash, created_at) VALUES (${user.id}, ${user.email}, 0, ${null}, NOW()) ON CONFLICT (email) DO NOTHING`;
    return (await getUserByEmail(email)) as DbUser;
  }
  const db = await readLocal();
  const existing = db.users.find((u) => u.email === email);
  if (existing) return existing;
  db.users.push(user);
  await writeLocal(db);
  return user;
}

/**
 * Signup only. Atomically creates the account WITH its password, and
 * returns null when the email already exists — so two concurrent
 * signups for the same address cannot both pass an existence check
 * and then both sign in as the same account. Callers must treat null
 * as a 409. This is the ONLY place a password is attached at creation:
 * createUser never sets one, so an existing passwordless account
 * (created by OTP sign-in or the purchase webhook) can only gain a
 * password after the owner proves the email — OTP sign-in, then the
 * signed-in set-password route.
 */
export async function createUserWithPassword(
  email: string,
  passwordHash: string
): Promise<DbUser | null> {
  await ensureSchema();
  const user: DbUser = {
    id: uid(),
    email,
    credits: 0,
    created_at: new Date().toISOString(),
    password_hash: passwordHash,
    pwd_ver: 1,
  };
  if (usePostgres) {
    const { rows } = await sql`INSERT INTO users (id, email, credits, password_hash, created_at)
      VALUES (${user.id}, ${user.email}, 0, ${passwordHash}, NOW())
      ON CONFLICT (email) DO NOTHING RETURNING *`;
    return (rows[0] as DbUser) ?? null;
  }
  const db = await readLocal();
  if (db.users.some((u) => u.email === email)) return null;
  db.users.push(user);
  await writeLocal(db);
  return user;
}

/**
 * Phase B (R5): set (or change) a password AND bump the session
 * version in the same statement, so the password change and the
 * revocation of all previously issued tokens commit together.
 * Returns the new session version (1 when the user row is missing,
 * which callers treat as "no user" via their own check first).
 * Requires migration 006 (pwd_ver column); the set-password route
 * re-issues the caller's own session with the new version, so the
 * device that changed the password stays signed in while every
 * other token dies.
 */
export async function setUserPassword(userId: string, passwordHash: string): Promise<number> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`UPDATE users SET password_hash = ${passwordHash}, pwd_ver = pwd_ver + 1 WHERE id = ${userId} RETURNING pwd_ver`;
    return (rows[0] as { pwd_ver: number } | undefined)?.pwd_ver ?? 1;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (u) {
    u.password_hash = passwordHash;
    u.pwd_ver = (u.pwd_ver ?? 1) + 1;
    await writeLocal(db);
    return u.pwd_ver;
  }
  return 1;
}

// Phase 3 (3.6): delete an account and ALL its data. The foreign
// keys in this file are plain REFERENCES with no ON DELETE CASCADE,
// and that is deliberate: the constraint names are Postgres-generated,
// so a blind ALTER in ensureSchema could leave the old blocking
// constraint in place while adding a second one, and DDL on every
// cold start is the wrong place for it. Instead deleteUser deletes
// the dependent rows explicitly first — that IS the cascade,
// deterministic in both branches, in one transaction on Postgres
// and one read/modify/write locally — then the user row. False when
// the user does not exist. Transactions match by user id OR email:
// a guest purchase made before sign-in can carry a null user id
// with this email, and it is still this person's data.
export async function deleteUser(userId: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    const controller = new AbortController();
    const begin = pg.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      const found = await tx`SELECT id, email FROM users WHERE id = ${userId} FOR UPDATE`;
      if (found.length === 0) return false;
      const email = (found[0] as { email: string }).email;
      await tx`DELETE FROM auth_codes WHERE email = ${email}`;
      await tx`DELETE FROM free_readings WHERE user_id = ${userId}`;
      await tx`DELETE FROM free_interpretations WHERE user_id = ${userId}`;
      await tx`DELETE FROM readings WHERE user_id = ${userId}`;
      await tx`DELETE FROM reports WHERE user_id = ${userId}`;
      await tx`DELETE FROM transactions WHERE user_id = ${userId} OR email = ${email}`;
      await tx`DELETE FROM users WHERE id = ${userId}`;
      return true;
    });
    return await withDbTimeout(begin, controller);
  }
  const db = await readLocal();
  const user = db.users.find((x) => x.id === userId);
  if (!user) return false;
  db.users = db.users.filter((x) => x.id !== userId);
  db.readings = db.readings.filter((r) => r.user_id !== userId);
  db.reports = (db.reports ?? []).filter((r) => r.user_id !== userId);
  db.transactions = db.transactions.filter(
    (t) => t.user_id !== userId && t.email !== user.email
  );
  db.freeReadings = (db.freeReadings ?? []).filter((x) => x.user_id !== userId);
  db.freeInterpretations = (db.freeInterpretations ?? []).filter(
    (x) => x.user_id !== userId
  );
  delete db.codes[user.email];
  await writeLocal(db);
  return true;
}

export async function addUserCredits(userId: string, n: number): Promise<number> {
  await ensureSchema();
  if (usePostgres) {
    // GREATEST(0, ...) so a refund can never drive the balance
    // negative (Phase 1, 1.4). The local branch already clamped.
    const { rows } = await sql`UPDATE users SET credits = GREATEST(0, credits + ${n}) WHERE id = ${userId} RETURNING credits`;
    return (rows[0] as { credits: number }).credits;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new Error("User not found");
  u.credits = Math.max(0, u.credits + n);
  await writeLocal(db);
  return u.credits;
}

export async function spendUserCredits(userId: string, n: number): Promise<boolean> {
  // Phase B (R10): a negative spend would ADD credits (credits - (-5)
  // with the guard credits >= -5 passes trivially). No caller passes
  // a negative value today, but this function is exported and one
  // call site passes a computed value, so fail loudly instead of
  // minting. Both branches share this one check.
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("spendUserCredits: n must be a positive number of Oracles.");
  }
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`UPDATE users SET credits = credits - ${n} WHERE id = ${userId} AND credits >= ${n} RETURNING credits`;
    return rows.length > 0;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (!u || u.credits < n) return false;
  u.credits -= n;
  await writeLocal(db);
  return true;
}

// Free Quick Insight readings (server-side, signed-in users only).
// Guests keep the existing device-local flag in src/lib/storage.ts.
export async function hasUsedFreeReading(userId: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT 1 FROM free_readings WHERE user_id = ${userId} LIMIT 1`;
    return rows.length > 0;
  }
  const db = await readLocal();
  return (db.freeReadings ?? []).some((x) => x.user_id === userId);
}

// Phase B (R7): the claim is atomic. INSERT ... ON CONFLICT DO
// NOTHING RETURNING user_id succeeds for exactly one caller: the
// return is true only when THIS call inserted the row. A concurrent
// second free use gets zero rows back (false) and must spend instead
// (or get a 402) — the callers in the AI routes apply that fallback
// once 8A A2 lands (see the decision log; the route files are
// excluded until then). The old void return let two concurrent free
// uses both succeed.
export async function markFreeReadingUsed(userId: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`INSERT INTO free_readings (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING RETURNING user_id`;
    return rows.length > 0;
  }
  const db = await readLocal();
  const list = db.freeReadings ?? (db.freeReadings = []);
  if (!list.some((x) => x.user_id === userId)) {
    list.push({ user_id: userId, used_at: new Date().toISOString() });
    await writeLocal(db);
    return true;
  }
  return false;
}

// Free chart interpretations (server-side, signed-in users only).
// Guests keep the existing device-local flags in src/lib/storage.ts.
export async function hasUsedFreeInterpretation(userId: string, system: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT 1 FROM free_interpretations WHERE user_id = ${userId} AND system = ${system} LIMIT 1`;
    return rows.length > 0;
  }
  const db = await readLocal();
  return (db.freeInterpretations ?? []).some((x) => x.user_id === userId && x.system === system);
}

export async function markFreeInterpretationUsed(userId: string, system: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`INSERT INTO free_interpretations (user_id, system) VALUES (${userId}, ${system}) ON CONFLICT DO NOTHING RETURNING user_id`;
    return rows.length > 0;
  }
  const db = await readLocal();
  const list = db.freeInterpretations ?? (db.freeInterpretations = []);
  if (!list.some((x) => x.user_id === userId && x.system === system)) {
    list.push({ user_id: userId, system, used_at: new Date().toISOString() });
    await writeLocal(db);
    return true;
  }
  return false;
}

// Auth codes
export async function storeAuthCode(email: string, codeHash: string, expiresAt: Date) {
  await ensureSchema();
  if (usePostgres) {
    await sql`INSERT INTO auth_codes (email, code_hash, expires_at, attempts)
      VALUES (${email}, ${codeHash}, ${expiresAt.toISOString()}, 0)
      ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`;
    return;
  }
  const db = await readLocal();
  db.codes[email] = { code_hash: codeHash, expires_at: expiresAt.toISOString(), attempts: 0 };
  await writeLocal(db);
}

export async function getAuthCode(email: string) {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT code_hash, expires_at, attempts FROM auth_codes WHERE email = ${email} LIMIT 1`;
    return (rows[0] as { code_hash: string; expires_at: string; attempts: number } | undefined) ?? null;
  }
  const db = await readLocal();
  return db.codes[email] ?? null;
}

export async function bumpAuthCodeAttempts(email: string) {
  await ensureSchema();
  if (usePostgres) {
    await sql`UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ${email}`;
    return;
  }
  const db = await readLocal();
  if (db.codes[email]) {
    db.codes[email].attempts += 1;
    await writeLocal(db);
  }
}

export async function deleteAuthCode(email: string) {
  await ensureSchema();
  if (usePostgres) {
    await sql`DELETE FROM auth_codes WHERE email = ${email}`;
    return;
  }
  const db = await readLocal();
  delete db.codes[email];
  await writeLocal(db);
}

// Transactions
export async function createTransaction(t: {
  userId: string | null;
  email: string;
  packType: string;
  amount: number;
  readings: number;
}): Promise<DbTransaction> {
  await ensureSchema();
  const row: DbTransaction = {
    id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    user_id: t.userId,
    email: t.email,
    pack_type: t.packType,
    amount: t.amount,
    readings: t.readings,
    created_at: new Date().toISOString(),
  };
  if (usePostgres) {
    await sql`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
      VALUES (${row.id}, ${row.user_id}, ${row.email}, ${row.pack_type}, ${row.amount}, ${row.readings}, NOW())`;
    return row;
  }
  const db = await readLocal();
  db.transactions.unshift(row);
  await writeLocal(db);
  return row;
}

export async function listTransactions(userId: string): Promise<DbTransaction[]> {  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM transactions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`;
    return rows as DbTransaction[];
  }
  const db = await readLocal();
  return db.transactions.filter((t) => t.user_id === userId).slice(0, 50);
}

/** The fulfillment row for an order, excluding refund rows. */
async function findFulfillmentByOrderId(orderId: string): Promise<DbTransaction | null> {
  if (!orderId) return null;
  await ensureSchema();
  const marker = `lemonsqueezy:${orderId})`;
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM transactions WHERE pack_type LIKE ${"%" + marker + "%"} AND pack_type NOT LIKE ${"%:refund%"} ORDER BY created_at ASC LIMIT 1`;
    return (rows[0] as DbTransaction) ?? null;
  }
  const db = await readLocal();
  return db.transactions.find((t) => t.pack_type.includes(marker) && !t.pack_type.includes(":refund")) ?? null;
}

/** Short unique transaction id. */
function newTransactionId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type FulfillOrderArgs = {
  userId: string;
  email: string;
  packType: string;
  amount: number;
  readings: number;
  orderId: string;
};

/** Postgres branch of fulfillOrder: lock the user, dedupe, insert, grant. One transaction. */
async function fulfillOrderPostgres(
  args: FulfillOrderArgs,
  row: DbTransaction
): Promise<{ transaction: DbTransaction | null; credits: number; duplicate: boolean }> {
  if (!pg) throw new Error("Database not configured");
  const controller = new AbortController();
  const begin = pg.begin(async (rawTx) => {
    const tx = txWithSignal(rawTx, controller.signal);
    // Phase 6 (G2 finding): check the lock result. The old code
    // discarded it, so an unknown user failed later at the INSERT
    // with a raw foreign-key error instead of this clear message.
    // Either way the transaction rolls back with nothing written.
    const locked = await tx`SELECT id FROM users WHERE id = ${args.userId} FOR UPDATE`;
    if (locked.length === 0) throw new Error("User not found during fulfillment");
    // After a refund, a redelivered order_created is treated as a duplicate
    // and is not re-granted (the duplicate check does not exclude refund rows).
    const dup = await tx`SELECT id FROM transactions WHERE order_id = ${args.orderId} LIMIT 1`;
    if (dup.length > 0) {
      const cur = await tx`SELECT credits FROM users WHERE id = ${args.userId}`;
      return {
        transaction: null,
        credits: (cur[0] as { credits: number } | undefined)?.credits ?? 0,
        duplicate: true,
      };
    }
    // Phase G follow-up: a refund recorded before the fulfilment
    // (revokeOrder's pending-refund marker, a zero-value refund
    // row) also blocks the grant. The duplicate check above only
    // matches the fulfilment row's pack_type shape; the marker
    // carries the :refund shape, so it needs its own check. The
    // :refund suffix anchors the pattern, so order-123 never
    // matches order-1234's marker.
    const refundMarker = `lemonsqueezy:${args.orderId}:refund`;
    const refunded = await tx`SELECT id FROM transactions WHERE pack_type LIKE ${"%" + refundMarker + "%"} LIMIT 1`;
    if (refunded.length > 0) {
      const cur = await tx`SELECT credits FROM users WHERE id = ${args.userId}`;
      return {
        transaction: null,
        credits: (cur[0] as { credits: number } | undefined)?.credits ?? 0,
        duplicate: true,
      };
    }
    await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, order_id, created_at)
      VALUES (${row.id}, ${row.user_id}, ${row.email}, ${row.pack_type}, ${row.amount}, ${row.readings}, ${args.orderId}, NOW())`;
    const upd = await tx`UPDATE users SET credits = credits + ${args.readings} WHERE id = ${args.userId} RETURNING credits`;
    if (upd.length === 0) throw new Error("User not found during fulfillment");
    return { transaction: row, credits: (upd[0] as { credits: number }).credits, duplicate: false };
  });
  return await withDbTimeout(begin, controller);
}

/** Local-file branch of fulfillOrder (dev only). */
async function fulfillOrderLocal(
  args: FulfillOrderArgs,
  row: DbTransaction
): Promise<{ transaction: DbTransaction | null; credits: number; duplicate: boolean }> {
  const marker = `lemonsqueezy:${args.orderId})`;
  const db = await readLocal();
  // After a refund, a redelivered order_created is treated as a duplicate
  // and is not re-granted (the duplicate check does not exclude refund rows).
  // Local files written before AF-004 have no order_id, so the old
  // pack_type marker still counts as a duplicate too.
  if (db.transactions.some((t) => t.order_id === args.orderId || t.pack_type.includes(marker))) {
    const u = db.users.find((x) => x.id === args.userId);
    return { transaction: null, credits: u?.credits ?? 0, duplicate: true };
  }
  // Phase G follow-up: same pending-refund marker check as the
  // Postgres branch above.
  if (db.transactions.some((t) => t.pack_type.includes(`lemonsqueezy:${args.orderId}:refund`))) {
    const u = db.users.find((x) => x.id === args.userId);
    return { transaction: null, credits: u?.credits ?? 0, duplicate: true };
  }
  const u = db.users.find((x) => x.id === args.userId);
  if (!u) throw new Error("User not found during fulfillment");
  db.transactions.unshift(row);
  u.credits = Math.max(0, u.credits + args.readings);
  await writeLocal(db);
  return { transaction: row, credits: u.credits, duplicate: false };
}

/**
 * Phase 1 (1.4): fulfill a paid order atomically — the transaction row
 * and the credit grant commit together or not at all, in one
 * sql.begin transaction. The user row is locked first, so two
 * concurrent deliveries of the same webhook cannot both pass the
 * duplicate check and double-grant. Returns duplicate: true when
 * this order was already fulfilled (Lemon Squeezy retries webhooks),
 * or when a refund was already recorded for it (see revokeOrder's
 * pending-refund marker): a refunded order is never re-granted.
 */
export async function fulfillOrder(args: FulfillOrderArgs): Promise<{ transaction: DbTransaction | null; credits: number; duplicate: boolean }> {
  await ensureSchema();
  const row: DbTransaction = {
    id: newTransactionId(),
    user_id: args.userId,
    email: args.email,
    pack_type: args.packType,
    amount: args.amount,
    readings: args.readings,
    created_at: new Date().toISOString(),
    order_id: args.orderId,
  };
  if (usePostgres) return fulfillOrderPostgres(args, row);
  return fulfillOrderLocal(args, row);
}

/** Refund arrived before any fulfilment: record the zero-value pending-refund marker. */
async function recordPendingRefund(refundMarker: string, email: string): Promise<void> {
  const markerRow: DbTransaction = {
    id: newTransactionId(),
    user_id: null,
    email,
    pack_type: `refund (${refundMarker})`,
    amount: 0,
    readings: 0,
    created_at: new Date().toISOString(),
  };
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    // One atomic statement: concurrent refunds for the same
    // never-fulfilled order insert exactly one marker row.
    const controller = new AbortController();
    const begin = pg.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
        SELECT ${markerRow.id}, ${markerRow.user_id}, ${markerRow.email}, ${markerRow.pack_type}, 0, 0, NOW()
        WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE pack_type LIKE ${"%" + refundMarker + ")%"})`;
    });
    await withDbTimeout(begin, controller);
    return;
  }
  const db = await readLocal();
  if (!db.transactions.some((t) => t.pack_type.includes(`${refundMarker})`))) {
    db.transactions.unshift(markerRow);
    await writeLocal(db);
  }
}

/** Postgres branch of revokeOrder: lock the user, dedupe the refund, record it, take back the grant. */
async function revokeOrderPostgres(
  orig: DbTransaction,
  userId: string,
  refundRow: DbTransaction,
  refundMarker: string
): Promise<{ revoked: boolean; readings: number }> {
  if (!pg) throw new Error("Database not configured");
  const controller = new AbortController();
  const begin = pg.begin(async (rawTx) => {
    const tx = txWithSignal(rawTx, controller.signal);
    // Phase 6 (G2 finding): same guard as fulfillOrder — fail with
    // a clear error instead of a foreign-key error at the INSERT.
    const locked = await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (locked.length === 0) throw new Error("User not found during refund");
    const existing = await tx`SELECT id FROM transactions WHERE pack_type LIKE ${"%" + refundMarker + ")%"} LIMIT 1`;
    if (existing.length > 0) return { revoked: false, readings: orig.readings };
    await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
      VALUES (${refundRow.id}, ${refundRow.user_id}, ${refundRow.email}, ${refundRow.pack_type}, ${refundRow.amount}, ${refundRow.readings}, NOW())`;
    await tx`UPDATE users SET credits = GREATEST(0, credits - ${orig.readings}) WHERE id = ${userId}`;
    return { revoked: true, readings: orig.readings };
  });
  return await withDbTimeout(begin, controller);
}

/** Local-file branch of revokeOrder (dev only). */
async function revokeOrderLocal(
  orig: DbTransaction,
  userId: string,
  refundRow: DbTransaction,
  refundMarker: string
): Promise<{ revoked: boolean; readings: number }> {
  const db = await readLocal();
  if (db.transactions.some((t) => t.pack_type.includes(`${refundMarker})`))) {
    return { revoked: false, readings: orig.readings };
  }
  const u = db.users.find((x) => x.id === userId);
  if (!u) return { revoked: false, readings: orig.readings };
  db.transactions.unshift(refundRow);
  u.credits = Math.max(0, u.credits - orig.readings);
  await writeLocal(db);
  return { revoked: true, readings: orig.readings };
}

/**
 * Phase 1 (1.4): revoke a refunded order's grant, idempotently.
 * Removes exactly the readings the original fulfillment granted,
 * never drives the balance below 0 (GREATEST(0, ...) server-side),
 * and records a negative refund transaction so a retried refund
 * cannot revoke twice. Returns revoked: false when there was no
 * fulfillment to revoke, or it was already revoked — the caller
 * logs that; it is not an error.
 *
 * Phase G follow-up: when there is NO fulfillment yet (the refund
 * webhook arrived before the order_created webhook), revoked is
 * still false, but the refund is NOT forgotten: a zero-value refund
 * row (the pending-refund marker, same pack_type shape as a normal
 * refund row, amount/readings 0 because nothing was granted to
 * take back) is recorded, so a later fulfilment sees it and grants
 * nothing (fulfillOrder checks for it). Without the marker, the
 * later order_created would grant unrevoked credits. The marker
 * carries no user (no fulfilment to link it to), so its user_id is
 * null and it never appears in any user's transaction list; the
 * email is the refund payload's when the webhook knows it.
 * The optional email parameter is that payload email; callers that
 * do not have one pass nothing and the marker records "".
 */
export async function revokeOrder(orderId: string, email = ""): Promise<{ revoked: boolean; readings: number }> {
  await ensureSchema();
  if (!orderId) return { revoked: false, readings: 0 };
  const refundMarker = `lemonsqueezy:${orderId}:refund`;
  const orig = await findFulfillmentByOrderId(orderId);
  if (!orig) {
    await recordPendingRefund(refundMarker, email);
    return { revoked: false, readings: 0 };
  }
  let userId = orig.user_id;
  if (!userId) {
    const u = await getUserByEmail(orig.email);
    userId = u?.id ?? null;
  }
  if (!userId) return { revoked: false, readings: orig.readings };
  const refundRow: DbTransaction = {
    id: newTransactionId(),
    user_id: userId,
    email: orig.email,
    pack_type: `refund (${refundMarker})`,
    amount: -orig.amount,
    readings: -orig.readings,
    created_at: new Date().toISOString(),
  };
  if (usePostgres) return revokeOrderPostgres(orig, userId, refundRow, refundMarker);
  return revokeOrderLocal(orig, userId, refundRow, refundMarker);
}

// Synced readings
export async function saveReadingForUser(userId: string, reading: { id: string; [k: string]: unknown }) {
  await ensureSchema();
  if (usePostgres) {
    await sql`INSERT INTO readings (id, user_id, data, created_at)
      VALUES (${reading.id}, ${userId}, ${jsonbParam(reading)}, NOW())
      ON CONFLICT (id) DO NOTHING`;
    return;
  }
  const db = await readLocal();
  if (!db.readings.some((r) => r.id === reading.id)) {
    db.readings.unshift({
      id: reading.id,
      user_id: userId,
      data: reading,
      created_at: new Date().toISOString(),
    });
    await writeLocal(db);
  }
}

// M1.1: merge a patch into a stored reading's JSON. The server copy
// previously only ever inserted (ON CONFLICT DO NOTHING), so an edit
// like a chosen next step would silently stay stale server-side.
export async function updateReadingForUser(
  userId: string,
  id: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`UPDATE readings
      SET data = data || ${jsonbParam(patch)}
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id`;
    return rows.length > 0;
  }
  const db = await readLocal();
  const row = db.readings.find((r) => r.id === id && r.user_id === userId);
  if (!row) return false;
  row.data = { ...(row.data as Record<string, unknown>), ...patch };
  await writeLocal(db);
  return true;
}

// M2.2: delete a stored reading, scoped to the owning user.
export async function deleteReadingForUser(userId: string, id: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`DELETE FROM readings
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id`;
    return rows.length > 0;
  }
  const db = await readLocal();
  const next = db.readings.filter((r) => !(r.id === id && r.user_id === userId));
  if (next.length === db.readings.length) return false;
  db.readings = next;
  await writeLocal(db);
  return true;
}

// Phase 6 (N7): append a follow-up to a stored reading AND spend its
// Oracle (when not free) in ONE Postgres transaction. The old route
// read the followUps array, generated, spent, then updated — two
// concurrent follow-ups could read the same array and last-write-wins,
// and the spend happened before an update whose boolean return was
// unchecked (credit spent, follow-up lost). Here the reading row is
// locked first, the 3-follow-up cap is re-checked inside the
// transaction, the spend is conditional (credits >= cost), and the
// append is a single jsonb operation — so a concurrent second
// follow-up either waits for the lock and then fails the cap, or
// fails the spend, and never loses a credit.
export interface FollowUpAppendResult {
  ok: boolean;
  reason?: "not-found" | "limit" | "insufficient";
  followUps?: unknown[];
  free?: boolean;
}

export async function appendFollowUpWithSpend(
  userId: string,
  readingId: string,
  followUp: Record<string, unknown>,
  cost: number,
  maxFollowUps = 3,
  claimedFree = false
): Promise<FollowUpAppendResult> {
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    const controller = new AbortController();
    const begin = pg.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      const rows = await tx`SELECT data FROM readings WHERE id = ${readingId} AND user_id = ${userId} FOR UPDATE`;
      if (rows.length === 0) return { ok: false, reason: "not-found" as const };
      const data = (rows[0] as { data: { followUps?: unknown[] } }).data;
      const existing = Array.isArray(data.followUps) ? data.followUps : [];
      if (existing.length >= maxFollowUps) return { ok: false, reason: "limit" as const };
      let effectiveCost = cost;
      let followUpToStore = followUp;
      if (claimedFree && existing.length > 0) {
        effectiveCost = 1;
        followUpToStore = { ...followUp, free: false };
      }
      if (effectiveCost > 0) {
        const spent = await tx`UPDATE users SET credits = credits - ${effectiveCost} WHERE id = ${userId} AND credits >= ${effectiveCost} RETURNING credits`;
        if (spent.length === 0) return { ok: false, reason: "insufficient" as const };
      }
      const updated = await tx`
        UPDATE readings
        SET data = jsonb_set(data, '{followUps}', COALESCE(data->'followUps', '[]'::jsonb) || ${jsonbParam(followUpToStore)})
        WHERE id = ${readingId} AND user_id = ${userId}
        RETURNING data->'followUps' AS follow_ups`;
      const followUps =
        (updated[0] as { follow_ups?: unknown[] } | undefined)?.follow_ups ??
        [...existing, followUpToStore];
      return { ok: true, followUps, free: effectiveCost === 0 };
    });
    return await withDbTimeout(begin, controller);
  }
  // Local JSON branch: single-process dev store, no concurrent writers
  // in practice. Keep the same ordering (check cap, spend, append);
  // the spend and the append happen in one read/modify/write here.
  const db = await readLocal();
  const row = db.readings.find((r) => r.id === readingId && r.user_id === userId);
  if (!row) return { ok: false, reason: "not-found" };
  const data = row.data as { followUps?: unknown[] };
  const existing = Array.isArray(data.followUps) ? data.followUps : [];
  if (existing.length >= maxFollowUps) return { ok: false, reason: "limit" };
  let effectiveCost = cost;
  let followUpToStore = followUp;
  if (claimedFree && existing.length > 0) {
    effectiveCost = 1;
    followUpToStore = { ...followUp, free: false };
  }
  const user = db.users.find((x) => x.id === userId);
  if (effectiveCost > 0) {
    if (!user || user.credits < effectiveCost) return { ok: false, reason: "insufficient" };
    user.credits -= effectiveCost;
  }
  const next = [...existing, followUpToStore];
  row.data = { ...data, followUps: next };
  await writeLocal(db);
  return { ok: true, followUps: next, free: effectiveCost === 0 };
}

// M2.1: fetch a single reading by id, scoped to the owning user.
export async function getReadingForUser(userId: string, id: string): Promise<unknown | null> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT data FROM readings WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
    return rows.length > 0 ? (rows[0] as { data: unknown }).data : null;
  }
  const db = await readLocal();
  const row = db.readings.find((r) => r.id === id && r.user_id === userId);
  return row ? row.data : null;
}

export async function listReadingsForUser(userId: string): Promise<unknown[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT data FROM readings WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`;
    return rows.map((r) => (r as { data: unknown }).data);
  }
  const db = await readLocal();
  return db.readings.filter((r) => r.user_id === userId).map((r) => r.data).slice(0, 100);
}

// M4.1: keep-forever reports. Same storage shape as readings, but a
// separate table so reports are never mixed into the journal. Like
// readings, a report is inserted once and never updated in place;
// the local branch tolerates files written before M4.1 (no key).
export async function saveReportForUser(userId: string, report: { id: string; [k: string]: unknown }) {
  await ensureSchema();
  if (usePostgres) {
    await sql`INSERT INTO reports (id, user_id, data, created_at)
      VALUES (${report.id}, ${userId}, ${jsonbParam(report)}, NOW())
      ON CONFLICT (id) DO NOTHING`;
    return;
  }
  const db = await readLocal();
  const list = db.reports ?? [];
  if (!list.some((r) => r.id === report.id)) {
    list.unshift({
      id: report.id,
      user_id: userId,
      data: report,
      created_at: new Date().toISOString(),
    });
    db.reports = list;
    await writeLocal(db);
  }
}

export async function getReportForUser(userId: string, id: string): Promise<unknown | null> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT data FROM reports WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
    return rows.length > 0 ? (rows[0] as { data: unknown }).data : null;
  }
  const db = await readLocal();
  const row = (db.reports ?? []).find((r) => r.id === id && r.user_id === userId);
  return row ? row.data : null;
}

export async function listReportsForUser(userId: string): Promise<unknown[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT data FROM reports WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`;
    return rows.map((r) => (r as { data: unknown }).data);
  }
  const db = await readLocal();
  return (db.reports ?? []).filter((r) => r.user_id === userId).map((r) => r.data).slice(0, 100);
}

export async function deleteReportForUser(userId: string, id: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`DELETE FROM reports
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id`;
    return rows.length > 0;
  }
  const db = await readLocal();
  const list = db.reports ?? [];
  const next = list.filter((r) => !(r.id === id && r.user_id === userId));
  if (next.length === list.length) return false;
  db.reports = next;
  await writeLocal(db);
  return true;
}

// Social proof: readings cast in the last N days
export async function countRecentReadings(days: number): Promise<number> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } =
      await sql`SELECT COUNT(*)::int AS n FROM readings WHERE created_at > NOW() - (${days}::int * INTERVAL '1 day')`;
    return (rows[0] as { n: number })?.n ?? 0;
  }
  const db = await readLocal();
  const cutoff = Date.now() - days * 86400000;
  return db.readings.filter((r) => new Date(r.created_at).getTime() > cutoff).length;
}

// Win-back: users quiet for 7+ days who have not been nudged recently
export async function getWinbackCandidates(limit = 50): Promise<DbUser[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`
      SELECT u.* FROM users u
      LEFT JOIN LATERAL (
        SELECT created_at FROM readings WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) r ON true
      WHERE (u.winback_sent_at IS NULL OR u.winback_sent_at < NOW() - INTERVAL '60 days')
        AND (r.created_at IS NULL OR r.created_at < NOW() - INTERVAL '7 days')
        AND u.created_at < NOW() - INTERVAL '7 days'
      LIMIT ${limit}`;
    return rows as DbUser[];
  }
  const db = await readLocal();
  const now = Date.now();
  const sevenDays = now - 7 * 86400000;
  const sixtyDays = now - 60 * 86400000;
  return db.users
    .filter((u) => {
      const sentAt = u.winback_sent_at ? new Date(u.winback_sent_at).getTime() : 0;
      if (sentAt > sixtyDays) return false;
      if (new Date(u.created_at).getTime() > sevenDays) return false;
      const lastReading = db.readings
        .filter((r) => r.user_id === u.id)
        .map((r) => new Date(r.created_at).getTime())
        .sort((a, b) => b - a)[0];
      return !lastReading || lastReading < sevenDays;
    })
    .slice(0, limit);
}

export async function markWinbackSent(userId: string): Promise<void> {
  await ensureSchema();
  if (usePostgres) {
    await sql`UPDATE users SET winback_sent_at = NOW() WHERE id = ${userId}`;
    return;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (u) {
    u.winback_sent_at = new Date().toISOString();
    await writeLocal(db);
  }
}
