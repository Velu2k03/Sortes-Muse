import { usePostgres, pg, sql, jsonbParam, ensureSchema, txWithSignal } from "./client";
import { readLocal, writeLocal } from "./json-store";
import { withDbTimeout } from "../db-timeout";

/*
 * F9 (2026-11-09): synced readings and follow-ups.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

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
