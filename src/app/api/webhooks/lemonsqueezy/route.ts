import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  readingsForVariant,
  packIdForVariant,
} from "@/lib/lemonsqueezy";
import {
  getUserByEmail,
  createUser,
  addUserCredits,
  createTransaction,
  findTransactionByOrderId,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Lemon Squeezy webhook. Verifies the HMAC signature, then fulfills
 * `order_created` events: auto-creates the account from the buyer's email,
 * grants the pack's readings, and stores the transaction.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: {
    meta?: { event_name?: string; custom_data?: { pack_id?: string } };
    data?: {
      id?: string;
      attributes?: {
        user_email?: string;
        total?: number;
        status?: string;
        first_order_item?: { variant_id?: number };
      };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (event.meta?.event_name !== "order_created") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const attrs = event.data?.attributes;
  const email = (attrs?.user_email ?? "").trim().toLowerCase();
  const variantId = String(attrs?.first_order_item?.variant_id ?? "");
  const readings = readingsForVariant(variantId);
  if (!email || readings === null) {
    return NextResponse.json({ error: "Unrecognized order." }, { status: 400 });
  }
  if (attrs?.status && attrs.status !== "paid") {
    return NextResponse.json({ ok: true, ignored: "not paid" });
  }

  // Idempotency: Lemon Squeezy may retry webhooks; skip duplicate orders.
  const orderId = event.data?.id ?? "";
  const existing = await findTransactionByOrderId(orderId);
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  const user = (await getUserByEmail(email)) ?? (await createUser(email));
  const amount = Number(attrs?.total ?? 0) / 100;
  await createTransaction({
    userId: user.id,
    email,
    packType: `${packIdForVariant(variantId)} (lemonsqueezy:${orderId})`,
    amount,
    readings,
  });
  await addUserCredits(user.id, readings);

  return NextResponse.json({ ok: true });
}
