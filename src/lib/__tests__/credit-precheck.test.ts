import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
}));

import { getUserById } from "@/lib/db";
import { preCheckOracleBalance } from "@/lib/credit-precheck";

const mockedGetUserById = vi.mocked(getUserById);

function user(credits: number) {
  return { id: "u1", credits } as unknown as Awaited<ReturnType<typeof getUserById>>;
}

describe("preCheckOracleBalance (F11)", () => {
  beforeEach(() => mockedGetUserById.mockReset());

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

  // D5 REHEARSAL BRANCH ONLY: the flag is ON, so the denial names the
  // credit unit. Main (flag OFF) expects "1 Oracle" / "2 Oracles" here.
  it("insufficient balance or missing user: 402 with the route's noun", async () => {
    mockedGetUserById.mockResolvedValue(user(0));
    const r = await preCheckOracleBalance("u1", true, "interpretation");
    expect(r.denied?.status).toBe(402);
    expect(await r.denied?.json()).toEqual({
      error: "You need 1 credit for this interpretation. No credits were spent.",
    });

    mockedGetUserById.mockResolvedValue(null);
    const missing = await preCheckOracleBalance("u1", true, "report");
    expect(missing.denied?.status).toBe(402);
    expect(await missing.denied?.json()).toEqual({
      error: "You need 1 credit for this report. No credits were spent.",
    });
  });

  it("a cost param checks against that cost (flag ON: credit unit)", async () => {
    // A 1-card reading costs 100 while the flag is ON. A user with 1
    // credit passes a cost-1 check but not a cost-2 check; the
    // denial names the unit the user actually pays in.
    mockedGetUserById.mockResolvedValue(user(1));
    const ok = await preCheckOracleBalance("u1", true, "reading", 1);
    expect(ok.denied).toBeUndefined();
    const denied = await preCheckOracleBalance("u1", true, "reading", 2);
    expect(denied.denied?.status).toBe(402);
    expect(await denied.denied?.json()).toEqual({
      error: "You need 2 credits for this reading. No credits were spent.",
    });
  });
});
