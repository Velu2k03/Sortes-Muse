import { usePostgres, pg, sql, jsonbParam, ensureSchema, txWithSignal } from "./client";
import { readLocal, writeLocal } from "./json-store";
import { withDbTimeout } from "../db-timeout";
import { assertUuid, IdTakenError } from "../ids";

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

// Item 3: spend the Oracle (or claim the first free Quick Insight) AND
// write the reading row in ONE transaction, so a paid reading can never
// be lost when the tab closes before the client save. Mirrors the old
// route logic: tryFree claims the free use atomically; losing the race
// falls back to a 1-Oracle spend; insufficient credits writes nothing.
// Batch D (B4): chart interpretations are saved as journal readings through
// the same transaction; `freeSystem` makes the free claim target the
// per-system free_interpretations record instead of free_readings.
export async function saveReadingWithSpend(
  userId: string,
  reading: { id: string; free: boolean; [k: string]: unknown },
  tryFree: boolean,
  freeSystem?: string
): Promise<{ ok: boolean; free: boolean; existing?: boolean; conflict?: boolean }> {
  assertUuid(reading.id);
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    const controller = new AbortController();
    const begin = pg.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      // Point 1: idempotent replay. A retry with the same client id finds
      // the committed row and spends nothing more.
      const prior = await tx`SELECT data FROM readings WHERE id = ${reading.id} AND user_id = ${userId}`;
      if (prior.length > 0) {
        return { ok: true, free: !!(prior[0] as { data: { free?: boolean } }).data.free, existing: true };
      }
      let free = false;
      if (tryFree) {
        const c = freeSystem
          ? await tx`INSERT INTO free_interpretations (user_id, system) VALUES (${userId}, ${freeSystem}) ON CONFLICT DO NOTHING RETURNING user_id`
          : await tx`INSERT INTO free_readings (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING RETURNING user_id`;
        free = c.length > 0;
      }
      if (!free) {
        const spent = await tx`UPDATE users SET credits = credits - 1 WHERE id = ${userId} AND credits >= 1 RETURNING credits`;
        if (spent.length === 0) return { ok: false, free: false };
      }
      const data = { ...reading, free };
      const inserted = await tx`INSERT INTO readings (id, user_id, data, created_at)
        VALUES (${reading.id}, ${userId}, ${jsonbParam(data)}, NOW())
        ON CONFLICT (id) DO NOTHING RETURNING id`;
      // Point 2: 0 rows means the id was taken (lost a race, or another
      // user's id). Throw so the spend / free claim rolls back with it.
      if (inserted.length === 0) {
        const owner = await tx`SELECT user_id FROM readings WHERE id = ${reading.id}`;
        throw new IdTakenError((owner[0] as { user_id: string } | undefined)?.user_id === userId);
      }
      return { ok: true, free };
    });
    try {
      return await withDbTimeout(begin, controller);
    } catch (err) {
      if (!(err instanceof IdTakenError)) throw err;
      // Another user's id: conflict, nothing spent (rolled back).
      if (!err.sameUser) return { ok: false, free: false, conflict: true };
      // Lost a race with our own parallel attempt: return the winner's row.
      const { rows } = await sql`SELECT data FROM readings WHERE id = ${reading.id} AND user_id = ${userId}`;
      if (rows.length === 0) throw err;
      return { ok: true, free: !!(rows[0] as { data: { free?: boolean } }).data.free, existing: true };
    }
  }
  const db = await readLocal();
  const prior = db.readings.find((r) => r.id === reading.id && r.user_id === userId);
  if (prior) return { ok: true, free: !!(prior.data as { free?: boolean }).free, existing: true };
  if (db.readings.some((r) => r.id === reading.id)) return { ok: false, free: false, conflict: true };
  let free = false;
  if (tryFree && freeSystem) {
    const list = db.freeInterpretations ?? (db.freeInterpretations = []);
    if (!list.some((x) => x.user_id === userId && x.system === freeSystem)) {
      list.push({ user_id: userId, system: freeSystem, used_at: new Date().toISOString() });
      free = true;
    }
  } else if (tryFree) {
    const list = db.freeReadings ?? (db.freeReadings = []);
    if (!list.some((x) => x.user_id === userId)) {
      list.push({ user_id: userId, used_at: new Date().toISOString() });
      free = true;
    }
  }
  if (!free) {
    const u = db.users.find((x) => x.id === userId);
    if (!u || u.credits < 1) return { ok: false, free: false };
    u.credits -= 1;
  }
  db.readings.unshift({
    id: reading.id,
    user_id: userId,
    data: { ...reading, free },
    created_at: new Date().toISOString(),
  });
  await writeLocal(db);
  return { ok: true, free };
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
  reason?: "not-found" | "limit" | "insufficient" | "mismatch";
  followUps?: unknown[];
  free?: boolean;
  /** Batch 1 (C2): true when a follow-up with this attempt id was
      already stored, so the caller replays it instead of appending. */
  replayed?: boolean;
}

export async function appendFollowUpWithSpend(
  userId: string,
  readingId: string,
  followUp: Record<string, unknown>,
  cost: number,
  maxFollowUps = 3,
  claimedFree = false,
  /** Batch 1 (C2): client-minted attempt id; a retry with the same id
      replays the saved follow-up, never appends or spends twice. */
  followUpId?: string
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
      // Batch 1 (C2): replay. The row is locked, so a concurrent
      // duplicate attempt waits here and then finds the saved row.
      // The id is bound to the question: the same id with a different
      // question is a client error, not a replay.
      if (followUpId) {
        const saved = existing.find(
          (f) => (f as { id?: unknown }).id === followUpId
        ) as { free?: boolean; question?: string } | undefined;
        if (saved) {
          if (saved.question !== (followUp as { question?: string }).question) {
            return { ok: false, reason: "mismatch" as const };
          }
          return { ok: true, replayed: true, followUps: existing, free: saved.free ?? false };
        }
      }
      if (existing.length >= maxFollowUps) return { ok: false, reason: "limit" as const };
      let effectiveCost = cost;
      let followUpToStore: Record<string, unknown> = followUpId
        ? { ...followUp, id: followUpId }
        : followUp;
      if (claimedFree && existing.length > 0) {
        effectiveCost = 1;
        followUpToStore = { ...followUpToStore, free: false };
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
  // Batch 1 (C2): replay, same as the Postgres branch.
  if (followUpId) {
    const saved = existing.find(
      (f) => (f as { id?: unknown }).id === followUpId
    ) as { free?: boolean; question?: string } | undefined;
    if (saved) {
      if (saved.question !== (followUp as { question?: string }).question) {
        return { ok: false, reason: "mismatch" };
      }
      return { ok: true, replayed: true, followUps: existing, free: saved.free ?? false };
    }
  }
  if (existing.length >= maxFollowUps) return { ok: false, reason: "limit" };
  let effectiveCost = cost;
  let followUpToStore: Record<string, unknown> = followUpId
    ? { ...followUp, id: followUpId }
    : followUp;
  if (claimedFree && existing.length > 0) {
    effectiveCost = 1;
    followUpToStore = { ...followUpToStore, free: false };
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
