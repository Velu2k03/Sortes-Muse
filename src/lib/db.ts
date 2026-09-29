import { sql } from "@vercel/postgres";
import { promises as fs } from "fs";
import path from "path";

/**
 * Database layer.
 * - Production: Vercel Postgres (or any Postgres) via POSTGRES_URL / DATABASE_URL.
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

const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

interface LocalDb {
  users: DbUser[];
  codes: Record<string, { code_hash: string; expires_at: string; attempts: number }>;
  transactions: DbTransaction[];
  readings: Array<{ id: string; user_id: string; data: unknown; created_at: string }>;
}

async function readLocal(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf8");
    return JSON.parse(raw) as LocalDb;
  } catch {
    return { users: [], codes: {}, transactions: [], readings: [] };
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
  schemaReady = true;
}

function uid(): string {
  return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Users ----
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
    await sql`INSERT INTO users (id, email, credits, created_at) VALUES (${user.id}, ${user.email}, 0, NOW()) ON CONFLICT (email) DO NOTHING`;
    return (await getUserByEmail(email)) as DbUser;
  }
  const db = await readLocal();
  const existing = db.users.find((u) => u.email === email);
  if (existing) return existing;
  db.users.push(user);
  await writeLocal(db);
  return user;
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

// ---- Auth codes ----
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

// ---- Transactions ----
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

// ---- Synced readings ----
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

export async function listReadingsForUser(userId: string): Promise<unknown[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT data FROM readings WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`;
    return rows.map((r) => (r as { data: unknown }).data);
  }
  const db = await readLocal();
  return db.readings.filter((r) => r.user_id === userId).map((r) => r.data).slice(0, 100);
}
