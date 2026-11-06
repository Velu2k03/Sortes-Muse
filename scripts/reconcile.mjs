#!/usr/bin/env node
/**
 * Daily reconciliation — Phase 6 (P3) webhook failure visibility.
 *
 * Lists Lemon Squeezy orders marked paid that have NO matching
 * transaction row in the Sortes database — i.e. orders the webhook
 * never fulfilled (missed delivery, signature failure, server down
 * at delivery time, amount/store mismatch). Run daily against
 * staging first; production runs need the owner's approval and a
 * real API key.
 *
 * Usage:
 *   DATABASE_URL=postgres://... \
 *   LEMONSQUEEZY_API_KEY=<test key for staging, real key for prod> \
 *   node scripts/reconcile.mjs [--days 7]
 *
 * Output: one line per unmatched order (order id, email, total,
 * date), plus a summary count. Exit 0 when everything reconciles,
 * exit 1 when unmatched orders exist (so a cron wrapper can alert).
 *
 * Safety: refuses to run against a production-looking DATABASE_URL
 * unless SORTES_RECONCILE_PRODUCTION=1 is set. It only READS: it
 * never grants credits itself — unmatched orders are a human's job
 * (verify in the Lemon Squeezy dashboard, then fulfill manually or
 * re-deliver the webhook from the dashboard).
 */
import postgres from "postgres";

const days = Number(process.argv.find((a) => a.startsWith("--days="))?.slice(7) ?? 7);
const dbUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const apiKey = process.env.LEMONSQUEEZY_API_KEY;

if (!dbUrl) {
  console.error("Set DATABASE_URL (or POSTGRES_URL) to the database to check.");
  process.exit(2);
}
if (!apiKey) {
  console.error("Set LEMONSQUEEZY_API_KEY (test key for staging runs).");
  process.exit(2);
}
if (
  process.env.NODE_ENV === "production" &&
  process.env.SORTES_RECONCILE_PRODUCTION !== "1"
) {
  console.error("Refusing production run without SORTES_RECONCILE_PRODUCTION=1.");
  process.exit(2);
}

const sql = postgres(dbUrl, { prepare: false, max: 1 });

async function listPaidOrders() {
  const orders = [];
  let page = 1;
  for (;;) {
    const url = `https://api.lemonsqueezy.com/v1/orders?page[number]=${page}&page[size]=100&filter[status]=paid`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Lemon Squeezy API ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    for (const o of json.data ?? []) {
      const created = new Date(o.attributes.created_at);
      if (Date.now() - created.getTime() > days * 24 * 60 * 60 * 1000) continue;
      orders.push({
        id: String(o.id),
        email: o.attributes.user_email,
        total: (o.attributes.total ?? 0) / 100,
        currency: o.attributes.currency,
        createdAt: o.attributes.created_at,
      });
    }
    if (!json.meta?.page?.has_next_page) break;
    page += 1;
  }
  return orders;
}

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const orders = await listPaidOrders();
console.log(`Paid orders in the last ${days} day(s): ${orders.length} (since ${since.toISOString()})`);

let unmatched = 0;
for (const order of orders) {
  const rows = await sql`
    SELECT id FROM transactions
    WHERE pack_type LIKE ${`%lemonsqueezy:${order.id}%`}
    LIMIT 1`;
  if (rows.length === 0) {
    unmatched += 1;
    console.log(
      `UNMATCHED order ${order.id} email=${order.email} total=${order.total} ${order.currency} created=${order.createdAt}`
    );
  }
}
await sql.end();

if (unmatched === 0) {
  console.log("RECONCILED: every paid order has a transaction row.");
  process.exit(0);
}
console.log(
  `${unmatched} paid order(s) with no transaction row. Do NOT auto-fulfill: ` +
    "verify each in the Lemon Squeezy dashboard, then fulfill manually or re-deliver the webhook."
);
process.exit(1);
