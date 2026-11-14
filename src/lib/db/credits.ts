import { usePostgres, pg, sql, ensureSchema } from "./client";
import { readLocal, writeLocal } from "./json-store";
import { applyGrantToUser, applySpendToUser, spendFromLedgers } from "./ledgers";

/*
 * F9 (2026-11-09): credits and free-use claims.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 *
 * Phase 2 batch 2: balances are the two ledgers (monthly +
 * purchased); users.credits is their generated total. A grant here
 * is a PURCHASED grant (pack/top-up credit, never expires); monthly
 * grants go through grantMonthlyCredits in ledgers.ts. A spend takes
 * monthly first, then purchased.
 */

export async function addUserCredits(userId: string, n: number): Promise<number> {
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    // GREATEST(0, ...) so a refund can never drive the balance
    // negative (Phase 1, 1.4). The local branch already clamped.
    const rows = (await pg`UPDATE users SET purchased_credits = GREATEST(0, purchased_credits + ${n}) WHERE id = ${userId} RETURNING credits`) as Array<{
      credits: number;
    }>;
    return rows[0].credits;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new Error("User not found");
  // A negative grant clamps at 0 per ledger, like the Postgres
  // GREATEST above: apply the grant, then floor the purchased
  // ledger at 0 (the total follows).
  applyGrantToUser(u, "purchased", n);
  u.purchased_credits = Math.max(0, u.purchased_credits ?? 0);
  u.credits = (u.monthly_credits ?? 0) + (u.purchased_credits ?? 0);
  await writeLocal(db);
  return u.credits;
}

export async function spendUserCredits(userId: string, n: number): Promise<boolean> {
  // Phase B (R10): a negative spend would ADD credits (credits - (-5)
  // with the guard credits >= -5 passes trivially). No caller passes
  // a negative value today, but this function is exported and one
  // call site passes a computed value, so fail loudly instead of
  // minting. Both branches share this one check (spendFromLedgers
  // and spendFromBalances throw the same way).
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("spendUserCredits: n must be a positive number of Oracles.");
  }
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    return (await spendFromLedgers(pg, userId, n)) !== null;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (!applySpendToUser(u, n)) return false;
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
