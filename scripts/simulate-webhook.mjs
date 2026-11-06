#!/usr/bin/env node
/**
 * Webhook simulator — Phase 6 integration test prep.
 *
 * Posts HMAC-signed test payloads to a LOCAL dev server and checks the
 * responses: order_created (grant), the same order again (duplicate
 * delivery — must not double-grant), order_refunded (revoke), and the
 * same refund again (double refund — must be a no-op).
 *
 * SAFETY: refuses any URL that is not localhost. No real money, no
 * production, no real Lemon Squeezy account involved. The signing
 * secret is a locally generated TEST secret — never the real one.
 *
 * Setup (run the dev server with the SAME test values first):
 *
 *   # 1. Generate a test secret and test store/variant ids:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   # 2. Put these in .env.local (test values only):
 *   LEMONSQUEEZY_WEBHOOK_SECRET=<that secret>
 *   LEMONSQUEEZY_STORE_ID=999999
 *   LEMONSQUEEZY_VARIANT_PACK5=111111
 *   LEMONSQUEEZY_VARIANT_PACK12=222222
 *   LEMONSQUEEZY_VARIANT_PACK30=333333
 *   # 3. Start the server: npm run dev   (http://localhost:3000)
 *   # 4. Run this script with the same env vars exported:
 *   LEMONSQUEEZY_WEBHOOK_SECRET=<that secret> \
 *   LEMONSQUEEZY_STORE_ID=999999 LEMONSQUEEZY_VARIANT_PACK5=111111 \
 *   node scripts/simulate-webhook.mjs [--url http://localhost:3000] \
 *     [--email webhook-test@example.com]
 *
 * Expected results (pack5 = 5 Oracles, $3.99 = 399 cents):
 *   1. order_created        -> 200 { ok: true }
 *   2. order_created again  -> 200 { ok: true, duplicate: true }
 *   3. order_refunded       -> 200 { ok: true, refunded: true }
 *   4. order_refunded again -> 200 { ok: true, refunded: false }
 *
 * Verify the balance in the DB (local Postgres staging):
 *   psql $DATABASE_URL -c "SELECT email, credits FROM users
 *     WHERE email = 'webhook-test@example.com';"
 *   -- after step 1: 5. After step 3: 0.
 *   SELECT * FROM transactions WHERE pack_type LIKE '%lemonsqueezy:%';
 */
import { createHmac, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith("--url="))?.slice(6) ?? "http://localhost:3000";
const emailArg = args.find((a) => a.startsWith("--email="))?.slice(8) ?? "webhook-test@example.com";

const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
const storeId = process.env.LEMONSQUEEZY_STORE_ID;
const variantId = process.env.LEMONSQUEEZY_VARIANT_PACK5;

if (!secret || !storeId || !variantId) {
  console.error(
    "Missing test env: set LEMONSQUEEZY_WEBHOOK_SECRET, LEMONSQUEEZY_STORE_ID and\n" +
      "LEMONSQUEEZY_VARIANT_PACK5 to the SAME test values the local dev server uses.\n" +
      "Generate a test secret with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
      "See the header comment of this file for the full setup."
  );
  process.exit(2);
}

const base = new URL(urlArg);
if (base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
  console.error(`Refusing non-local URL: ${urlArg}. This simulator only targets localhost.`);
  process.exit(2);
}

const orderId = `sim-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;

function sign(raw) {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

async function post(eventName, label) {
  const payload = {
    meta: { event_name: eventName, custom_data: { pack_id: "pack5" } },
    data: {
      id: orderId,
      attributes: {
        user_email: emailArg,
        total: 399,
        subtotal: 399,
        currency: "USD",
        store_id: Number(storeId),
        status: "paid",
        first_order_item: { variant_id: Number(variantId) },
      },
    },
  };
  const raw = JSON.stringify(payload);
  const res = await fetch(`${base.origin}/api/webhooks/lemonsqueezy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": sign(raw) },
    body: raw,
  });
  const body = await res.text();
  console.log(`${label}: ${res.status} ${body}`);
  return { status: res.status, body };
}

const results = [];
results.push(await post("order_created", "1. order_created       "));
results.push(await post("order_created", "2. order_created (dup) "));
results.push(await post("order_refunded", "3. order_refunded      "));
results.push(await post("order_refunded", "4. order_refunded (dup)"));

const ok =
  results[0].status === 200 && results[0].body.includes('"ok":true') &&
  results[1].status === 200 && results[1].body.includes("duplicate") &&
  results[2].status === 200 && results[2].body.includes('"refunded":true') &&
  results[3].status === 200 && results[3].body.includes('"refunded":false');

console.log(ok ? "\nSIMULATOR PASS: grant, duplicate-grant, refund, duplicate-refund all behaved." :
  "\nSIMULATOR FAIL: one or more steps did not match the expected responses above.");
console.log(`Order id used: ${orderId} (verify in the DB with the query in this file's header).`);
process.exit(ok ? 0 : 1);
