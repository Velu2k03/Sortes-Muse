/**
 * Shared helpers for the route tests that now speak SSE (Batch 2b).
 * The reading route returns a `text/event-stream` Response after its
 * pre-checks; the `done` event carries the payload the old JSON body
 * used to carry, and a mid-stream failure is an `error` event (with
 * a `status` field) on a 200 response, not an HTTP error status.
 * This file is a helper, not a test (it does not match *.test.ts).
 */
import { readSse } from "@/lib/sse-client";

/** A mock OpenRouter streaming Response: one content chunk, then [DONE]. */
export function openRouterStreamResponse(text: string, model = "model-a:free"): Response {
  const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }], model })}\n\n`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(chunk));
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Read a route SSE Response into its events, plus the `done` and `error` payloads. */
export async function readRouteSse(res: Response): Promise<{
  done: Record<string, unknown> | null;
  error: { error?: string; status?: number } | null;
  events: { event: string; data: unknown }[];
}> {
  const events: { event: string; data: unknown }[] = [];
  await readSse(res, (e) => events.push(e));
  const done =
    (events.find((e) => e.event === "done")?.data as Record<string, unknown> | undefined) ??
    null;
  const error =
    (events.find((e) => e.event === "error")?.data as
      | { error?: string; status?: number }
      | undefined) ?? null;
  return { done, error, events };
}
