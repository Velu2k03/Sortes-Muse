import { usePostgres, sql, ensureSchema } from "./client";
import { readLocal, writeLocal } from "./json-store";
import type { DbUser } from "./types";

/*
 * F9 (2026-11-09): social-proof count and win-back.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

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
// and have not opted out (Batch 5.3, migration 012).
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
        AND NOT COALESCE(u.winback_opted_out, FALSE)
      LIMIT ${limit}`;
    return rows as DbUser[];
  }
  const db = await readLocal();
  const now = Date.now();
  const sevenDays = now - 7 * 86400000;
  const sixtyDays = now - 60 * 86400000;
  return db.users
    .filter((u) => {
      if (u.winback_opted_out) return false;
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

// Batch 5.3: set the win-back opt-out flag. Used by the account toggle
// and the one-click unsubscribe link.
export async function setWinbackOptedOut(userId: string, optedOut: boolean): Promise<void> {
  await ensureSchema();
  if (usePostgres) {
    await sql`UPDATE users SET winback_opted_out = ${optedOut} WHERE id = ${userId}`;
    return;
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (u) {
    u.winback_opted_out = optedOut;
    await writeLocal(db);
  }
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
