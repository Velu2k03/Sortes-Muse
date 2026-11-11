/**
 * Batch 2b (SSE streaming): read a Server-Sent Events response body
 * and call `onEvent` per complete event. Used by the intake flow to
 * receive the reading as it is generated.
 *
 * Parsing rules (the subset the server sends):
 * - Lines are split on `\n` (a `\r` is stripped). A blank line ends
 *   one event.
 * - `event: <name>` sets the event name for the current event
 *   (default "message").
 * - `data: <text>` appends a line to the event's data (multiple
 *   `data:` lines are joined with `\n`).
 * - `: ...` is a comment (a heartbeat); it is ignored.
 * - A chunk may split a line in half; the buffer holds the partial
 *   line until the rest arrives. A final partial event at stream end
 *   is delivered (the server always terminates its events, but a
 *   dropped connection may cut one off).
 * - `data` is parsed as JSON when it parses, otherwise passed
 *   through as a string.
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

export async function readSse(
  res: Response,
  onEvent: (event: SseEvent) => void
): Promise<void> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length === 0) return;
    const raw = dataLines.join("\n");
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Not JSON: pass the raw string through.
    }
    onEvent({ event: eventName, data });
    eventName = "message";
    dataLines = [];
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line === "") {
        dispatch();
      } else if (line.startsWith(":")) {
        // Comment (heartbeat): ignored.
      } else if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).replace(/^ /, ""));
      }
      // Any other field is ignored.
    }
  }
  // Flush the decoder and deliver a final partial event, if any.
  buffer += decoder.decode();
  if (buffer.length > 0) {
    const line = buffer.replace(/\r$/, "");
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    } else if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    }
  }
  dispatch();
}
