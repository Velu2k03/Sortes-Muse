import { promises as fs } from "fs";
import path from "path";
import type { CreditGrant, DbSubscription, DbTransaction, DbUser } from "./types";

/*
 * F9 (2026-11-09): the local-dev JSON file store (data/local-db.json).
 * Moved verbatim out of src/lib/db.ts, which is now a re-export barrel.
 */

const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

export interface LocalDb {
  users: DbUser[];
  codes: Record<string, { code_hash: string; expires_at: string; attempts: number }>;
  transactions: DbTransaction[];
  readings: Array<{ id: string; user_id: string; data: unknown; created_at: string }>;
  freeInterpretations: Array<{ user_id: string; system: string; used_at: string }>;
  // Phase 2, 2.1: optional because local files written before Phase 2
  // have no freeReadings key; the functions fall back to an empty list.
  freeReadings?: Array<{ user_id: string; used_at: string }>;
  // M4.1: optional because local files written before M4.1 have no
  // reports key; report functions fall back to an empty list.
  reports?: Array<{ id: string; user_id: string; data: unknown; created_at: string }>;
  // Phase 2 batch 2: optional because local files written before 008
  // have no creditGrants key; the ledger functions fall back to an
  // empty list.
  creditGrants?: CreditGrant[];
  // Phase 2 batch 3: optional because local files written before 009
  // have no subscriptions key; the subscription functions fall back
  // to an empty list.
  subscriptions?: DbSubscription[];
}

export async function readLocal(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf8");
    return JSON.parse(raw) as LocalDb;
  } catch {
    return { users: [], codes: {}, transactions: [], readings: [], freeInterpretations: [], reports: [] };
  }
}

export async function writeLocal(db: LocalDb): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, JSON.stringify(db, null, 2));
}
