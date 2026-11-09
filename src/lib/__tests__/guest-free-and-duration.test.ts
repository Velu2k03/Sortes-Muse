import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { AI_RETRY_TOTAL_TIMEOUT_MS } from "@/lib/ai";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined) }),
}));
vi.mock("@/lib/db", () => ({ getUserById: vi.fn() }));

import { guestFreeUsed, setGuestFreeUsed, GUEST_FREE_COOKIE } from "@/lib/auth";

describe("guest free-use cookie (item 1)", () => {
  beforeEach(() => jar.clear());

  it("is unused with no cookie, used after the server sets it", async () => {
    expect(await guestFreeUsed()).toBe(false);
    const set = vi.fn();
    await setGuestFreeUsed({ cookies: { set } });
    const [name, value, opts] = set.mock.calls[0];
    expect(name).toBe(GUEST_FREE_COOKIE);
    expect(opts.httpOnly).toBe(true);
    jar.set(name, value);
    expect(await guestFreeUsed()).toBe(true);
  });

  it("ignores a forged or tampered cookie", async () => {
    jar.set(GUEST_FREE_COOKIE, "1");
    expect(await guestFreeUsed()).toBe(false);
    const set = vi.fn();
    await setGuestFreeUsed({ cookies: { set } });
    jar.set(GUEST_FREE_COOKIE, set.mock.calls[0][1].slice(0, -3) + "abc");
    expect(await guestFreeUsed()).toBe(false);
  });

  it("does not accept a session JWT as a free-use token", async () => {
    const { createSession } = await import("@/lib/auth");
    jar.set(GUEST_FREE_COOKIE, await createSession("u", "a@b.co"));
    expect(await guestFreeUsed()).toBe(false);
  });
});

// Item 3: every AI route must declare a maxDuration that covers the
// retry budget, or the platform can kill a paid request mid-flight.
describe("AI routes declare maxDuration >= retry budget (item 3)", () => {
  it.each([
    "src/app/api/reading/generate/route.ts",
    "src/app/api/reading/follow-up/route.ts",
    "src/app/api/chart/interpret/route.ts",
    "src/app/api/reports/generate/route.ts",
  ])("%s", (file) => {
    const m = readFileSync(file, "utf8").match(/export const maxDuration = (\d+);/);
    expect(m, "maxDuration missing").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(AI_RETRY_TOTAL_TIMEOUT_MS / 1000);
  });
});
