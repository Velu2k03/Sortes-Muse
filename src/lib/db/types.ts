/*
 * F9 (2026-11-09): shared row types.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

export interface DbUser {
  id: string;
  email: string;
  credits: number;
  // Phase 2 batch 2: the two ledgers. `credits` is the generated total
  // (monthly + purchased) on Postgres; on the local JSON store the
  // helpers in ledgers.ts keep it in sync. Optional because local
  // files written before 008 have neither key; readers treat a
  // missing ledger as 0.
  monthly_credits?: number;
  purchased_credits?: number;
  created_at: string;
  winback_sent_at?: string | null;
  password_hash?: string | null;
  // Phase B (R5): session version, carried in the JWT as the `pwdVer`
  // claim and checked in getSession. Bumped on every password set or
  // change, so a stolen token dies when the owner changes password.
  // DEFAULT 1 (migration 006); legacy rows/tokens without it read as 1.
  pwd_ver?: number | null;
}

export interface DbTransaction {
  id: string;
  user_id: string | null;
  email: string;
  pack_type: string;
  amount: number;
  readings: number;
  created_at: string;
  // AF-004 (migration 007): the Lemon Squeezy order id of a fulfilled
  // order, UNIQUE where not null. Null/absent on refund rows, markers,
  // and rows written before 007.
  order_id?: string | null;
}

/**
 * Phase 2 batch 2: one row of the credit_grants audit/idempotency
 * ledger (migration 008). One row per monthly grant (unique per
 * subscription + period), one row per Oracle conversion (unique per
 * user). Purchased top-ups and pack grants are NOT recorded here —
 * they already have their transactions row.
 */
export interface CreditGrant {
  id: string;
  user_id: string;
  kind: "monthly" | "purchased" | "conversion" | "expiry";
  amount: number;
  subscription_id: string | null;
  period_key: string | null;
  tier: string | null;
  expires_at: string | null;
  granted_at: string;
}

/**
 * Phase 2 batch 3: one row per Lemon Squeezy subscription. A
 * customer can hold several over time (a new checkout after an
 * expiry creates a new provider subscription), so the provider id
 * is the unique key, not the user.
 */
export interface DbSubscription {
  id: string;
  user_id: string;
  lemonsqueezy_subscription_id: string;
  lemonsqueezy_customer_id: string | null;
  tier: "spark" | "star" | "moon";
  billing_interval: "monthly" | "annual";
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  renews_at: string | null;
  ends_at: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}
