import { usePostgres, pg, sql, sqlWithLabel, uid, ensureSchema, txWithSignal } from "./client";
import { readLocal, writeLocal } from "./json-store";
import type { DbUser } from "./types";
import { withDbTimeout } from "../db-timeout";

/*
 * F9 (2026-11-09): users.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

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
