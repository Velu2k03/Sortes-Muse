import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  createUser,
  getUserById,
  addUserCredits,
  hasUsedFreeReading,
  hasUsedFreeInterpretation,
  saveReadingWithSpend,
  saveReadingForUser,
  listReadingsForUser,
  saveReportWithSpend,
  saveReportForUser,
  listReportsForUser,
} from "@/lib/db";

// Batch D (B1, B2, B4) on the local JSON branch. The same cases run on
// real Postgres in db-postgres.test.ts (skipped without
// SORTES_TEST_DATABASE_URL). Backs up and restores data/local-db.json.
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

describe.skipIf(hasPostgres)("Batch D money paths (local JSON branch)", () => {
  let backup: string | null = null;

  beforeAll(async () => {
    backup = await fs.readFile(LOCAL_PATH, "utf8").catch(() => null);
    await fs.rm(LOCAL_PATH, { force: true });
  });
  afterAll(async () => {
    if (backup !== null) {
      await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
      await fs.writeFile(LOCAL_PATH, backup);
    } else {
      await fs.rm(LOCAL_PATH, { force: true });
    }
  });

  const reading = (id: string) => ({ id, free: false, interpretation: "text", aiGenerated: true });

  // B1 regression guard: the first-ever reading being a Celtic Cross spends
  // 1 and leaves the free grant intact, so the later Quick Insight is free.
  it("B1: signed-in first Celtic Cross spends 1 and does not consume the free grant", async () => {
    const user = await createUser("bd-b1@example.com");
    await addUserCredits(user.id, 3);
    expect(await hasUsedFreeReading(user.id)).toBe(false);
    expect(await saveReadingWithSpend(user.id, reading("cc-1"), false)).toEqual({ ok: true, free: false });
    expect((await getUserById(user.id))?.credits).toBe(2);
    expect(await hasUsedFreeReading(user.id)).toBe(false);
    expect(await saveReadingWithSpend(user.id, reading("qi-1"), true)).toEqual({ ok: true, free: true });
    expect((await getUserById(user.id))?.credits).toBe(2);
    expect(await hasUsedFreeReading(user.id)).toBe(true);
  });

  // B2: the server inserts the row; the client then POSTs the same id to
  // /api/history (saveReadingForUser). That must not create a second row.
  it("B2: a paid reading saved again by the client with the server id stays one row", async () => {
    const user = await createUser("bd-b2@example.com");
    await addUserCredits(user.id, 1);
    expect((await saveReadingWithSpend(user.id, reading("srv-id"), false)).ok).toBe(true);
    await saveReadingForUser(user.id, { ...reading("srv-id"), interpretation: "client copy" });
    const rows = (await listReadingsForUser(user.id)) as Array<{ id: string; interpretation: string }>;
    expect(rows.filter((r) => r.id === "srv-id")).toHaveLength(1);
    expect(rows[0].interpretation).toBe("text");
  });

  it("B4 reports: spend 1 + row together; no credit writes nothing; client re-save is a no-op", async () => {
    const user = await createUser("bd-b4r@example.com");
    expect(await saveReportWithSpend(user.id, { id: "rep-0", interpretation: "x" })).toEqual({ ok: false });
    expect(await listReportsForUser(user.id)).toHaveLength(0);
    await addUserCredits(user.id, 1);
    expect(await saveReportWithSpend(user.id, { id: "rep-1", interpretation: "x" })).toEqual({ ok: true });
    expect((await getUserById(user.id))?.credits).toBe(0);
    expect(await listReportsForUser(user.id)).toHaveLength(1);
    await saveReportForUser(user.id, { id: "rep-1", interpretation: "client copy" });
    expect(await listReportsForUser(user.id)).toHaveLength(1);
    // Balance now 0: a second paid report writes nothing.
    expect(await saveReportWithSpend(user.id, { id: "rep-2", interpretation: "y" })).toEqual({ ok: false });
    expect(await listReportsForUser(user.id)).toHaveLength(1);
  });

  it("B4 chart: per-system free claim, then spend; no credit writes nothing", async () => {
    const user = await createUser("bd-b4c@example.com");
    // First western interpretation is free: claims free_interpretations, no spend, row written.
    expect(await saveReadingWithSpend(user.id, reading("ch-1"), true, "western")).toEqual({ ok: true, free: true });
    expect(await hasUsedFreeInterpretation(user.id, "western")).toBe(true);
    expect(await hasUsedFreeInterpretation(user.id, "vedic")).toBe(false);
    // The tarot free grant is untouched by a chart claim.
    expect(await hasUsedFreeReading(user.id)).toBe(false);
    // Second western with 0 credits: lost claim falls to a spend, which fails: nothing written.
    expect(await saveReadingWithSpend(user.id, reading("ch-2"), true, "western")).toEqual({ ok: false, free: false });
    // With a credit it spends 1 and stores free:false.
    await addUserCredits(user.id, 1);
    expect(await saveReadingWithSpend(user.id, reading("ch-3"), true, "western")).toEqual({ ok: true, free: false });
    expect((await getUserById(user.id))?.credits).toBe(0);
    const ids = ((await listReadingsForUser(user.id)) as Array<{ id: string }>).map((r) => r.id).sort();
    expect(ids).toEqual(["ch-1", "ch-3"]);
  });
});
