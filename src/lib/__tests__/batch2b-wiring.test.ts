import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sseEvent, sseComment, sseResponse } from "@/lib/sse-server";
import { readSse } from "@/lib/sse-client";
import { generateChatStream } from "@/lib/ai";
import { POST as guestFreeUsedPOST } from "@/app/api/auth/guest-free-used/route";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

/** A real Response whose body is a ReadableStream of the given chunks. */
function streamResponse(chunks: string[], ok = true, status = 200): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: ok ? 200 : status, headers: { "Content-Type": "text/event-stream" } });
}

/** One OpenRouter streaming chunk for a content delta. */
function openRouterChunk(content: string, model = "model-a:free"): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }], model })}\n\n`;
}

describe("Batch 2b wiring (SSE streaming)", () => {
  it("formats one SSE event and one heartbeat comment", () => {
    expect(sseEvent("text", { delta: "hello" })).toBe(
      'event: text\ndata: {"delta":"hello"}\n\n'
    );
    expect(sseEvent("done", { reading: { id: "r1" } })).toBe(
      'event: done\ndata: {"reading":{"id":"r1"}}\n\n'
    );
    expect(sseComment("ping")).toBe(": ping\n\n");
    // A newline in a comment cannot inject a second event.
    expect(sseComment("a\nb")).toBe(": a b\n\n");
  });

  it("readSse parses multiple events, a comment, and a multi-line data field", async () => {
    const res = streamResponse([
      ": ping\n\n",
      'event: model\ndata: {"model":"model-a:free","attempt":0}\n\n',
      'event: text\ndata: {"delta":"The "}\n\n',
      'event: text\ndata: {"delta":"Fool"}\n\n',
      'event: done\ndata: {"interpretation":"The Fool"}\ndata: {"extra":1}\n\n',
    ]);
    const events: { event: string; data: unknown }[] = [];
    await readSse(res, (e) => events.push(e));
    expect(events).toEqual([
      { event: "model", data: { model: "model-a:free", attempt: 0 } },
      { event: "text", data: { delta: "The " } },
      { event: "text", data: { delta: "Fool" } },
      // Two data: lines join with a newline; the joined text is not
      // valid JSON, so it is passed through as a raw string.
      { event: "done", data: '{"interpretation":"The Fool"}\n{"extra":1}' },
    ]);
  });

  it("readSse joins a line split across two chunks and delivers a final partial event", async () => {
    const res = streamResponse([
      'event: text\ndata: {"delta":"The Fo',
      'ol"}\n\n',
      'event: done\ndata: {"interpretation":"done"}',
    ]);
    const events: { event: string; data: unknown }[] = [];
    await readSse(res, (e) => events.push(e));
    expect(events).toEqual([
      { event: "text", data: { delta: "The Fool" } },
      { event: "done", data: { interpretation: "done" } },
    ]);
  });

  it("generateChatStream yields deltas as they arrive and returns the full text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let capturedInit: { body: string } | undefined;
      const fetchFn = vi.fn(async (_url: string, init: { body: string }) => {
        void _url;
        capturedInit = init;
        return streamResponse([
          openRouterChunk("The "),
          openRouterChunk("Fool steps forward."),
          "data: [DONE]\n\n",
        ]);
      });
      const events: { type: string; model?: string; delta?: string }[] = [];
      const result = await generateChatStream(
        {
          apiKey: "test-key",
          system: "sys",
          user: "usr",
          models: ["model-a:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        },
        (e) => events.push(e as { type: string; model?: string; delta?: string })
      );
      expect(result).toEqual({ text: "The Fool steps forward.", model: "model-a:free" });
      expect(events).toEqual([
        { type: "model", model: "model-a:free", attempt: 0 },
        { type: "text", delta: "The " },
        { type: "text", delta: "Fool steps forward." },
      ]);
      // The request asked OpenRouter to stream.
      expect(capturedInit).toBeDefined();
      const body = JSON.parse(capturedInit!.body);
      expect(body.stream).toBe(true);
      expect(body.model).toBe("model-a:free");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generateChatStream moves to the next model when the first text fails validation", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchFn = vi.fn(async (_url: string, init: { body: string }) => {
        void _url;
        const model = JSON.parse(init.body).model as string;
        if (model === "model-a:free") {
          // Short text: the validator rejects it, so the chain moves on.
          return streamResponse([openRouterChunk("too short"), "data: [DONE]\n\n"]);
        }
        return streamResponse([openRouterChunk("A long enough reading that passes validation."), "data: [DONE]\n\n"]);
      });
      const events: { type: string; model?: string }[] = [];
      const result = await generateChatStream(
        {
          apiKey: "test-key",
          system: "sys",
          user: "usr",
          models: ["model-a:free", "model-b:free"],
          validate: (text) => text.length > 20,
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        },
        (e) => events.push(e as { type: string; model?: string })
      );
      expect(result?.model).toBe("model-b:free");
      expect(result?.text).toBe("A long enough reading that passes validation.");
      // The client sees a `model` event for the second attempt, so it
      // knows to reset its preview (the first attempt's text is discarded).
      expect(events.filter((e) => e.type === "model").map((e) => e.model)).toEqual([
        "model-a:free",
        "model-b:free",
      ]);
      // N1: the failed attempt already sent text, so a `reset` event
      // fires at once (before the next `model` event, after the retry
      // delay) and the client clears the preview immediately.
      expect(events.map((e) => e.type)).toContain("reset");
      const resetAt = events.findIndex((e) => e.type === "reset");
      const secondModelAt = events.findIndex((e) => e.type === "model" && e.model === "model-b:free");
      expect(resetAt).toBeGreaterThan(-1);
      expect(secondModelAt).toBeGreaterThan(resetAt);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generateChatStream discards a stream that ends without [DONE] (B1)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchFn = vi.fn(async (_url: string, init: { body: string }) => {
        const model = JSON.parse(init.body).model as string;
        if (model === "model-a:free") {
          // No [DONE]: the connection dropped mid-reading. The partial
          // text must NOT be served as a complete reading.
          return streamResponse([openRouterChunk("A partial reading, cut off")]);
        }
        return streamResponse([openRouterChunk("A complete reading from the second model."), "data: [DONE]\n\n"]);
      });
      const result = await generateChatStream(
        {
          apiKey: "test-key",
          system: "sys",
          user: "usr",
          models: ["model-a:free", "model-b:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        },
        () => {}
      );
      expect(result?.model).toBe("model-b:free");
      expect(result?.text).toBe("A complete reading from the second model.");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generateChatStream discards a mid-stream error chunk (B1)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchFn = vi.fn(async (_url: string, init: { body: string }) => {
        const model = JSON.parse(init.body).model as string;
        if (model === "model-a:free") {
          // OpenRouter reports a mid-stream failure as a 200 stream
          // with a chunk carrying `error` (finish_reason "error").
          return streamResponse([
            openRouterChunk("Some text before the failure."),
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "error" }], error: { message: "upstream boom" } })}\n\n`,
            "data: [DONE]\n\n",
          ]);
        }
        return streamResponse([openRouterChunk("Recovered on the second model."), "data: [DONE]\n\n"]);
      });
      const result = await generateChatStream(
        {
          apiKey: "test-key",
          system: "sys",
          user: "usr",
          models: ["model-a:free", "model-b:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        },
        () => {}
      );
      expect(result?.model).toBe("model-b:free");
      expect(result?.text).toBe("Recovered on the second model.");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generateChatStream discards a stream that ends with finish_reason length (B1)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchFn = vi.fn(async () =>
        streamResponse([
          openRouterChunk("A reading cut off at the token cap."),
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] })}\n\n`,
          "data: [DONE]\n\n",
        ])
      );
      const result = await generateChatStream(
        {
          apiKey: "test-key",
          system: "sys",
          user: "usr",
          models: ["model-a:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        },
        () => {}
      );
      expect(result).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generateChatStream never forwards a <think> block to the live preview (N2)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchFn = vi.fn(async () =>
        streamResponse([
          openRouterChunk("Hello "),
          openRouterChunk("<think>secret reasoning</think>"),
          openRouterChunk("World."),
          "data: [DONE]\n\n",
        ])
      );
      const deltas: string[] = [];
      const result = await generateChatStream(
        {
          apiKey: "test-key",
          system: "sys",
          user: "usr",
          models: ["model-a:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        },
        (e) => {
          if (e.type === "text") deltas.push(e.delta);
        }
      );
      expect(deltas.join("")).toBe("Hello World.");
      expect(result?.text).toBe("Hello World.");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generateChatStream moves on when a model returns a non-ok response", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchFn = vi.fn(async (_url: string, init: { body: string }) => {
        void _url;
        const model = JSON.parse(init.body).model as string;
        if (model === "model-a:free") {
          return new Response(JSON.stringify({ error: { message: "rate limited" } }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          });
        }
        return streamResponse([openRouterChunk("Recovered on the second model."), "data: [DONE]\n\n"]);
      });
      const result = await generateChatStream(
        {
          apiKey: "test-key",
          system: "sys",
          user: "usr",
          models: ["model-a:free", "model-b:free"],
          fetchFn: fetchFn as unknown as typeof fetch,
          retryDelayMs: 0,
        },
        () => {}
      );
      expect(result?.model).toBe("model-b:free");
      expect(result?.text).toBe("Recovered on the second model.");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("sseResponse sends an : open comment first, uses the SSE content type, and never claims no spend on a throw (B2, N5)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = sseResponse(async () => {
        throw new Error("db boom after the spend");
      });
      expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
      expect(res.headers.get("Connection")).toBeNull();
      const events: { event: string; data: unknown }[] = [];
      await readSse(res, (e) => events.push(e));
      // The error event is neutral (the spend may already have
      // committed) and is logged, not swallowed.
      expect(errorSpy).toHaveBeenCalled();
      const err = events.find((e) => e.event === "error")?.data as { error?: string; status?: number; unconfirmed?: boolean };
      expect(err).toBeDefined();
      expect(err.error).not.toContain("No Oracle was spent");
      expect(err.error).toContain("retrying will show it without charging again");
      expect(err.status).toBe(503);
      expect(err.unconfirmed).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("the guest-free-used endpoint sets the cookie after a successful generation (N4)", async () => {
    const res = await guestFreeUsedPOST();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("sortes_guest_free=");
    expect(cookie).toContain("HttpOnly");
  });

  it("the reading route streams (SSE) after the pre-checks, and the pre-checks still answer JSON", () => {
    const route = src("src/app/api/reading/generate/route.ts");
    expect(route).toContain("generateChatStream");
    expect(route).toContain("sseResponse");
    expect(route).toContain('sseEvent("done"');
    expect(route).toContain('sseEvent("error"');
    expect(route).toContain('sseEvent("text"');
    // The pre-checks still return JSON errors with their statuses
    // (rate limit, auth, balance, no key) before any streaming starts.
    expect(route).toContain("rateLimitExceeded()");
    expect(route).toContain('error: "Sign in to get this reading."');
    expect(route).toContain("preCheckOracleBalance");
    // The spend still happens only after a real generation, in the
    // same transaction as the save.
    expect(route).toContain("saveReadingWithSpend");
    // The replay is a stream too (one text event + done), not JSON.
    expect(route).toContain("replayed: true");
    // N2: when the health close is appended, it is sent as a final
    // `text` delta too, so the live preview matches `done`.
    expect(route).toContain('send(sseEvent("text", { delta: `\\n\\n${HEALTH_CLOSE}` }))');
    // N1: the route forwards the `reset` event to the client.
    expect(route).toContain('sseEvent("reset"');
    // No success path returns JSON any more: the only
    // NextResponse.json calls left are the pre-check errors
    // (each carries an `error` field, never an interpretation).
    expect(route).not.toContain("NextResponse.json({\n        interpretation:");
  });

  it("the intake flow reads the stream, handles done/error, and confirms a guest free reading", () => {
    const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(flow).toContain("readSse(res");
    expect(flow).toContain('event.event === "done"');
    expect(flow).toContain('event.event === "error"');
    expect(flow).toContain('event.event === "model"');
    expect(flow).toContain('event.event === "text"');
    // A stream that ends without `done` is unconfirmed, never "not spent".
    expect(flow).toContain("Generation stream ended without a result");
    expect(flow).toContain("unconfirmedMessage");
    // The guest-free cookie is set by a separate call after `done`
    // (the streaming response cannot set it).
    expect(flow).toContain('fetch("/api/auth/guest-free-used"');
    // The live preview is exposed for the wait screen.
    expect(flow).toContain("streamedText");
    expect(flow).toContain('event.event === "reset"');
  });

  it("the wait screen shows the streamed text live, via the static renderer", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("streamedText");
    expect(steps).toContain("<ReadingText text={streamedText}");
    expect(steps).toContain("Writing your reading");
    const flow = src("src/app/intake/[slug]/IntakeFlow.tsx");
    expect(flow).toContain("streamedText={streamedText}");
  });

  it("the guest-free-used endpoint sets the cookie after a successful generation", () => {
    const endpoint = src("src/app/api/auth/guest-free-used/route.ts");
    expect(endpoint).toContain("setGuestFreeUsed");
    expect(endpoint).toContain("export async function POST");
  });
});
