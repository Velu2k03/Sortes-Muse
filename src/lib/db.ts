/**
 * Database layer: a re-export barrel (F9, 2026-11-09).
 *
 * Every existing `@/lib/db` import keeps working unchanged. The code
 * lives in src/lib/db/, split by domain:
 * - client.ts: Postgres client, URL validation, timeouts, ensureSchema
 * - json-store.ts: the local-dev JSON file store
 * - users.ts, credits.ts, auth-codes.ts, orders.ts (fulfilment and
 *   refunds), readings.ts, reports.ts, stats.ts (social proof, win-back)
 * - ledgers.ts: Phase 2 two-ledger credits (monthly/purchased,
 *   monthly grants, Oracle conversion)
 * Only the names exported here are public; the shared internals
 * (pg, sql, readLocal, ...) stay private to src/lib/db/.
 */

export type { DbUser, DbTransaction, CreditGrant } from "./db/types";
export {
  validatePostgresUrl,
  APP_STATEMENT_TIMEOUT_MS,
  txWithSignal,
  createAppPostgres,
  assertAppDbRole,
  ensureSchema,
} from "./db/client";

export {
  DB_INSTANCE_ID,
  DB_QUERY_TIMEOUT_MS,
  DB_SCHEMA_TIMEOUT_MS,
  logDbTimeout,
  withDbTimeout,
} from "./db-timeout";

export {
  getUserByEmail,
  getUserById,
  createUser,
  createUserWithPassword,
  setUserPassword,
  deleteUser,
} from "./db/users";
export {
  addUserCredits,
  spendUserCredits,
  hasUsedFreeReading,
  markFreeReadingUsed,
  hasUsedFreeInterpretation,
  markFreeInterpretationUsed,
} from "./db/credits";
export type { CreditBalances, MonthlyGrantResult, OracleConversionResult } from "./db/ledgers";
export {
  spendFromLedgers,
  spendFromBalances,
  getCreditBalances,
  listCreditGrants,
  grantMonthlyCredits,
  convertOraclesToCredits,
} from "./db/ledgers";
export {
  storeAuthCode,
  getAuthCode,
  bumpAuthCodeAttempts,
  deleteAuthCode,
} from "./db/auth-codes";
export {
  createTransaction,
  listTransactions,
  fulfillOrder,
  revokeOrder,
} from "./db/orders";
export type { DbSubscription } from "./db/types";
export {
  upsertSubscription,
  getSubscriptionByProviderId,
  getActiveSubscriptionForUser,
  listActiveAnnualSubscriptions,
  expireMonthlyBalance,
  revokeSubscriptionGrant,
} from "./db/subscriptions";
export type { FollowUpAppendResult } from "./db/readings";
export {
  saveReadingForUser,
  updateReadingForUser,
  deleteReadingForUser,
  appendFollowUpWithSpend,
  saveReadingWithSpend,
  getReadingForUser,
  listReadingsForUser,
} from "./db/readings";
export {
  saveReportForUser,
  saveReportWithSpend,
  getReportForUser,
  listReportsForUser,
  deleteReportForUser,
} from "./db/reports";
export {
  countRecentReadings,
  getWinbackCandidates,
  markWinbackSent,
} from "./db/stats";
