import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateChat,
  getModelList,
  getModelTimeoutMs,
  OPENROUTER_DEFAULT_MODELS,
  AI_TIMEOUT_MS,
  AI_NEMOTRON_TIMEOUT_MS,
  stripThinking,
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

  it("uses the shipped :free chain in exact order by default (router first)", () => {
    delete process.env.OPENROUTER_MODEL;
    expect(getModelList()).toEqual([
      "openrouter/free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "xingchen-agi/xing4.0-29b-a4b:free",
    ]);
    expect(getModelList()).toEqual(OPENROUTER_DEFAULT_MODELS.split(","));
  });

  it("honours the OPENROUTER_MODEL override", () => {
    process.env.OPENROUTER_MODEL = "custom/one, custom/two ";
    expect(getModelList()).toEqual(["custom/one", "custom/two"]);
  });
});

describe("stripThinking", () => {
  it("removes single-line and multi-line <think>...</think> blocks", () => {
    expect(stripThinking("<think>internal trace</think>Clean text")).toBe("Clean text");
    expect(
      stripThinking("<think>\nline 1\nline 2\n</think>\n\nA thoughtful reading.")
    ).toBe("A thoughtful reading.");
  });

  it("removes multiple <think> blocks", () => {
    expect(
      stripThinking("<think>first</think>Part 1<think>second</think> Part 2")
    ).toBe("Part 1 Part 2");
  });

  it("returns empty string if output was only a thinking block", () => {
    expect(stripThinking("<think>only thoughts</think>")).toBe("");
  });

  it("leaves clean text untouched", () => {
    expect(stripThinking("A clean tarot reading without thinking blocks.")).toBe(
      "A clean tarot reading without thinking blocks."
    );
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

  it("returns null when every model fails across two passes, and logs each failure", async () => {
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
    expect(fetchFn).toHaveBeenCalledTimes(2 * MODELS.length);
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

  it("sends reasoning: { exclude: true } in OpenRouter request body", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
      capturedBody = JSON.parse(String((init as { body: string }).body));
      return okResponse("clean response", "model-a:free");
    });
    await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: ["model-a:free"],
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(capturedBody?.reasoning).toEqual({ exclude: true });
  });

  it("strips think blocks from returned content before validation", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "<think>\ninternal reasoning\n</think>\nTrue grounded reading",
            },
          },
        ],
        model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      }),
    }));
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: ["nvidia/nemotron-3-ultra-550b-a55b:free"],
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(res).toEqual({
      text: "True grounded reading",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    });
  });

  it("discards responses that contain only think blocks and moves to next model", async () => {
    const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse(String((init as { body: string }).body));
      if (body.model === "model-a:free") {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "<think>only thoughts</think>" } }],
            model: "model-a:free",
          }),
        };
      }
      return okResponse("clean response from b", "model-b:free");
    });
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(res).toEqual({
      text: "clean response from b",
      model: "model-b:free",
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("returns content from a reasoning-model-shaped response with message.reasoning present", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "The High Priestess invites quiet contemplation.",
              reasoning: "Step 1: interpret card symbolism. Step 2: tone check.",
            },
          },
        ],
        model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      }),
    }));
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: ["nvidia/nemotron-3-ultra-550b-a55b:free"],
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });
    expect(res).toEqual({
      text: "The High Priestess invites quiet contemplation.",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    });
  });

  // Phase 8A (A2) tests
  it("emits success log with model, elapsedMs, attemptIndex, pass, and route without secret or prompt", async () => {
    const fetchFn = vi.fn(async () => okResponse("grounded response", "model-b:free"));
    const apiKey = "secret-key-12345";
    const userPrompt = "deep-secret-user-prompt-content";
    const systemPrompt = "deep-secret-system-prompt-content";

    const res = await generateChat({
      apiKey,
      system: systemPrompt,
      user: userPrompt,
      models: ["model-b:free"],
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
      route: "reading/generate",
    });

    expect(res).toEqual({ text: "grounded response", model: "model-b:free" });
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const successLog = logged.find((l: string) => l.includes("model-succeeded"));
    expect(successLog).toBeDefined();

    const parsed = JSON.parse(successLog!);
    expect(parsed).toMatchObject({
      source: "sortes-ai",
      event: "model-succeeded",
      model: "model-b:free",
      attemptIndex: 0,
      pass: 1,
      route: "reading/generate",
    });
    expect(typeof parsed.elapsedMs).toBe("number");

    // Must NEVER log prompt text, api key, or model response text
    expect(successLog).not.toContain(apiKey);
    expect(successLog).not.toContain(userPrompt);
    expect(successLog).not.toContain(systemPrompt);
    expect(successLog).not.toContain("grounded response");
  });

  it("retries exactly once after all models fail once, then stops on success", async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      if (callCount <= 3) {
        return { ok: false, status: 500 };
      }
      return okResponse("pass 2 answered", "model-a:free");
    });

    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });

    expect(res).toEqual({ text: "pass 2 answered", model: "model-a:free" });
    expect(fetchFn).toHaveBeenCalledTimes(4);

    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const retryLog = logged.find((l: string) => l.includes("chain-retry"));
    expect(retryLog).toBeDefined();
    const parsedRetry = JSON.parse(retryLog!);
    expect(parsedRetry).toMatchObject({
      source: "sortes-ai",
      event: "chain-retry",
      pass: 2,
    });
    expect(typeof parsedRetry.elapsedMs).toBe("number");

    const successLog = logged.find((l: string) => l.includes("model-succeeded"));
    expect(successLog).toBeDefined();
    const parsedSuccess = JSON.parse(successLog!);
    expect(parsedSuccess).toMatchObject({
      source: "sortes-ai",
      event: "model-succeeded",
      model: "model-a:free",
      attemptIndex: 0,
      pass: 2,
    });
  });

  it("does not start a second pass when pass 1 succeeds", async () => {
    const fetchFn = vi.fn(async () => okResponse("immediate success", "model-a:free"));
    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: MODELS,
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
    });

    expect(res).toEqual({ text: "immediate success", model: "model-a:free" });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logged.some((l: string) => l.includes("chain-retry"))).toBe(false);
  });

  it("returns null after total failure across exactly two passes (2 x models.length)", async () => {
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
    expect(fetchFn).toHaveBeenCalledTimes(2 * MODELS.length);

    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logged.some((l: string) => l.includes("chain-retry"))).toBe(true);
    const allFailedLog = logged.find((l: string) => l.includes("all-models-failed"));
    expect(allFailedLog).toBeDefined();
  });

  it("respects the overall budget: tiny overallTimeoutMs returns null quickly without starting a second pass", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ok: false, status: 500 };
      });

      const resPromise = generateChat({
        apiKey: "k",
        system: "s",
        user: "u",
        models: ["model-a:free"],
        fetchFn: fetchFn as unknown as typeof fetch,
        overallTimeoutMs: 10,
        retryDelayMs: 0,
      });

      await vi.advanceTimersByTimeAsync(25);
      const res = await resPromise;

      expect(res).toBeNull();
      // Pass 1 ran 1 attempt taking 20ms (> 10ms budget). Before pass 2, overall budget is exhausted.
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(logged.some((l: string) => l.includes("chain-timeout"))).toBe(true);
      expect(logged.some((l: string) => l.includes("chain-retry"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes detail field truncated to at most 200 chars on non-OK response", async () => {
    const longErrorMessage = "Provider returned error: model is temporarily rate-limited upstream. ".repeat(10);
    expect(longErrorMessage.length).toBeGreaterThan(200);

    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          message: longErrorMessage,
        },
      }),
    }));

    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: ["xingchen-agi/xing4.0-29b-a4b:free"],
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
      maxPasses: 1,
    });

    expect(res).toBeNull();
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const failedLog = logged.find((l: string) => l.includes("model-failed"));
    expect(failedLog).toBeDefined();

    const parsed = JSON.parse(failedLog!);
    expect(parsed.event).toBe("model-failed");
    expect(parsed.error).toBe("OpenRouter 429");
    expect(parsed.detail).toBeDefined();
    expect(parsed.detail.length).toBe(200);
    expect(parsed.detail).toBe(longErrorMessage.slice(0, 200));
  });

  it("falls back to statusText for detail when error.message is not parseable", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => {
        throw new Error("Invalid JSON");
      },
    }));

    const res = await generateChat({
      apiKey: "k",
      system: "s",
      user: "u",
      models: ["model-a:free"],
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelayMs: 0,
      maxPasses: 1,
    });

    expect(res).toBeNull();
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const failedLog = logged.find((l: string) => l.includes("model-failed"));
    expect(failedLog).toBeDefined();

    const parsed = JSON.parse(failedLog!);
    expect(parsed.detail).toBe("Too Many Requests");
  });

  // Phase D: router-first chain + per-model timeouts
  describe("Phase D per-model timeouts", () => {
    it("gives Nemotron Ultra 60 s and every other model 25 s", () => {
      expect(AI_NEMOTRON_TIMEOUT_MS).toBe(60000);
      expect(AI_TIMEOUT_MS).toBe(25000);
      expect(getModelTimeoutMs("nvidia/nemotron-3-ultra-550b-a55b:free")).toBe(60000);
      expect(getModelTimeoutMs("xingchen-agi/xing4.0-29b-a4b:free")).toBe(25000);
      expect(getModelTimeoutMs("openrouter/free")).toBe(25000);
      expect(getModelTimeoutMs("some/future-model:free")).toBe(25000);
    });

    it("first fetch call uses openrouter/free under the default chain", async () => {
      const OLD = process.env.OPENROUTER_MODEL;
      delete process.env.OPENROUTER_MODEL;
      try {
        const calls: string[] = [];
        const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
          const body = JSON.parse(String((init as { body: string }).body));
          calls.push(body.model);
          return okResponse("router answered", body.model);
        });
        const res = await generateChat({
          apiKey: "k",
          system: "s",
          user: "u",
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        });
        expect(res?.model).toBe("openrouter/free");
        expect(calls[0]).toBe("openrouter/free");
      } finally {
        if (OLD === undefined) delete process.env.OPENROUTER_MODEL;
        else process.env.OPENROUTER_MODEL = OLD;
      }
    });

    it("Nemotron answers a 40 s call inside its 60 s timeout", async () => {
      vi.useFakeTimers();
      try {
        const fetchFn = vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 40000));
          return okResponse("slow but real reading", "nvidia/nemotron-3-ultra-550b-a55b:free");
        });
        const resPromise = generateChat({
          apiKey: "k",
          system: "s",
          user: "u",
          models: ["nvidia/nemotron-3-ultra-550b-a55b:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        });
        await vi.advanceTimersByTimeAsync(45000);
        const res = await resPromise;
        expect(res).toEqual({
          text: "slow but real reading",
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
        });
        expect(fetchFn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("an unlisted model still times out at 25 s on a 30 s call", async () => {
      vi.useFakeTimers();
      try {
        const fetchFn = vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30000));
          return okResponse("too late", "other-model:free");
        });
        const resPromise = generateChat({
          apiKey: "k",
          system: "s",
          user: "u",
          models: ["other-model:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        });
        await vi.advanceTimersByTimeAsync(60000);
        const res = await resPromise;
        expect(res).toBeNull();
        // Two passes, one timed-out attempt each.
        expect(fetchFn).toHaveBeenCalledTimes(2);
        const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(
          logged.some((l: string) => l.includes("timed out after 25000ms"))
        ).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("an explicit timeoutMs option overrides the per-model map", async () => {
      vi.useFakeTimers();
      try {
        const fetchFn = vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 40000));
          return okResponse("too late", "nvidia/nemotron-3-ultra-550b-a55b:free");
        });
        const resPromise = generateChat({
          apiKey: "k",
          system: "s",
          user: "u",
          models: ["nvidia/nemotron-3-ultra-550b-a55b:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          timeoutMs: 20,
          retryDelayMs: 0,
        });
        await vi.advanceTimersByTimeAsync(60000);
        const res = await resPromise;
        expect(res).toBeNull();
        expect(fetchFn).toHaveBeenCalledTimes(2);
        const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
        expect(
          logged.some((l: string) => l.includes("timed out after 20ms"))
        ).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
