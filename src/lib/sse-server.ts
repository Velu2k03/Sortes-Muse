/**
 * Batch 2b (SSE streaming): format Server-Sent Events for the
 * reading generation stream. Pure functions, unit-tested.
 *
 * One event is:
 *   event: <name>\n
 *   data: <json>\n
 *   \n
 * A heartbeat is a comment line (`: ping`), which the client ignores
 * but which keeps the connection alive (and the proxy from timing
 * out) while the model chain is thinking before its first token.
 */
export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseComment(text: string): string {
  // A comment line must not contain a newline; strip them so a
  // caller cannot inject a second event.
  return `: ${text.replace(/[\r\n]+/g, " ")}\n\n`;
}

/**
 * Build a streaming Response for an SSE endpoint. `run` receives a
 * `send` function and writes the events; when it returns, the stream
 * closes. A `: ping` heartbeat is sent every 15 s while `run` is
 * still going, so the connection never goes idle before the first
 * token (and a proxy does not time it out). An initial `: open`
 * comment makes the first byte immediate instead of waiting for the
 * first ping or model event.
 * If `run` throws unexpectedly, a neutral `error` event is sent
 * instead of letting the stream end silently. B2: the wording must
 * NOT say "No Oracle was spent" — the throw can happen AFTER the
 * spend committed (e.g. a DB read in the done-path re-fetch), so the
 * honest message is that the outcome is unconfirmed and retrying
 * will show the saved reading without charging again. The error is
 * also logged, so a DB bug after the spend is not invisible.
 * N3: if the client disconnects, `cancel` sets `closed`; `send`
 * then no-ops (instead of throwing on a cancelled controller) and
 * `close()` is skipped, so a disconnect cannot abort the chain or
 * throw in `finally`.
 */
export function sseResponse(
  run: (send: (text: string) => void) => Promise<void>
): Response {
  let heartbeat: NodeJS.Timeout | undefined;
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        controller.enqueue(new TextEncoder().encode(text));
      };
      // N5: the first byte is immediate (an `: open` comment).
      send(sseComment("open"));
      heartbeat = setInterval(() => send(sseComment("ping")), 15000);
      try {
        await run(send);
      } catch (err) {
        console.error(
          JSON.stringify({
            source: "sortes-ai",
            event: "stream-error",
            error: err instanceof Error ? err.message : String(err),
          })
        );
        try {
          send(
            sseEvent("error", {
              error:
                "Something interrupted the reading. If you were charged, retrying will show it without charging again.",
              status: 503,
              unconfirmed: true,
            })
          );
        } catch {
          // The stream is already closed; nothing more to send.
        }
      } finally {
        clearInterval(heartbeat);
        if (!closed) controller.close();
      }
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      // N5: `Connection: keep-alive` is meaningless on HTTP/2 and
      // some runtimes reject it; the charset is explicit.
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
