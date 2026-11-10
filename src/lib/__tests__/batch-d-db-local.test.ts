import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { importDbWithIsolatedStore } from "./local-db-test-store";
import { tu } from "./test-uuid";

// Batch D (B1, B2, B4) on the local JSON branch. The same cases run on
// real Postgres in db-postgres.test.ts (skipped without
// SORTES_TEST_DATABASE_URL). Isolated temp store.
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
// Each file gets its own temp store via importDbWithIsolatedStore (no static
// `@/lib/db` import: db.ts binds data/local-db.json from cwd at import time).

describe.skipIf(hasPostgres)("Batch D money paths (local JSON branch)", () => {
  let cleanup: (() => Promise<void>) | null = null;
  let createUser: typeof import("@/lib/db").createUser;
  let getUserById: typeof import("@/lib/db").getUserById;
  let addUserCredits: typeof import("@/lib/db").addUserCredits;
  let hasUsedFreeReading: typeof import("@/lib/db").hasUsedFreeReading;
  let hasUsedFreeInterpretation: typeof import("@/lib/db").hasUsedFreeInterpretation;
  let saveReadingWithSpend: typeof import("@/lib/db").saveReadingWithSpend;
  let saveReadingForUser: typeof import("@/lib/db").saveReadingForUser;
  let listReadingsForUser: typeof import("@/lib/db").listReadingsForUser;
  let saveReportWithSpend: typeof import("@/lib/db").saveReportWithSpend;
  let saveReportForUser: typeof import("@/lib/db").saveReportForUser;
  let listReportsForUser: typeof import("@/lib/db").listReportsForUser;

  beforeAll(async () => {
    const isolated = await importDbWithIsolatedStore();
    cleanup = isolated.cleanup;
    ({ createUser, getUserById, addUserCredits, hasUsedFreeReading, hasUsedFreeInterpretation, saveReadingWithSpend, saveReadingForUser, listReadingsForUser, saveReportWithSpend, saveReportForUser, listReportsForUser } = isolated.db);
  });

  afterAll(async () => {
    await cleanup?.();
  });

  const reading = (id: string) => ({ id, free: false, interpretation: "text", aiGenerated: true });

  // B1 regression guard: the first-ever reading being a Celtic Cross spends
  // 1 and leaves the free grant intact, so the later Quick Insight is free.
  it("B1: signed-in first Celtic Cross spends 1 and does not consume the free grant", async () => {
    const user = await createUser("bd-b1@example.com");
    await addUserCredits(user.id, 3);
    expect(await hasUsedFreeReading(user.id)).toBe(false);
    expect(await saveReadingWithSpend(user.id, reading(tu("cc-1")), false)).toEqual({ ok: true, free: false });
    expect((await getUserById(user.id))?.credits).toBe(2);
    expect(await hasUsedFreeReading(user.id)).toBe(false);
    expect(await saveReadingWithSpend(user.id, reading(tu("qi-1")), true)).toEqual({ ok: true, free: true });
    expect((await getUserById(user.id))?.credits).toBe(2);
    expect(await hasUsedFreeReading(user.id)).toBe(true);
  });

  // B2: the server inserts the row; the client then POSTs the same id to
  // /api/history (saveReadingForUser). That must not create a second row.
  it("B2: a paid reading saved again by the client with the server id stays one row", async () => {
    const user = await createUser("bd-b2@example.com");
    await addUserCredits(user.id, 1);
    expect((await saveReadingWithSpend(user.id, reading(tu("srv-id")), false)).ok).toBe(true);
    await saveReadingForUser(user.id, { ...reading(tu("srv-id")), interpretation: "client copy" });
    const rows = (await listReadingsForUser(user.id)) as Array<{ id: string; interpretation: string }>;
    expect(rows.filter((r) => r.id === tu("srv-id"))).toHaveLength(1);
    expect(rows[0].interpretation).toBe("text");
  });

  it("B4 reports: spend 1 + row together; no credit writes nothing; client re-save is a no-op", async () => {
    const user = await createUser("bd-b4r@example.com");
    expect(await saveReportWithSpend(user.id, { id: tu("rep-0"), interpretation: "x" })).toEqual({ ok: false });
    expect(await listReportsForUser(user.id)).toHaveLength(0);
    await addUserCredits(user.id, 1);
    expect(await saveReportWithSpend(user.id, { id: tu("rep-1"), interpretation: "x" })).toEqual({ ok: true });
    expect((await getUserById(user.id))?.credits).toBe(0);
    expect(await listReportsForUser(user.id)).toHaveLength(1);
    await saveReportForUser(user.id, { id: tu("rep-1"), interpretation: "client copy" });
    expect(await listReportsForUser(user.id)).toHaveLength(1);
    // Balance now 0: a second paid report writes nothing.
    expect(await saveReportWithSpend(user.id, { id: tu("rep-2"), interpretation: "y" })).toEqual({ ok: false });
    expect(await listReportsForUser(user.id)).toHaveLength(1);
  });

  it("B4 chart: per-system free claim, then spend; no credit writes nothing", async () => {
    const user = await createUser("bd-b4c@example.com");
    // First western interpretation is free: claims free_interpretations, no spend, row written.
    expect(await saveReadingWithSpend(user.id, reading(tu("ch-1")), true, "western")).toEqual({ ok: true, free: true });
    expect(await hasUsedFreeInterpretation(user.id, "western")).toBe(true);
    expect(await hasUsedFreeInterpretation(user.id, "vedic")).toBe(false);
    // The tarot free grant is untouched by a chart claim.
    expect(await hasUsedFreeReading(user.id)).toBe(false);
    // Second western with 0 credits: lost claim falls to a spend, which fails: nothing written.
    expect(await saveReadingWithSpend(user.id, reading(tu("ch-2")), true, "western")).toEqual({ ok: false, free: false });
    // With a credit it spends 1 and stores free:false.
    await addUserCredits(user.id, 1);
    expect(await saveReadingWithSpend(user.id, reading(tu("ch-3")), true, "western")).toEqual({ ok: true, free: false });
    expect((await getUserById(user.id))?.credits).toBe(0);
    const ids = ((await listReadingsForUser(user.id)) as Array<{ id: string }>).map((r) => r.id).sort();
    expect(ids).toEqual([tu("ch-1"), tu("ch-3")].sort());
  });
  // Point 1 (local branch): replaying an id never spends or duplicates.
  it("Point 1: replaying a reading or report id spends 0 more and keeps one row", async () => {
    const user = await createUser("p1-local@example.com");
    await addUserCredits(user.id, 2);
    expect(await saveReadingWithSpend(user.id, reading(tu("p1-a")), false)).toEqual({ ok: true, free: false });
    expect(await saveReadingWithSpend(user.id, reading(tu("p1-a")), false)).toEqual({ ok: true, free: false, existing: true });
    expect(await saveReportWithSpend(user.id, { id: tu("p1-rep"), interpretation: "x" })).toEqual({ ok: true });
    expect(await saveReportWithSpend(user.id, { id: tu("p1-rep"), interpretation: "x" })).toEqual({ ok: true, existing: true });
    expect((await getUserById(user.id))?.credits).toBe(0);
    expect((await listReadingsForUser(user.id)).length).toBe(1);
    expect((await listReportsForUser(user.id)).length).toBe(1);
  });

  // Round 3 item 3 (local branch): another user's id is a conflict, not a spend.
  it("Item 3: another user's reading/report id returns conflict and spends nothing", async () => {
    const owner = await createUser("i3-owner@example.com");
    const other = await createUser("i3-other@example.com");
    await addUserCredits(owner.id, 2);
    await addUserCredits(other.id, 1);
    expect((await saveReadingWithSpend(owner.id, reading(tu("i3-r")), false)).ok).toBe(true);
    expect(await saveReadingWithSpend(other.id, reading(tu("i3-r")), false)).toEqual({ ok: false, free: false, conflict: true });
    expect((await saveReportWithSpend(owner.id, { id: tu("i3-rep"), interpretation: "x" })).ok).toBe(true);
    expect(await saveReportWithSpend(other.id, { id: tu("i3-rep"), interpretation: "x" })).toEqual({ ok: false, conflict: true });
    expect((await getUserById(other.id))?.credits).toBe(1);
    expect(await listReadingsForUser(other.id)).toHaveLength(0);
  });

  it("Item 3: a non-UUID id is rejected before it touches the store", async () => {
    const user = await createUser("i3-uuid@example.com");
    await addUserCredits(user.id, 1);
    await expect(saveReadingWithSpend(user.id, reading("not-a-uuid"), false)).rejects.toThrow(/UUID/);
    await expect(saveReportWithSpend(user.id, { id: "x'; DROP TABLE readings;--", interpretation: "x" })).rejects.toThrow(/UUID/);
    expect((await getUserById(user.id))?.credits).toBe(1);
  });
});
