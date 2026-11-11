/**
 * One shared OpenRouter client for every AI route (reading/generate,
 * reading/follow-up, chart/interpret, reports/generate). Phase 2, 2.3:
 * the four routes each ran their own copy of the same fetch loop with
 * the same model chain and timeout, so a fix to one never reached the
 * others. There is now exactly one place that talks to OpenRouter.
 *
 * Free models only: the chain stays on :free models (flat 1 Oracle
 * per reading/report is a pricing rule, not a model choice).
 * Models (Batch 9 order): openrouter/free, nvidia/nemotron-3-ultra-550b-a55b:free.
 * Xing4.0 was removed in Batch 9 (2026-11-11): OpenRouter returns 404
 * ("no longer available on OpenRouter"), so it can never answer again.
 *
 * Reliability & retry (Phase 8A, Task A2; Phase D rework 2026-11-07):
 * - Chain order (Batch 9): openrouter/free FIRST, then Nemotron Ultra.
 *   The router was the only model that ever answered in the Phase 7
 *   E2E, and independent sweeps (ayautomate, 2026-11-03) show it
 *   answering 3/3 on both test days. Leading with it stops every
 *   generation from first burning a 25 s Nemotron timeout.
 * - Per-model timeout (Phase D): Nemotron Ultra gets 60 s
 *   (AI_NEMOTRON_TIMEOUT_MS); every other model keeps 25 s
 *   (AI_TIMEOUT_MS). A 550B model needs 40-90 s for long-form prose
 *   (WebBrain p95 40.6 s; ShelraCode live test 80-87 s; OpenRouter p50
 *   throughput 25-119 tok/s means 1200 tokens take 10-48 s plus TTFB),
 *   so the old flat 25 s cut it off almost every time.
 * - Per-pass budget is 80 s (AI_TOTAL_TIMEOUT_MS), measured from each pass start.
 * - Overall wall-clock cap across both passes is 170 s (AI_RETRY_TOTAL_TIMEOUT_MS),
 *   comfortably within the empirically verified 300 s Vercel function limit.
 * - Bounded server-side retry: exactly ONE retry pass (2 passes total) if all
 *   models in the chain fail on the first pass.
 * - Spend safety: callers pre-check balance, call generateChat, and only spend
 *   after acceptable text is returned. Retry happens before any database write.
 *
 * Batch 9 budget arithmetic (worst case per pass, new order):
 * router 25 s + Nemotron 60 s = 85 s, which exceeds the 80 s
 * per-pass budget, so the per-attempt timeout is clamped to the
 * remaining pass budget: when the router hangs its full 25 s,
 * Nemotron effectively gets ~55 s in that pass. In the typical case
 * the router fails fast (empty/429 in seconds), so Nemotron gets its
 * full 60 s. Two passes are at most 160 s plus retry delays (~1 s),
 * inside the 170 s overall cap and far inside the 300 s Vercel
 * limit. Typical success path after the reorder: router answers in
 * pass 1 (~5-15 s), or pass 1 costs ~60 s (router fast-fail +
 * Nemotron 60 s) and the router answers in pass 2 (~10 s), totalling
 * ~70 s, under the ~115 s proxied-request watch item.
 * Worst-case full failure is still ~161 s, past that watch item; if
 * the 120 s proxied timeout proves real, a total failure would fail at
 * the proxy rather than at our cap, which is a failure-mode question
 * for the E2E measurement, not a reason to shrink the cap (shrinking
 * it would only turn slow successes into failures).
 *
 * Logging:
 * - Failures logged as structured JSON to console.error ("model-failed",
 *   "chain-timeout", "all-models-failed", "no-api-key").
 * - Non-OK responses include a `detail` field in "model-failed" (first 200 chars
 *   of error.message or statusText) to distinguish upstream 429s from platform caps.
 * - Second pass start logs "chain-retry" (source "sortes-ai", pass 2, elapsedMs).
 * - Successful generations log "model-succeeded" with model slug attempted,
 *   elapsedMs, attemptIndex, pass, and caller route (when provided).
 *   Never logs API keys, prompt text, or response content.
 *
 * Investigation findings (2026-11-07, Phase D re-verification):
 * - Nemotron Ultra 550B: long-form p95 latency is 80-87 s on prose; 25 s timeout
 *   explains timeouts on long outputs. Phase D raises its timeout to 60 s
 *   (covers WebBrain p95 40.6 s and the throughput-math worst case of
 *   ~58 s for 1200 tokens; ShelraCode 80-87 s stays out of reach inside
 *   two passes, documented in the decision log).
 * - Xing4.0: REMOVED in Batch 9 (2026-11-11). OpenRouter returns 404
 *   ("no longer available on OpenRouter"), so it can never answer
 *   again. It was last in the chain (chronic upstream 429s from Phala
 *   saturation); the 2026-11-11 production verification saw it 404 on
 *   every attempt, and generation failed 3 times before succeeding.
 * - openrouter/free: dynamic router pool; retrying re-draws an available free model.
 *   Moved FIRST in Phase D: it was the only model that ever answered in the
 *   Phase 7 E2E. Caveat (ayautomate 2026-11-03): the router can draw a
 *   content-safety classifier that does not follow chat instructions; the
 *   prose validator discards such draws and the chain moves on.
 * - Gemma 4 free models (31B, 26B): 0/3 with 429 every time on both Oct 29
 *   and Nov 3 sweeps, so they were NOT added to the chain.
 * - Nemotron 3.5 Super VL / Lightning / Nano Omni Reasoning: 3/3 on tiny
 *   32-token probes (Nov 3), but no long-prose evidence for our workload,
 *   so NOT added; Phase D2 candidates after the E2E measures the new chain.
 * - Free-tier caps re-confirmed (OpenRouter limits docs; klymentiev checked
 *   2026-11-06; ayautomate 2026-11-03): one shared daily counter, 50/day
 *   under $10 lifetime purchases, 1,000/day after, 20/min, reset midnight UTC.
 *   Correction to the 8A note: ayautomate's Nov 3 run sent 78 requests and
 *   its key counter read 22 used of 1,000, exactly the count of successful
 *   answers, so rejected requests (404/403/429/503) appear NOT to count
 *   against the daily counter. OpenRouter's limits page does not state this
 *   either way; the E2E plan records the counter before/after to confirm
 *   on our own key.
 * - Vercel limit is 300 s (Fluid Compute default), allowing two full passes.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODELS =
  "openrouter/free,nvidia/nemotron-3-ultra-550b-a55b:free";
export const AI_TIMEOUT_MS = 25000;
/** Nemotron Ultra 550B needs longer for long-form prose (see header). */
export const AI_NEMOTRON_TIMEOUT_MS = 60000;
/** Per-model attempt timeouts (ms). Models not listed use AI_TIMEOUT_MS. */
export const AI_MODEL_TIMEOUTS_MS: Readonly<Record<string, number>> = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": AI_NEMOTRON_TIMEOUT_MS,
};

/** Attempt timeout for one model: the per-model value, or AI_TIMEOUT_MS. */
export function getModelTimeoutMs(model: string): number {
  return AI_MODEL_TIMEOUTS_MS[model] ?? AI_TIMEOUT_MS;
}

export const AI_TOTAL_TIMEOUT_MS = 80000;
export const AI_RETRY_TOTAL_TIMEOUT_MS = 170000;

export function stripThinking(text: string): string {
  return text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
}

/** Comma-separated fallback chain: the free router first (it was the only
    model that ever answered in the Phase 7 E2E), Nemotron Ultra second with
    a longer timeout. Xing4.0 was removed in Batch 9 (dead, OpenRouter
    404). Override with OPENROUTER_MODEL in env. */
export function getModelList(): string[] {
  return (process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODELS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface GenerateChatOptions {
  apiKey: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Return false to discard the text and try the next model. */
  validate?: (text: string) => boolean;
  /** Per-model attempt timeout. Defaults to the per-model map
      (getModelTimeoutMs): 60 s for Nemotron Ultra, 25 s otherwise.
      An explicit value wins for every model. */
  timeoutMs?: number;
  /** Total timeout budget per pass. Defaults to AI_TOTAL_TIMEOUT_MS. */
  totalTimeoutMs?: number;
  /** Overall timeout budget across all passes. Defaults to AI_RETRY_TOTAL_TIMEOUT_MS. */
  overallTimeoutMs?: number;
  /** Maximum number of passes over the model chain. Defaults to 2. */
  maxPasses?: number;
  /** Optional caller route name for logging (e.g. "reading/generate"). */
  route?: string;
  /** Base delay between model attempts (doubles per attempt). 0
      disables backoff; tests pass 0 so they stay fast. */
  retryDelayMs?: number;
  /** Models to try, in order. Defaults to getModelList(). */
  models?: string[];
  /** Defaults to the global fetch; tests inject a mock. */
  fetchFn?: typeof fetch;
}

export interface GeneratedChat {
  text: string;
  model: string;
}

class OpenRouterError extends Error {
  detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = "OpenRouterError";
    this.detail = detail;
  }
}

function logSuccess(
  model: string,
  elapsedMs: number,
  attemptIndex: number,
  pass: number,
  route?: string
): void {
  console.error(
    JSON.stringify({
      source: "sortes-ai",
      event: "model-succeeded",
      model,
      elapsedMs,
      attemptIndex,
      pass,
      ...(route !== undefined ? { route } : {}),
    })
  );
}

function logFailure(
  event: string,
  model: string | null,
  error: unknown,
  elapsedMs?: number,
  detail?: string
): void {
  console.error(
    JSON.stringify({
      source: "sortes-ai",
      event,
      model,
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
      ...(detail !== undefined ? { detail } : {}),
      error: error instanceof Error ? error.message : String(error),
    })
  );
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Read a short error detail from a non-ok OpenRouter response. */
async function readErrorDetail(res: Response): Promise<string | undefined> {
  let detail: string | undefined;
  try {
    if (typeof res.json === "function") {
      const errJson = await res.json();
      if (
        errJson &&
        typeof errJson === "object" &&
        "error" in errJson &&
        errJson.error &&
        typeof errJson.error.message === "string"
      ) {
        detail = errJson.error.message;
      }
    }
  } catch {
    // Body could not be parsed as JSON
  }
  if (!detail && res.statusText) {
    detail = res.statusText;
  }
  if (detail) {
    detail = detail.slice(0, 200);
  }
  return detail;
}

/** One OpenRouter request for one model: send, check status, parse, validate. */
async function requestCompletion(
  opts: GenerateChatOptions,
  fetchFn: typeof fetch,
  model: string,
  signal: AbortSignal
): Promise<GeneratedChat> {
  const res = await fetchFn(OPENROUTER_URL, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://sortes.resonantatlas.com",
      "X-Title": "Sortes by Resonant Atlas",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 1200,
      reasoning: { exclude: true },
    }),
  });

  if (!res.ok) {
    throw new OpenRouterError(`OpenRouter ${res.status}`, await readErrorDetail(res));
  }

  const data = await res.json();
  const rawText: string | undefined = data?.choices?.[0]?.message?.content;
  const text = typeof rawText === "string" ? stripThinking(rawText) : undefined;
  if (!text) throw new Error("Empty model response");
  if (opts.validate && !opts.validate(text)) {
    throw new Error("Model response failed validation");
  }
  return { text, model: data?.model ?? model };
}

/** Start one model attempt racing the request against its own abort timer. */
function startAttempt(
  opts: GenerateChatOptions,
  fetchFn: typeof fetch,
  model: string,
  timeoutMs: number
): { result: Promise<GeneratedChat>; clear: () => void } {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Model attempt timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const executionPromise = requestCompletion(
    opts,
    fetchFn,
    model,
    controller.signal
  );

  // Prevent unhandled rejection if timeoutPromise settles first
  executionPromise.catch(() => {});

  return {
    result: Promise.race([executionPromise, timeoutPromise]),
    clear: () => clearTimeout(timer),
  };
}

// F23: one budget-exhaustion check for all three sites (shared by
// generateChat and generateChatStream). Logs the chain-timeout
// (naming the overall budget if that one ran out, otherwise the
// per-pass budget) and returns true; the caller then does
// `break passLoop`. The pass-retry site passes Infinity for
// remainingPass, so it checks the overall budget only, as before.
function budgetExhausted(
  remainingPass: number,
  remainingOverall: number,
  elapsedMs: number,
  totalTimeoutMs: number,
  overallTimeoutMs: number
): boolean {
  if (remainingPass > 0 && remainingOverall > 0) return false;
  const budget = remainingOverall <= 0 ? overallTimeoutMs : totalTimeoutMs;
  logFailure(
    "chain-timeout",
    null,
    `AI chain total timeout budget exhausted (${budget}ms)`,
    elapsedMs
  );
  return true;
}

export async function generateChat(
  opts: GenerateChatOptions
): Promise<GeneratedChat | null> {
  if (!opts.apiKey) {
    logFailure("no-api-key", null, "OPENROUTER_API_KEY is not configured");
    return null;
  }
  const models = opts.models ?? getModelList();
  const fetchFn = opts.fetchFn ?? fetch;
  const totalTimeoutMs = opts.totalTimeoutMs ?? AI_TOTAL_TIMEOUT_MS;
  const overallTimeoutMs = opts.overallTimeoutMs ?? AI_RETRY_TOTAL_TIMEOUT_MS;
  const maxPasses = opts.maxPasses ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 250;
  const overallStart = Date.now();

  passLoop: for (let pass = 1; pass <= maxPasses; pass++) {
    if (pass > 1) {
      const elapsedOverall = Date.now() - overallStart;
      if (budgetExhausted(Infinity, overallTimeoutMs - elapsedOverall, elapsedOverall, totalTimeoutMs, overallTimeoutMs)) {
        break passLoop;
      }
      console.error(
        JSON.stringify({
          source: "sortes-ai",
          event: "chain-retry",
          pass,
          elapsedMs: elapsedOverall,
        })
      );
    }

    const passStart = Date.now();

    for (let i = 0; i < models.length; i++) {
      const elapsedPass = Date.now() - passStart;
      const elapsedOverall = Date.now() - overallStart;
      const remainingPass = totalTimeoutMs - elapsedPass;
      const remainingOverall = overallTimeoutMs - elapsedOverall;

      if (budgetExhausted(remainingPass, remainingOverall, elapsedOverall, totalTimeoutMs, overallTimeoutMs)) {
        break passLoop;
      }

      const model = models[i];
      if (i > 0 && retryDelayMs > 0) {
        const delay = Math.min(
          retryDelayMs * 2 ** (i - 1),
          Math.max(0, totalTimeoutMs - (Date.now() - passStart)),
          Math.max(0, overallTimeoutMs - (Date.now() - overallStart))
        );
        if (delay > 0) {
          await sleep(delay);
        }
      }

      const attemptStart = Date.now();
      const remainingPassAfterDelay = totalTimeoutMs - (attemptStart - passStart);
      const remainingOverallAfterDelay = overallTimeoutMs - (attemptStart - overallStart);

      if (
        budgetExhausted(
          remainingPassAfterDelay,
          remainingOverallAfterDelay,
          attemptStart - overallStart,
          totalTimeoutMs,
          overallTimeoutMs
        )
      ) {
        break passLoop;
      }

      const effectiveTimeoutMs = Math.min(
        opts.timeoutMs ?? getModelTimeoutMs(model),
        remainingPassAfterDelay,
        remainingOverallAfterDelay
      );
      const attempt = startAttempt(opts, fetchFn, model, effectiveTimeoutMs);

      try {
        const result = await attempt.result;
        const elapsedMs = Date.now() - attemptStart;
        logSuccess(model, elapsedMs, i, pass, opts.route);
        return result;
      } catch (err) {
        const elapsedMs = Date.now() - attemptStart;
        const detail = err instanceof OpenRouterError ? err.detail : undefined;
        logFailure("model-failed", model, err, elapsedMs, detail);
        // Fall through to the next model in the chain.
      } finally {
        attempt.clear();
      }
    }
  }

  logFailure(
    "all-models-failed",
    null,
    "every model in the chain failed",
    Date.now() - overallStart
  );
  return null;
}

/* ------------------------------------------------------------------ */
/* Batch 2b (SSE streaming): the same model chain, but the text      */
/* arrives as it is generated instead of all at once at the end.     */
/* The route forwards the deltas to the browser as SSE events, so    */
/* the user sees the reading being written and the connection stays  */
/* alive (data flows) instead of dying silently at ~30 s (Claude    */
/* C3). The chain, timeouts, retry, and validation are identical to  */
/* `generateChat`; only the delivery differs.                        */
/* ------------------------------------------------------------------ */

export type ChatStreamEvent =
  | { type: "model"; model: string; attempt: number }
  | { type: "text"; delta: string }
  // N1: an attempt that already sent text failed (timeout, validation,
  // stream error). The client clears its preview at once, instead of
  // waiting for the next `model` event after the retry delay.
  | { type: "reset" };

/** One streaming OpenRouter request for one model: send, read the
    SSE chunks, call `onDelta` per content chunk, and return the full
    text once the stream ends (`data: [DONE]`). The complete text is
    validated exactly as in `requestCompletion`, so a stream whose
    text fails validation throws and the chain moves to the next model
    (the caller then tells the client a new attempt started, and the
    client resets its preview). */
async function requestCompletionStream(
  opts: GenerateChatOptions,
  fetchFn: typeof fetch,
  model: string,
  signal: AbortSignal,
  onDelta: (delta: string) => void
): Promise<GeneratedChat> {
  const res = await fetchFn(OPENROUTER_URL, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://sortes.resonantatlas.com",
      "X-Title": "Sortes by Resonant Atlas",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 1200,
      reasoning: { exclude: true },
      stream: true,
    }),
  });

  if (!res.ok) {
    throw new OpenRouterError(`OpenRouter ${res.status}`, await readErrorDetail(res));
  }
  const body = res.body;
  if (!body) throw new Error("Empty model response");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sawDone = false;
  // B1: the last non-null finish_reason from the stream. A stream
  // that ends without [DONE], or with finish_reason "length" (the
  // model hit its token cap mid-reading) or "error", is truncated
  // and must NOT be served as a complete reading.
  let finishReason: string | null = null;
  // N2: a <think> block must never flash in the live preview. The
  // final text is stripped by stripThinking, but the deltas go out
  // as they arrive, so filter them here. `inThink` tracks whether
  // the current position is inside an unclosed <think> block; text
  // inside one is dropped, text outside it is forwarded. A tag split
  // across two chunks is the one case this misses (the final text
  // is still stripped, so only the live preview could briefly show
  // a fragment).
  let inThink = false;
  const forwardable = (delta: string): string => {
    let out = "";
    let rest = delta;
    for (;;) {
      if (inThink) {
        const close = rest.toLowerCase().indexOf("</think>");
        if (close === -1) return out;
        inThink = false;
        rest = rest.slice(close + "</think>".length);
      } else {
        const open = rest.toLowerCase().indexOf("<think");
        if (open === -1) return out + rest;
        out += rest.slice(0, open);
        inThink = true;
        rest = rest.slice(open);
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (payload === "[DONE]") {
        sawDone = true;
        break;
      }
      try {
        const chunk = JSON.parse(payload);
        // B1: OpenRouter reports a mid-stream failure as a 200
        // stream with a chunk carrying `error` (and
        // finish_reason "error"). Treat it as a failed attempt.
        if (chunk?.error) {
          const msg =
            typeof chunk.error.message === "string"
              ? chunk.error.message
              : "Upstream stream error";
          throw new Error(`OpenRouter stream error: ${msg}`);
        }
        const reason: string | null | undefined =
          chunk?.choices?.[0]?.finish_reason;
        if (typeof reason === "string" && reason.length > 0) {
          finishReason = reason;
        }
        const delta: string | undefined =
          chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          const clean = forwardable(delta);
          if (clean.length > 0) {
            text += clean;
            onDelta(clean);
          }
        }
      } catch (err) {
        // A malformed chunk is skipped; the stream continues. A
        // stream error (thrown above) is rethrown, not swallowed.
        if (err instanceof Error && err.message.startsWith("OpenRouter stream error")) {
          throw err;
        }
      }
    }
    if (sawDone) break;
  }
  buffer += decoder.decode();
  // B1: a stream that ended without [DONE] is truncated (the
  // connection dropped mid-reading). Never serve it as complete.
  if (!sawDone) {
    throw new Error("Model stream ended without [DONE]");
  }
  if (finishReason === "length" || finishReason === "error") {
    throw new Error(`Model stream ended with finish_reason "${finishReason}"`);
  }
  const finalText = stripThinking(text);
  if (!finalText) throw new Error("Empty model response");
  if (opts.validate && !opts.validate(finalText)) {
    throw new Error("Model response failed validation");
  }
  return { text: finalText, model };
}

/** Start one streaming model attempt racing the request against its
    own abort timer (same pattern as `startAttempt`). */
function startAttemptStream(
  opts: GenerateChatOptions,
  fetchFn: typeof fetch,
  model: string,
  timeoutMs: number,
  onDelta: (delta: string) => void
): { result: Promise<GeneratedChat>; clear: () => void } {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Model attempt timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const executionPromise = requestCompletionStream(
    opts,
    fetchFn,
    model,
    controller.signal,
    onDelta
  );

  // Prevent unhandled rejection if timeoutPromise settles first
  executionPromise.catch(() => {});

  return {
    result: Promise.race([executionPromise, timeoutPromise]),
    clear: () => clearTimeout(timer),
  };
}

/**
 * Stream a chat completion through the same model chain as
 * `generateChat`. `onEvent` is called per model attempt and per text
 * delta as they arrive. Returns the full validated text and the model
 * that produced it, or null if every model fails. The caller (the
 * reading route) forwards the events to the browser and, on success,
 * spends and saves exactly as the non-streaming path does.
 */
export async function generateChatStream(
  opts: GenerateChatOptions,
  onEvent: (event: ChatStreamEvent) => void
): Promise<GeneratedChat | null> {
  if (!opts.apiKey) {
    logFailure("no-api-key", null, "OPENROUTER_API_KEY is not configured");
    return null;
  }
  const models = opts.models ?? getModelList();
  const fetchFn = opts.fetchFn ?? fetch;
  const totalTimeoutMs = opts.totalTimeoutMs ?? AI_TOTAL_TIMEOUT_MS;
  const overallTimeoutMs = opts.overallTimeoutMs ?? AI_RETRY_TOTAL_TIMEOUT_MS;
  const maxPasses = opts.maxPasses ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 250;
  const overallStart = Date.now();

  passLoop: for (let pass = 1; pass <= maxPasses; pass++) {
    if (pass > 1) {
      const elapsedOverall = Date.now() - overallStart;
      if (budgetExhausted(Infinity, overallTimeoutMs - elapsedOverall, elapsedOverall, totalTimeoutMs, overallTimeoutMs)) {
        break passLoop;
      }
      console.error(
        JSON.stringify({
          source: "sortes-ai",
          event: "chain-retry",
          pass,
          elapsedMs: elapsedOverall,
        })
      );
    }

    const passStart = Date.now();

    for (let i = 0; i < models.length; i++) {
      const elapsedPass = Date.now() - passStart;
      const elapsedOverall = Date.now() - overallStart;
      const remainingPass = totalTimeoutMs - elapsedPass;
      const remainingOverall = overallTimeoutMs - elapsedOverall;

      if (budgetExhausted(remainingPass, remainingOverall, elapsedOverall, totalTimeoutMs, overallTimeoutMs)) {
        break passLoop;
      }

      const model = models[i];
      if (i > 0 && retryDelayMs > 0) {
        const delay = Math.min(
          retryDelayMs * 2 ** (i - 1),
          Math.max(0, totalTimeoutMs - (Date.now() - passStart)),
          Math.max(0, overallTimeoutMs - (Date.now() - overallStart))
        );
        if (delay > 0) {
          await sleep(delay);
        }
      }

      const attemptStart = Date.now();
      const remainingPassAfterDelay = totalTimeoutMs - (attemptStart - passStart);
      const remainingOverallAfterDelay = overallTimeoutMs - (attemptStart - overallStart);

      if (
        budgetExhausted(
          remainingPassAfterDelay,
          remainingOverallAfterDelay,
          attemptStart - overallStart,
          totalTimeoutMs,
          overallTimeoutMs
        )
      ) {
        break passLoop;
      }

      const effectiveTimeoutMs = Math.min(
        opts.timeoutMs ?? getModelTimeoutMs(model),
        remainingPassAfterDelay,
        remainingOverallAfterDelay
      );
      onEvent({ type: "model", model, attempt: i });
      // N1: track whether this attempt already sent text, so a
      // failure can reset the client's preview at once.
      let sentText = false;
      const attempt = startAttemptStream(
        opts,
        fetchFn,
        model,
        effectiveTimeoutMs,
        (delta) => {
          sentText = true;
          onEvent({ type: "text", delta });
        }
      );

      try {
        const result = await attempt.result;
        const elapsedMs = Date.now() - attemptStart;
        logSuccess(model, elapsedMs, i, pass, opts.route);
        return result;
      } catch (err) {
        const elapsedMs = Date.now() - attemptStart;
        const detail = err instanceof OpenRouterError ? err.detail : undefined;
        logFailure("model-failed", model, err, elapsedMs, detail);
        if (sentText) onEvent({ type: "reset" });
        // Fall through to the next model in the chain.
      } finally {
        attempt.clear();
      }
    }
  }

  logFailure(
    "all-models-failed",
    null,
    "every model in the chain failed",
    Date.now() - overallStart
  );
  return null;
}
