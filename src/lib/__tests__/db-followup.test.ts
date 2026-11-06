import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  createUser,
  addUserCredits,
  getUserById,
  saveReadingForUser,
  getReadingForUser,
  appendFollowUpWithSpend,
} from "@/lib/db";

// Phase 6 (N7): appending a follow-up and spending its Oracle must be
// one atomic step — the cap is re-checked at append time and a failed
// append never spends a credit. These tests run against the local
// JSON branch only (same pattern as db-delete.test.ts) and skip when
// a Postgres URL is configured; the Postgres-branch concurrency
// cases live in db-postgres.test.ts. The test backs up
// data/local-db.json and restores it afterwards.
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

describe.skipIf(hasPostgres)("appendFollowUpWithSpend (local JSON branch)", () => {
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

  const followUp = (n: number) => ({ question: `q${n}`, answer: `a${n}`, free: n === 1 });

  it("appends and spends, and the stored reading holds the follow-up", async () => {
    const user = await createUser("followup-a@example.com");
    await addUserCredits(user.id, 2);
    await saveReadingForUser(user.id, { id: "r-a1", question: "q?" });
    const res = await appendFollowUpWithSpend(user.id, "r-a1", followUp(1), 1);
    expect(res.ok).toBe(true);
    expect(res.followUps).toHaveLength(1);
    expect((await getUserById(user.id))?.credits).toBe(1);
    const stored = (await getReadingForUser(user.id, "r-a1")) as { followUps?: unknown[] };
    expect(stored.followUps).toHaveLength(1);
  });

  it("a free follow-up appends without spending", async () => {
    const user = await createUser("followup-b@example.com");
    await saveReadingForUser(user.id, { id: "r-b1", question: "q?" });
    const res = await appendFollowUpWithSpend(user.id, "r-b1", followUp(1), 0);
    expect(res.ok).toBe(true);
    expect((await getUserById(user.id))?.credits).toBe(0);
  });

  it("refuses the 4th follow-up and spends nothing", async () => {
    const user = await createUser("followup-c@example.com");
    await addUserCredits(user.id, 5);
    await saveReadingForUser(user.id, { id: "r-c1", question: "q?" });
    for (let n = 1; n <= 3; n += 1) {
      expect((await appendFollowUpWithSpend(user.id, "r-c1", followUp(n), 1)).ok).toBe(true);
    }
    const res = await appendFollowUpWithSpend(user.id, "r-c1", followUp(4), 1);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("limit");
    expect((await getUserById(user.id))?.credits).toBe(2);
  });

  it("refuses when the balance is insufficient and spends nothing", async () => {
    const user = await createUser("followup-d@example.com");
    await saveReadingForUser(user.id, { id: "r-d1", question: "q?" });
    const res = await appendFollowUpWithSpend(user.id, "r-d1", followUp(1), 1);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("insufficient");
    expect((await getUserById(user.id))?.credits).toBe(0);
    const stored = (await getReadingForUser(user.id, "r-d1")) as { followUps?: unknown[] };
    expect(stored.followUps ?? []).toHaveLength(0);
  });

  it("returns not-found for an unknown reading", async () => {
    const user = await createUser("followup-e@example.com");
    await addUserCredits(user.id, 1);
    const res = await appendFollowUpWithSpend(user.id, "r-nope", followUp(1), 1);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not-found");
    expect((await getUserById(user.id))?.credits).toBe(1);
  });

  it("Phase B (F4): first claimedFree append is free and second claimedFree append is charged", async () => {
    const user = await createUser("followup-f4@example.com");
    await addUserCredits(user.id, 1);
    await saveReadingForUser(user.id, { id: "r-f4", question: "q?" });

    const first = await appendFollowUpWithSpend(
      user.id,
      "r-f4",
      { question: "q1", answer: "a1", free: true },
      0,
      3,
      true
    );
    expect(first.ok).toBe(true);
    expect(first.free).toBe(true);
    expect((await getUserById(user.id))?.credits).toBe(1);

    const callerObj = { question: "q2", answer: "a2", free: true };
    const second = await appendFollowUpWithSpend(
      user.id,
      "r-f4",
      callerObj,
      0,
      3,
      true
    );
    expect(second.ok).toBe(true);
    expect(second.free).toBe(false);
    expect((await getUserById(user.id))?.credits).toBe(0);
    expect(callerObj.free).toBe(true);

    const stored = (await getReadingForUser(user.id, "r-f4")) as {
      followUps?: Array<{ question: string; answer: string; free: boolean }>;
    };
    expect(stored.followUps).toHaveLength(2);
    expect(stored.followUps?.[0].free).toBe(true);
    expect(stored.followUps?.[1].free).toBe(false);
  });
});
