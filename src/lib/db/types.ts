/*
 * F9 (2026-11-09): shared row types.
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

export interface DbUser {
  id: string;
  email: string;
  credits: number;
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
