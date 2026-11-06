import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateChat,
  getModelList,
  OPENROUTER_DEFAULT_MODELS,
} from "@/lib/ai";

const MODELS = ["model-a:free", "model-b:free", "model-c:free"];

function okResponse(text: string, model: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: text } }],
      model,
    }),
  };
}

describe("getModelList", () => {
  const OLD = process.env.OPENROUTER_MODEL;
  afterEach(() => {
    if (OLD === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = OLD;
  });

  it("uses the shipped :free chain in order by default", () => {
    delete process.env.OPENROUTER_MODEL;
    expect(getModelList()).toEqual(OPENROUTER_DEFAULT_MODELS.split(","));
    expect(getModelList()[0]).toContain(":free");
  });

  it("honours the OPENROUTER_MODEL override", () => {
    process.env.OPENROUTER_MODEL = "custom/one, custom/two ";
    expect(getModelList()).toEqual(["custom/one", "custom/two"]);
  });
});

describe("generateChat", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("tries models in order and returns the first success", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse(String((init as { body: string }).body));
      calls.push(body.model);
      if (body.model === "model-a:free") return { ok: false, status: 429 };
      return okResponse("hello from b", "model-b:free");
    });
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(res).toEqual({ text: "hello from b", model: "model-b:free" });
    expect(calls).toEqual(["model-a:free", "model-b:free"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("returns null when every model fails, and logs each failure", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503 }));
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(res).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logged.some((l: string) => l.includes("model-failed") && l.includes("elapsedMs"))).toBe(true);
    expect(logged.some((l: string) => l.includes("all-models-failed") && l.includes("elapsedMs"))).toBe(true);
  });

  it("discards text that fails validation and tries the next model", async () => {
    const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse(String((init as { body: string }).body));
      return body.model === "model-a:free"
        ? okResponse("too short", "model-a:free")
        : okResponse("a proper grounded reading text", "model-b:free");
    });
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      validate: (t) => t.length > 20,
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(res?.model).toBe("model-b:free");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("aborts a hanging model on timeout and moves to the next one", async () => {
    const fetchFn = vi.fn(
      async (_url: unknown, init: unknown) => {
        const signal = (init as { signal?: AbortSignal }).signal;
        // First model hangs until aborted; second answers at once.
        if (fetchFn.mock.calls.length === 1) {
          await new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          });
        }
        return okResponse("second model answered", "model-b:free");
      }
    );
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 20,
      retryDelayMs: 0,
    });
    expect(res).toEqual({ text: "second model answered", model: "model-b:free" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("aborts when response-body parsing (res.json) hangs and moves to next model", async () => {
    const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse(String((init as { body: string }).body));
      if (body.model === "model-a:free") {
        return {
          ok: true,
          json: () => new Promise(() => {}), // hangs forever
        };
      }
      return okResponse("recovered on second model", "model-b:free");
    });
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 25,
      retryDelayMs: 0,
    });
    expect(res).toEqual({
      text: "recovered on second model",
      model: "model-b:free",
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("stops chain when total timeout budget is exhausted", async () => {
    const fetchFn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { ok: false, status: 500 };
    });
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 50,
      totalTimeoutMs: 35,
      retryDelayMs: 0,
    });
    expect(res).toBeNull();
    // After 1st attempt (~30ms), remaining budget is <5ms, so subsequent model attempt times out quickly or chain stops
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logged.some((l: string) => l.includes("all-models-failed"))).toBe(true);
  });

  it("returns null without calling fetch when no API key is configured", async () => {
    const fetchFn = vi.fn();
    const res = await generateChat({
      apiKey: "",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(res).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
