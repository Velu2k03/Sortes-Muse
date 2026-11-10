import { describe, it, expect } from "vitest";
import { isFreeAvailableFor } from "@/lib/free-reading";

// Batch 1 (C1): the free label follows the server record for signed-in
// users, the device flag for guests, and never promises "Free" while the
// server value is unknown.
describe("isFreeAvailableFor", () => {
  it("signed-in: free only when the server record says so", () => {
    expect(
      isFreeAvailableFor({ slug: "quick-insight", signedIn: true, serverFree: true, deviceFree: false })
    ).toBe(true);
    expect(
      isFreeAvailableFor({ slug: "quick-insight", signedIn: true, serverFree: false, deviceFree: true })
    ).toBe(false);
  });

  it("signed-in: unknown server value fails closed, never promises Free", () => {
    expect(
      isFreeAvailableFor({ slug: "quick-insight", signedIn: true, serverFree: null, deviceFree: true })
    ).toBe(false);
  });

  it("guest: the device flag decides", () => {
    expect(
      isFreeAvailableFor({ slug: "quick-insight", signedIn: false, serverFree: null, deviceFree: true })
    ).toBe(true);
    expect(
      isFreeAvailableFor({ slug: "quick-insight", signedIn: false, serverFree: null, deviceFree: false })
    ).toBe(false);
  });

  it("only Quick Insight is ever free", () => {
    expect(
      isFreeAvailableFor({ slug: "celtic-cross", signedIn: true, serverFree: true, deviceFree: true })
    ).toBe(false);
    expect(
      isFreeAvailableFor({ slug: "celtic-cross", signedIn: false, serverFree: null, deviceFree: true })
    ).toBe(false);
  });

  it("a prior session with no current user fails closed (the /me 429 case)", () => {
    // A failed /me leaves user null without setting loadError, so the
    // only signal is the session key. Trusting the device flag here
    // is the exact C1 bug by a second path.
    expect(
      isFreeAvailableFor({
        slug: "quick-insight",
        signedIn: false,
        serverFree: null,
        deviceFree: true,
        hadSession: true,
      })
    ).toBe(false);
  });

  it("a failed /me on a fresh device fails closed even with no session key", () => {
    expect(
      isFreeAvailableFor({
        slug: "quick-insight",
        signedIn: false,
        serverFree: null,
        deviceFree: true,
        hadSession: false,
        authFailed: true,
      })
    ).toBe(false);
  });

  it("no prior session is a genuine guest: the device flag decides", () => {
    expect(
      isFreeAvailableFor({
        slug: "quick-insight",
        signedIn: false,
        serverFree: null,
        deviceFree: true,
        hadSession: false,
      })
    ).toBe(true);
  });
});
