import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  isSpendBlockedPendingConversion: vi.fn(),
}));

import { getUserById, isSpendBlockedPendingConversion } from "@/lib/db";
import {
  conversionPendingMessage,
  costUnit,
  insufficientBalanceMessage,
  nothingSpent,
  preCheckOracleBalance,
} from "@/lib/credit-precheck";

const mockedGetUserById = vi.mocked(getUserById);
const mockedBlocked = vi.mocked(isSpendBlockedPendingConversion);

function user(credits: number) {
  return { id: "u1", credits } as unknown as Awaited<ReturnType<typeof getUserById>>;
}

describe("preCheckOracleBalance: unconverted Oracle holder (PR #175 P1)", () => {
  beforeEach(() => {
    mockedGetUserById.mockReset();
    mockedBlocked.mockReset();
  });

  it("an unconverted holder gets a 402 conversion message even with a large balance", async () => {
    // 118 Oracles would pass `credits < 100`; the block must stop it.
    mockedGetUserById.mockResolvedValue(user(118));
    mockedBlocked.mockResolvedValue(true);
    const r = await preCheckOracleBalance("u1", true, "reading", 100);
    expect(r.denied?.status).toBe(402);
    expect(await r.denied?.json()).toEqual({ error: conversionPendingMessage() });
    expect(conversionPendingMessage()).toMatch(/being converted to credits.*No credits were spent\./);
    expect(mockedBlocked).toHaveBeenCalledWith("u1");
  });

  it("a converted or no-Oracle user passes on balance as before", async () => {
    mockedGetUserById.mockResolvedValue(user(35_300));
    mockedBlocked.mockResolvedValue(false);
    const r = await preCheckOracleBalance("u1", true, "reading", 100);
    expect(r.denied).toBeUndefined();
  });

  it("a free use (required=false) never checks the block", async () => {
    mockedBlocked.mockResolvedValue(true);
    const r = await preCheckOracleBalance("u1", false, "reading", 100);
    expect(r.denied).toBeUndefined();
    expect(mockedBlocked).not.toHaveBeenCalled();
  });
});

describe("preCheckOracleBalance (F11)", () => {
  beforeEach(() => {
    mockedGetUserById.mockReset();
    mockedBlocked.mockReset();
    mockedBlocked.mockResolvedValue(false);
  });

  it("free / not required: no fetch, no denial", async () => {
    const r = await preCheckOracleBalance("u1", false, "reading");
    expect(r.denied).toBeUndefined();
    expect(mockedGetUserById).not.toHaveBeenCalled();
    const guest = await preCheckOracleBalance(undefined, true, "report");
    expect(guest.denied).toBeUndefined();
    expect(mockedGetUserById).not.toHaveBeenCalled();
  });

  it("sufficient balance: passes and returns the fetched user", async () => {
    mockedGetUserById.mockResolvedValue(user(1));
    const r = await preCheckOracleBalance("u1", true, "follow-up");
    expect(r.denied).toBeUndefined();
    expect("user" in r && r.user?.credits).toBe(1);
    expect(mockedGetUserById).toHaveBeenCalledWith("u1");
  });

  it("insufficient balance or missing user: 402 with the route's noun", async () => {
    mockedGetUserById.mockResolvedValue(user(0));
    const r = await preCheckOracleBalance("u1", true, "interpretation");
    expect(r.denied?.status).toBe(402);
    // Credit cutover: the flag is ON, so the unit is credits. The
    // default cost is 1, which must read "1 credit", not "1 credits"
    // (the D5 rehearsal pluralization fix, c535154).
    expect(await r.denied?.json()).toEqual({
      error: "You need 1 credit for this interpretation. No credits were spent.",
    });

    mockedGetUserById.mockResolvedValue(null);
    const missing = await preCheckOracleBalance("u1", true, "report", 300);
    expect(missing.denied?.status).toBe(402);
    expect(await missing.denied?.json()).toEqual({
      error: "You need 300 credits for this report. No credits were spent.",
    });
  });

  it("a cost param checks against that cost (flag ON: credit unit)", async () => {
    // A 3-card reading costs 200 credits. A user with 100 credits
    // passes a 1-card check (100) but not a 3-card check (200); the
    // denial names the unit the user actually pays in.
    mockedGetUserById.mockResolvedValue(user(100));
    const ok = await preCheckOracleBalance("u1", true, "reading", 100);
    expect(ok.denied).toBeUndefined();
    const denied = await preCheckOracleBalance("u1", true, "reading", 200);
    expect(denied.denied?.status).toBe(402);
    expect(await denied.denied?.json()).toEqual({
      error: "You need 200 credits for this reading. No credits were spent.",
    });
  });

  it("shared copy helpers: singular, plural, and the no-spend sentence", () => {
    expect(costUnit(1)).toBe("1 credit");
    expect(costUnit(50)).toBe("50 credits");
    expect(nothingSpent()).toBe("No credits were spent.");
    expect(insufficientBalanceMessage(50, "follow-up")).toBe(
      "You need 50 credits for this follow-up. No credits were spent."
    );
  });
});
