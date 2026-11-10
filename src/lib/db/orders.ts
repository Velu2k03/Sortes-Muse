import { usePostgres, pg, sql, ensureSchema, txWithSignal } from "./client";
import { readLocal, writeLocal } from "./json-store";
import type { DbTransaction } from "./types";
import { withDbTimeout } from "../db-timeout";
import { getUserByEmail } from "./users";

/*
 * F9 (2026-11-09): transactions, order fulfilment, refunds.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

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

/**
 * Audit item 10: Oracles still to take back for a refund. `refundedCents`
 * is the order's cumulative refunded_amount (undefined/0 = unknown, treated
 * as a full refund, as before). Rounds DOWN, so a customer is never revoked
 * more than the refund covers; capped at the pack. Minus what earlier
 * refund rows already took back, so redelivery or a second partial refund
 * never double-revokes.
 */
export function prorateRevoke(
  readings: number,
  amountDollars: number,
  refundedCents: number | undefined,
  alreadyRevoked: number
): number {
  const totalCents = Math.round(amountDollars * 100);
  const full = !refundedCents || refundedCents <= 0 || totalCents <= 0 || refundedCents >= totalCents;
  const target = full ? readings : Math.floor((readings * refundedCents) / totalCents);
  return Math.max(0, Math.min(readings, target) - alreadyRevoked);
}

function buildRefundRow(orig: DbTransaction, userId: string, refundMarker: string, delta: number): DbTransaction {
  return {
    id: newTransactionId(),
    user_id: userId,
    email: orig.email,
    pack_type: `refund (${refundMarker})`,
    // Full revoke keeps the exact original amount; a part is its share, to the cent.
    amount: delta === orig.readings ? -orig.amount : -Math.round((orig.amount * delta * 100) / orig.readings) / 100,
    readings: -delta,
    created_at: new Date().toISOString(),
  };
}

/** Postgres branch of revokeOrder: lock the user, dedupe the refund, record it, take back the grant. */
async function revokeOrderPostgres(
  orig: DbTransaction,
  userId: string,
  refundMarker: string,
  refundedCents: number | undefined
): Promise<{ revoked: boolean; readings: number }> {
  if (!pg) throw new Error("Database not configured");
  const controller = new AbortController();
  const begin = pg.begin(async (rawTx) => {
    const tx = txWithSignal(rawTx, controller.signal);
    // Phase 6 (G2 finding): same guard as fulfillOrder — fail with
    // a clear error instead of a foreign-key error at the INSERT.
    const locked = await tx`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (locked.length === 0) throw new Error("User not found during refund");
    const prior = await tx`SELECT COALESCE(SUM(-readings), 0)::int AS done FROM transactions WHERE pack_type LIKE ${"%" + refundMarker + ")%"}`;
    const delta = prorateRevoke(orig.readings, orig.amount, refundedCents, (prior[0] as { done: number }).done);
    if (delta <= 0) return { revoked: false, readings: orig.readings };
    const refundRow = buildRefundRow(orig, userId, refundMarker, delta);
    await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
      VALUES (${refundRow.id}, ${refundRow.user_id}, ${refundRow.email}, ${refundRow.pack_type}, ${refundRow.amount}, ${refundRow.readings}, NOW())`;
    await tx`UPDATE users SET credits = GREATEST(0, credits - ${delta}) WHERE id = ${userId}`;
    return { revoked: true, readings: delta };
  });
  return await withDbTimeout(begin, controller);
}

/** Local-file branch of revokeOrder (dev only). */
async function revokeOrderLocal(
  orig: DbTransaction,
  userId: string,
  refundMarker: string,
  refundedCents: number | undefined
): Promise<{ revoked: boolean; readings: number }> {
  const db = await readLocal();
  const done = db.transactions
    .filter((t) => t.pack_type.includes(`${refundMarker})`))
    .reduce((n, t) => n - t.readings, 0);
  const delta = prorateRevoke(orig.readings, orig.amount, refundedCents, done);
  if (delta <= 0) return { revoked: false, readings: orig.readings };
  const u = db.users.find((x) => x.id === userId);
  if (!u) return { revoked: false, readings: orig.readings };
  db.transactions.unshift(buildRefundRow(orig, userId, refundMarker, delta));
  u.credits = Math.max(0, u.credits - delta);
  await writeLocal(db);
  return { revoked: true, readings: delta };
}

/**
 * Phase 1 (1.4): revoke a refunded order's grant, idempotently.
 * Removes the readings the original fulfillment granted, prorated to
 * refundedCents when the refund is partial (see prorateRevoke),
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
export async function revokeOrder(orderId: string, email = "", refundedCents?: number): Promise<{ revoked: boolean; readings: number }> {
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
  if (usePostgres) return revokeOrderPostgres(orig, userId, refundMarker, refundedCents);
  return revokeOrderLocal(orig, userId, refundMarker, refundedCents);
}
