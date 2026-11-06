import { describe, it, expect, vi, afterEach } from "vitest";
import { logGuestGeneration } from "@/lib/guestLogging";

describe("logGuestGeneration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs one structured JSON line with the route and no personal data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logGuestGeneration("reading/generate");
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line).toEqual({
      source: "sortes-guest",
      event: "guest-generation",
      route: "reading/generate",
    });
  });
});
