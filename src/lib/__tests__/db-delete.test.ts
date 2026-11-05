import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  createUser,
  getUserById,
  saveReadingForUser,
  listReadingsForUser,
  saveReportForUser,
  listReportsForUser,
  createTransaction,
  listTransactions,
  markFreeReadingUsed,
  hasUsedFreeReading,
  markFreeInterpretationUsed,
  hasUsedFreeInterpretation,
  storeAuthCode,
  getAuthCode,
  createCheckoutNonce,
  consumeCheckoutNonce,
  deleteUser,
} from "@/lib/db";

// Phase 3 (3.6): deleting an account must delete the user and ALL
// their data — readings, reports, transactions, free-use records,
// auth codes, and checkout nonces — and must not touch anyone else.
// Live Postgres cannot be verified from this environment, so these
// tests run against the local JSON branch only and skip when a
// Postgres URL is configured. The test backs up data/local-db.json
// and restores it afterwards, so no dev data is lost.
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

describe.skipIf(hasPostgres)("deleteUser (local JSON branch)", () => {
  let backup: string | null = null;
  let hadFile = false;

  beforeAll(async () => {
    try {
      backup = await fs.readFile(LOCAL_PATH, "utf8");
      hadFile = true;
    } catch {
      backup = null;
      hadFile = false;
    }
    await fs.rm(LOCAL_PATH, { force: true });
  });

  afterAll(async () => {
    if (hadFile && backup !== null) {
      await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
      await fs.writeFile(LOCAL_PATH, backup);
    } else {
      await fs.rm(LOCAL_PATH, { force: true });
    }
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
    const nonce = await createCheckoutNonce(userA.email, "pack-5");

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
    expect(await consumeCheckoutNonce(nonce, userA.email)).toBe(false);

    // The other user's data is untouched.
    expect(await getUserById(userB.id)).not.toBeNull();
    expect(await listReadingsForUser(userB.id)).toHaveLength(1);
    expect(await listReportsForUser(userB.id)).toHaveLength(1);
  });

  it("returns false for an unknown user id", async () => {
    expect(await deleteUser("u_does-not-exist")).toBe(false);
  });
});
