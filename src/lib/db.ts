import postgres from "postgres";
import { promises as fs } from "fs";
import path from "path";

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
export async function ensureSchema(): Promise<void> {
  if (!usePostgres || schemaReady) return;
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

export async function addUserCredits(userId: string, n: number): Promise<number> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`UPDATE users SET credits = credits + ${n} WHERE id = ${userId} RETURNING credits`;
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

/** Webhook idempotency: has this Lemon Squeezy order been fulfilled already? */
export async function findTransactionByOrderId(orderId: string): Promise<DbTransaction | null> {
  if (!orderId) return null;
  await ensureSchema();
  const marker = `lemonsqueezy:${orderId}`;
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM transactions WHERE pack_type LIKE ${"%" + marker + "%"} LIMIT 1`;
    return (rows[0] as DbTransaction) ?? null;
  }
  const db = await readLocal();
  return db.transactions.find((t) => t.pack_type.includes(marker)) ?? null;
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
