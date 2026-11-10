import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { importDbWithIsolatedStore } from "./local-db-test-store";

// Phase 3 (3.6): deleting an account must delete the user and ALL
// their data — readings, reports, transactions, free-use records,
// and auth codes — and must not touch anyone else.
// Live Postgres cannot be verified from this environment, so these
// tests run against the local JSON branch only and skip when a
// Postgres URL is configured. The real data/local-db.json is never touched.
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
// Each file gets its own temp store via importDbWithIsolatedStore (no static
// `@/lib/db` import: db.ts binds data/local-db.json from cwd at import time).

describe.skipIf(hasPostgres)("deleteUser (local JSON branch)", () => {
  let cleanup: (() => Promise<void>) | null = null;
  let createUser: typeof import("@/lib/db").createUser;
  let getUserById: typeof import("@/lib/db").getUserById;
  let saveReadingForUser: typeof import("@/lib/db").saveReadingForUser;
  let listReadingsForUser: typeof import("@/lib/db").listReadingsForUser;
  let saveReportForUser: typeof import("@/lib/db").saveReportForUser;
  let listReportsForUser: typeof import("@/lib/db").listReportsForUser;
  let createTransaction: typeof import("@/lib/db").createTransaction;
  let listTransactions: typeof import("@/lib/db").listTransactions;
  let markFreeReadingUsed: typeof import("@/lib/db").markFreeReadingUsed;
  let hasUsedFreeReading: typeof import("@/lib/db").hasUsedFreeReading;
  let markFreeInterpretationUsed: typeof import("@/lib/db").markFreeInterpretationUsed;
  let hasUsedFreeInterpretation: typeof import("@/lib/db").hasUsedFreeInterpretation;
  let storeAuthCode: typeof import("@/lib/db").storeAuthCode;
  let getAuthCode: typeof import("@/lib/db").getAuthCode;
  let deleteUser: typeof import("@/lib/db").deleteUser;

  beforeAll(async () => {
    const isolated = await importDbWithIsolatedStore();
    cleanup = isolated.cleanup;
    ({ createUser, getUserById, saveReadingForUser, listReadingsForUser, saveReportForUser, listReportsForUser, createTransaction, listTransactions, markFreeReadingUsed, hasUsedFreeReading, markFreeInterpretationUsed, hasUsedFreeInterpretation, storeAuthCode, getAuthCode, deleteUser } = isolated.db);
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it("deletes the user and every dependent row, and leaves other users alone", async () => {
    const userA = await createUser("delete-a@example.com");
    const userB = await createUser("delete-b@example.com");

    await saveReadingForUser(userA.id, { id: "r-a1", spreadName: "Quick Insight" });
    await saveReadingForUser(userB.id, { id: "r-b1", spreadName: "Quick Insight" });
    await saveReportForUser(userA.id, { id: "rep-a1", title: "Report A" });
    await saveReportForUser(userB.id, { id: "rep-b1", title: "Report B" });
    await createTransaction({ userId: userA.id, email: userA.email, packType: "pack-5", amount: 3.99, readings: 5 });
    await markFreeReadingUsed(userA.id);
    await markFreeInterpretationUsed(userA.id, "western");
    await storeAuthCode(userA.email, "hash-a", new Date(Date.now() + 600000));

    expect(await listReadingsForUser(userA.id)).toHaveLength(1);
    expect(await listReportsForUser(userA.id)).toHaveLength(1);
    expect(await listTransactions(userA.id)).toHaveLength(1);
    expect(await hasUsedFreeReading(userA.id)).toBe(true);
    expect(await hasUsedFreeInterpretation(userA.id, "western")).toBe(true);
    expect(await getAuthCode(userA.email)).not.toBeNull();

    expect(await deleteUser(userA.id)).toBe(true);

    expect(await getUserById(userA.id)).toBeNull();
    expect(await listReadingsForUser(userA.id)).toHaveLength(0);
    expect(await listReportsForUser(userA.id)).toHaveLength(0);
    expect(await listTransactions(userA.id)).toHaveLength(0);
    expect(await hasUsedFreeReading(userA.id)).toBe(false);
    expect(await hasUsedFreeInterpretation(userA.id, "western")).toBe(false);
    expect(await getAuthCode(userA.email)).toBeNull();

    // The other user's data is untouched.
    expect(await getUserById(userB.id)).not.toBeNull();
    expect(await listReadingsForUser(userB.id)).toHaveLength(1);
    expect(await listReportsForUser(userB.id)).toHaveLength(1);
  });

  it("returns false for an unknown user id", async () => {
    expect(await deleteUser("u_does-not-exist")).toBe(false);
  });
});
