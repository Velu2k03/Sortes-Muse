import { usePostgres, pg, sql, jsonbParam, ensureSchema, txWithSignal } from "./client";
import { readLocal, writeLocal } from "./json-store";
import { withDbTimeout } from "../db-timeout";
import { assertUuid, IdTakenError } from "../ids";

/*
 * F9 (2026-11-09): keep-forever reports.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

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

// Batch D (B4): spend the report's 1 Oracle AND insert the report row in ONE
// transaction (same shape as saveReadingWithSpend, no free claim: reports
// are always 1 Oracle). Closing the tab can no longer lose a paid report;
// insufficient credits writes nothing. The later client save posts the same
// id and is a no-op (ON CONFLICT DO NOTHING).
export async function saveReportWithSpend(
  userId: string,
  report: { id: string; [k: string]: unknown }
): Promise<{ ok: boolean; existing?: boolean; conflict?: boolean }> {
  assertUuid(report.id);
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    const controller = new AbortController();
    const begin = pg.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      // Point 1: idempotent replay (same client id = already saved + spent).
      const prior = await tx`SELECT id FROM reports WHERE id = ${report.id} AND user_id = ${userId}`;
      if (prior.length > 0) return { ok: true, existing: true };
      const spent = await tx`UPDATE users SET credits = credits - 1 WHERE id = ${userId} AND credits >= 1 RETURNING credits`;
      if (spent.length === 0) return { ok: false };
      const inserted = await tx`INSERT INTO reports (id, user_id, data, created_at)
        VALUES (${report.id}, ${userId}, ${jsonbParam(report)}, NOW())
        ON CONFLICT (id) DO NOTHING RETURNING id`;
      // Point 2: 0 rows -> throw so the spend rolls back with it.
      if (inserted.length === 0) {
        const owner = await tx`SELECT user_id FROM reports WHERE id = ${report.id}`;
        throw new IdTakenError((owner[0] as { user_id: string } | undefined)?.user_id === userId);
      }
      return { ok: true };
    });
    try {
      return await withDbTimeout(begin, controller);
    } catch (err) {
      if (!(err instanceof IdTakenError)) throw err;
      if (!err.sameUser) return { ok: false, conflict: true };
      // Lost a race with our own parallel attempt: the winner's row is saved.
      const { rows } = await sql`SELECT id FROM reports WHERE id = ${report.id} AND user_id = ${userId}`;
      if (rows.length === 0) throw err;
      return { ok: true, existing: true };
    }
  }
  const db = await readLocal();
  const list = db.reports ?? (db.reports = []);
  if (list.some((r) => r.id === report.id && r.user_id === userId)) return { ok: true, existing: true };
  if (list.some((r) => r.id === report.id)) return { ok: false, conflict: true };
  const u = db.users.find((x) => x.id === userId);
  if (!u || u.credits < 1) return { ok: false };
  u.credits -= 1;
  list.unshift({ id: report.id, user_id: userId, data: report, created_at: new Date().toISOString() });
  await writeLocal(db);
  return { ok: true };
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
