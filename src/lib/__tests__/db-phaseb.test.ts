import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
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
} from "@/lib/db";

// Phase B (R5/R7/R10) on the local JSON branch. Same pattern as
// db-delete.test.ts: backs up data/local-db.json and restores it
// afterwards, and skips when a Postgres URL is configured (the
// Postgres branch is covered by db-postgres.test.ts).
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

describe.skipIf(hasPostgres)("Phase B guards (local JSON branch)", () => {
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
