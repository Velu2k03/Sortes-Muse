import postgres from "postgres";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

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
 * Tables: users, auth_codes, transactions, readings.
 */

export interface DbUser {
  id: string;
  email: string;
  credits: number;
  created_at: string;
  winback_sent_at?: string | null;
  password_hash?: string | null;
}

export interface DbTransaction {
  id: string;
  user_id: string | null;
  email: string;
  pack_type: string;
  amount: number;
  readings: number;
  created_at: string;
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

// postgres.js template tag returns rows directly; wrap it so the rest of
// this file keeps its existing `{ rows }` shape from @vercel/postgres.
const pg = usePostgres
  ? postgres(connectionString, {
      ssl: "require",
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : null;

async function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ rows: unknown[] }> {
  if (!pg) throw new Error("Database not configured");
  const rows = await (pg as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown[]>)(strings, ...values);
  return { rows };
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
  // Phase 1: checkout nonces (1.3). Optional for the same reason:
  // local files written before Phase 1 have no nonces key.
  nonces?: Array<{ nonce: string; email: string; pack_id: string; created_at: string; used_at: string | null }>;
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
export async function ensureSchema(): Promise<void> {
  // Phase 6 (P1a, readiness review N1): production fail-fast guard.
  // Without a database URL the data layer used to switch silently to
  // data/local-db.json — on Vercel that is per-instance ephemeral
  // storage, so accounts, credits, and reading history would be
  // written per-instance and lost on redeploy/cold start. In
  // production, refuse to run at all instead. Local development
  // keeps the JSON fallback (no URL, non-production env).
  if (!usePostgres) {
    if (process.env.NODE_ENV === "production") {
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
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS auth_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      email TEXT NOT NULL,
      pack_type TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      readings INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS readings (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // Added later (M4.1): keep-forever reports. Same shape as readings:
  // one JSON document per report, never updated in place, never
  // expiring. Birth inputs are never stored here, only positions,
  // aspects, and the interpretation.
  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // Added later: win-back tracking. IF NOT EXISTS keeps old DBs working.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS winback_sent_at TIMESTAMPTZ`;
  // Added later: password login. IF NOT EXISTS keeps old DBs working.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  // Added later (M0.1 credit authority): server-side record of each
  // signed-in user's first free chart interpretation per system, so the
  // free rule is enforced by the server instead of a device-local flag.
  await sql`
    CREATE TABLE IF NOT EXISTS free_interpretations (
      user_id TEXT NOT NULL REFERENCES users(id),
      system TEXT NOT NULL,
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, system)
    )`;
  // Added later (Phase 2, 2.1): server-side record of each signed-in
  // user's first free Quick Insight reading. Same shape as
  // free_interpretations: the FAQ promises the first Quick Insight
  // free per device, and for signed-in users the server record is
  // the enforceable half (guests keep the device-local flag, since
  // guests have no server account to charge). One row per user.
  await sql`
    CREATE TABLE IF NOT EXISTS free_readings (
      user_id TEXT NOT NULL REFERENCES users(id),
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id)
    )`;
  // Added later (Phase 1, 1.3): one-time checkout nonces. A nonce is
  // created when a checkout starts and stored in an httpOnly cookie;
  // the post-payment claim must present the matching unused nonce,
  // so knowing a paid order id alone can no longer claim someone
  // else's purchase.
  await sql`
    CREATE TABLE IF NOT EXISTS checkout_nonces (
      nonce TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at TIMESTAMPTZ
    )`;
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
    const { rows } = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
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

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await ensureSchema();
  if (usePostgres) {
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
    return;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (u) {
    u.password_hash = passwordHash;
    await writeLocal(db);
  }
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
    return await pg.begin(async (tx) => {
      const found = await tx`SELECT id, email FROM users WHERE id = ${userId} FOR UPDATE`;
      if (found.length === 0) return false;
      const email = (found[0] as { email: string }).email;
      await tx`DELETE FROM auth_codes WHERE email = ${email}`;
      await tx`DELETE FROM checkout_nonces WHERE email = ${email}`;
      await tx`DELETE FROM free_readings WHERE user_id = ${userId}`;
      await tx`DELETE FROM free_interpretations WHERE user_id = ${userId}`;
      await tx`DELETE FROM readings WHERE user_id = ${userId}`;
      await tx`DELETE FROM reports WHERE user_id = ${userId}`;
      await tx`DELETE FROM transactions WHERE user_id = ${userId} OR email = ${email}`;
      await tx`DELETE FROM users WHERE id = ${userId}`;
      return true;
    });
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
  db.nonces = (db.nonces ?? []).filter((n) => n.email !== user.email);
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

export async function markFreeReadingUsed(userId: string): Promise<void> {
  await ensureSchema();
  if (usePostgres) {
    await sql`INSERT INTO free_readings (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;
    return;
  }
  const db = await readLocal();
  const list = db.freeReadings ?? (db.freeReadings = []);
  if (!list.some((x) => x.user_id === userId)) {
    list.push({ user_id: userId, used_at: new Date().toISOString() });
    await writeLocal(db);
  }
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

export async function markFreeInterpretationUsed(userId: string, system: string): Promise<void> {
  await ensureSchema();
  if (usePostgres) {
    await sql`INSERT INTO free_interpretations (user_id, system) VALUES (${userId}, ${system}) ON CONFLICT DO NOTHING`;
    return;
  }
  const db = await readLocal();
  const list = db.freeInterpretations ?? (db.freeInterpretations = []);
  if (!list.some((x) => x.user_id === userId && x.system === system)) {
    list.push({ user_id: userId, system, used_at: new Date().toISOString() });
    await writeLocal(db);
  }
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

// Checkout nonces (Phase 1, 1.3): single-use proof that this browser
// started the checkout being claimed.
export const CHECKOUT_NONCE_TTL_MS = 2 * 60 * 60_000;

export async function createCheckoutNonce(email: string, packId: string): Promise<string> {
  await ensureSchema();
  const nonce = randomBytes(32).toString("hex");
  if (usePostgres) {
    await sql`INSERT INTO checkout_nonces (nonce, email, pack_id) VALUES (${nonce}, ${email}, ${packId})`;
    return nonce;
  }
  const db = await readLocal();
  const list = db.nonces ?? (db.nonces = []);
  list.push({ nonce, email, pack_id: packId, created_at: new Date().toISOString(), used_at: null });
  await writeLocal(db);
  return nonce;
}

/**
 * Consumes a nonce: true only when it exists, matches the email, is
 * still unused, and is under CHECKOUT_NONCE_TTL_MS old. The Postgres
 * update is atomic (one statement, one row), so two concurrent claims
 * cannot both consume the same nonce.
 */
export async function consumeCheckoutNonce(nonce: string, email: string): Promise<boolean> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`UPDATE checkout_nonces SET used_at = NOW()
      WHERE nonce = ${nonce} AND email = ${email} AND used_at IS NULL
        AND created_at > NOW() - INTERVAL '2 hours'
      RETURNING nonce`;
    return rows.length > 0;
  }
  const db = await readLocal();
  const row = (db.nonces ?? []).find((n) => n.nonce === nonce);
  if (!row || row.email !== email || row.used_at) return false;
  if (Date.now() - new Date(row.created_at).getTime() > CHECKOUT_NONCE_TTL_MS) return false;
  row.used_at = new Date().toISOString();
  await writeLocal(db);
  return true;
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
  const marker = `lemonsqueezy:${orderId}`;
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM transactions WHERE pack_type LIKE ${"%" + marker + "%"} AND pack_type NOT LIKE ${"%:refund%"} ORDER BY created_at ASC LIMIT 1`;
    return (rows[0] as DbTransaction) ?? null;
  }
  const db = await readLocal();
  return db.transactions.find((t) => t.pack_type.includes(marker) && !t.pack_type.includes(":refund")) ?? null;
}

/**
 * Phase 1 (1.4): fulfill a paid order atomically — the transaction row
 * and the credit grant commit together or not at all, in one
 * sql.begin transaction. The user row is locked first, so two
 * concurrent deliveries of the same webhook cannot both pass the
 * duplicate check and double-grant. Returns duplicate: true when
 * this order was already fulfilled (Lemon Squeezy retries webhooks).
 */
export async function fulfillOrder(args: {
  userId: string;
  email: string;
  packType: string;
  amount: number;
  readings: number;
  orderId: string;
}): Promise<{ transaction: DbTransaction | null; credits: number; duplicate: boolean }> {
  await ensureSchema();
  const marker = `lemonsqueezy:${args.orderId}`;
  const row: DbTransaction = {
    id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    user_id: args.userId,
    email: args.email,
    pack_type: args.packType,
    amount: args.amount,
    readings: args.readings,
    created_at: new Date().toISOString(),
  };
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    return await pg.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id = ${args.userId} FOR UPDATE`;
      const dup = await tx`SELECT id FROM transactions WHERE pack_type LIKE ${"%" + marker + "%"} LIMIT 1`;
      if (dup.length > 0) {
        const cur = await tx`SELECT credits FROM users WHERE id = ${args.userId}`;
        return {
          transaction: null,
          credits: (cur[0] as { credits: number } | undefined)?.credits ?? 0,
          duplicate: true,
        };
      }
      await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
        VALUES (${row.id}, ${row.user_id}, ${row.email}, ${row.pack_type}, ${row.amount}, ${row.readings}, NOW())`;
      const upd = await tx`UPDATE users SET credits = credits + ${args.readings} WHERE id = ${args.userId} RETURNING credits`;
      if (upd.length === 0) throw new Error("User not found during fulfillment");
      return { transaction: row, credits: (upd[0] as { credits: number }).credits, duplicate: false };
    });
  }
  const db = await readLocal();
  if (db.transactions.some((t) => t.pack_type.includes(marker))) {
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
 * Phase 1 (1.4): revoke a refunded order's grant, idempotently.
 * Removes exactly the readings the original fulfillment granted,
 * never drives the balance below 0 (GREATEST(0, ...) server-side),
 * and records a negative refund transaction so a retried refund
 * cannot revoke twice. Returns revoked: false when there was no
 * fulfillment to revoke, or it was already revoked — the caller
 * logs that; it is not an error.
 */
export async function revokeOrder(orderId: string): Promise<{ revoked: boolean; readings: number }> {
  await ensureSchema();
  if (!orderId) return { revoked: false, readings: 0 };
  const refundMarker = `lemonsqueezy:${orderId}:refund`;
  const orig = await findFulfillmentByOrderId(orderId);
  if (!orig) return { revoked: false, readings: 0 };
  let userId = orig.user_id;
  if (!userId) {
    const u = await getUserByEmail(orig.email);
    userId = u?.id ?? null;
  }
  if (!userId) return { revoked: false, readings: orig.readings };
  const refundRow: DbTransaction = {
    id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    email: orig.email,
    pack_type: `refund (${refundMarker})`,
    amount: -orig.amount,
    readings: -orig.readings,
    created_at: new Date().toISOString(),
  };
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    return await pg.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const existing = await tx`SELECT id FROM transactions WHERE pack_type LIKE ${"%" + refundMarker + "%"} LIMIT 1`;
      if (existing.length > 0) return { revoked: false, readings: orig.readings };
      await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
        VALUES (${refundRow.id}, ${refundRow.user_id}, ${refundRow.email}, ${refundRow.pack_type}, ${refundRow.amount}, ${refundRow.readings}, NOW())`;
      await tx`UPDATE users SET credits = GREATEST(0, credits - ${orig.readings}) WHERE id = ${userId}`;
      return { revoked: true, readings: orig.readings };
    });
  }
  const db = await readLocal();
  if (db.transactions.some((t) => t.pack_type.includes(refundMarker))) {
    return { revoked: false, readings: orig.readings };
  }
  const u = db.users.find((x) => x.id === userId);
  if (!u) return { revoked: false, readings: orig.readings };
  db.transactions.unshift(refundRow);
  u.credits = Math.max(0, u.credits - orig.readings);
  await writeLocal(db);
  return { revoked: true, readings: orig.readings };
}

// Synced readings
export async function saveReadingForUser(userId: string, reading: { id: string; [k: string]: unknown }) {
  await ensureSchema();
  if (usePostgres) {
    await sql`INSERT INTO readings (id, user_id, data, created_at)
      VALUES (${reading.id}, ${userId}, ${JSON.stringify(reading)}::jsonb, NOW())
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
      SET data = data || ${JSON.stringify(patch)}::jsonb
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
      VALUES (${report.id}, ${userId}, ${JSON.stringify(report)}::jsonb, NOW())
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
