import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout";

describe("fetch-timeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("fetchWithTimeout", () => {
    it("rejects with the timeout message when the mocked fetch never resolves", async () => {
      const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
            return;
          }
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        fetchWithTimeout("/api/test", undefined, 50)
      ).rejects.toThrow("The request timed out. Please try again.");
    });

    it("passes through a fast successful fetch unchanged", async () => {
      const mockResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const res = await fetchWithTimeout("/api/test", undefined, 50);
      expect(res).toBe(mockResponse);
      expect(res.status).toBe(200);
    });

    it("passes through a fast fetch rejection unchanged (no timeout error masking)", async () => {
      const networkError = new TypeError("Failed to fetch");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

      await expect(
        fetchWithTimeout("/api/test", undefined, 50)
      ).rejects.toThrow("Failed to fetch");
    });
  });

  describe("withTimeout", () => {
    it("rejects with the timeout message when the promise never resolves", async () => {
      const neverResolving = new Promise<string>(() => {});
      await expect(withTimeout(neverResolving, 50)).rejects.toThrow(
        "The request timed out. Please try again."
      );
    });

    it("passes a fast resolving value through", async () => {
      const result = await withTimeout(Promise.resolve("hello"), 50);
      expect(result).toBe("hello");
    });
  });
});
