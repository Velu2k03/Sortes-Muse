import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { importDbWithIsolatedStore } from "./local-db-test-store";

// Phase B (R5/R7/R10) on the local JSON branch. Skips when a
// Postgres URL is configured (the Postgres branch is covered by
// db-postgres.test.ts). Each file gets its own temp store via
// importDbWithIsolatedStore (see that file): no static `@/lib/db`
// import here, because db.ts binds data/local-db.json from
// process.cwd() at import time, and a shared store across parallel
// vitest workers flakes. The real data/local-db.json is never
// touched.
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

describe.skipIf(hasPostgres)("Phase B guards (local JSON branch)", () => {
  let cleanup: (() => Promise<void>) | null = null;
  let createUser: typeof import("@/lib/db").createUser;
  let createUserWithPassword: typeof import("@/lib/db").createUserWithPassword;
  let getUserById: typeof import("@/lib/db").getUserById;
  let addUserCredits: typeof import("@/lib/db").addUserCredits;
  let spendUserCredits: typeof import("@/lib/db").spendUserCredits;
  let markFreeReadingUsed: typeof import("@/lib/db").markFreeReadingUsed;
  let hasUsedFreeReading: typeof import("@/lib/db").hasUsedFreeReading;
  let markFreeInterpretationUsed: typeof import("@/lib/db").markFreeInterpretationUsed;
  let hasUsedFreeInterpretation: typeof import("@/lib/db").hasUsedFreeInterpretation;
  let setUserPassword: typeof import("@/lib/db").setUserPassword;

  beforeAll(async () => {
    const isolated = await importDbWithIsolatedStore();
    cleanup = isolated.cleanup;
    ({
      createUser,
      createUserWithPassword,
      getUserById,
      addUserCredits,
      spendUserCredits,
      markFreeReadingUsed,
      hasUsedFreeReading,
      markFreeInterpretationUsed,
      hasUsedFreeInterpretation,
      setUserPassword,
    } = isolated.db);
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it("R10: spendUserCredits rejects zero, negative, and non-finite amounts", async () => {
    const user = await createUser("phaseb-spend@example.com");
    await addUserCredits(user.id, 3);
    await expect(spendUserCredits(user.id, 0)).rejects.toThrow(/positive/);
    await expect(spendUserCredits(user.id, -5)).rejects.toThrow(/positive/);
    await expect(spendUserCredits(user.id, Number.NaN)).rejects.toThrow(/positive/);
    expect((await getUserById(user.id))?.credits).toBe(3);
    expect(await spendUserCredits(user.id, 1)).toBe(true);
    expect((await getUserById(user.id))?.credits).toBe(2);
  });

  it("R7: a second free-use claim returns false instead of granting again", async () => {
    const user = await createUser("phaseb-free@example.com");
    expect(await markFreeReadingUsed(user.id)).toBe(true);
    expect(await markFreeReadingUsed(user.id)).toBe(false);
    expect(await hasUsedFreeReading(user.id)).toBe(true);
    expect(await markFreeInterpretationUsed(user.id, "western")).toBe(true);
    expect(await markFreeInterpretationUsed(user.id, "western")).toBe(false);
    expect(await hasUsedFreeInterpretation(user.id, "western")).toBe(true);
    expect(await markFreeInterpretationUsed(user.id, "vedic")).toBe(true);
  });

  it("R5: setUserPassword bumps the session version and returns it", async () => {
    const user = await createUserWithPassword("phaseb-pwd@example.com", "salt:hash");
    expect(user?.pwd_ver).toBe(1);
    expect(await setUserPassword(user!.id, "salt:hash2")).toBe(2);
    expect((await getUserById(user!.id))?.pwd_ver).toBe(2);
    expect(await setUserPassword(user!.id, "salt:hash3")).toBe(3);
  });
});
