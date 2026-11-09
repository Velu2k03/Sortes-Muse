/**
 * One shared OpenRouter client for every AI route (reading/generate,
 * reading/follow-up, chart/interpret, reports/generate). Phase 2, 2.3:
 * the four routes each ran their own copy of the same fetch loop with
 * the same model chain and timeout, so a fix to one never reached the
 * others. There is now exactly one place that talks to OpenRouter.
 *
 * Free models only: the chain stays on :free models (flat 1 Oracle
 * per reading/report is a pricing rule, not a model choice).
 * Models (Phase D order): openrouter/free, nvidia/nemotron-3-ultra-550b-a55b:free, xingchen-agi/xing4.0-29b-a4b:free.
 *
 * Reliability & retry (Phase 8A, Task A2; Phase D rework 2026-11-07):
 * - Chain order (Phase D): openrouter/free FIRST, then Nemotron Ultra,
 *   then Xing4.0. The router was the only model that ever answered in
 *   the Phase 7 E2E (3/3 on retry, 0/3 for the other two on first
 *   attempts), and independent sweeps (ayautomate, 2026-11-03) show it
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
 * Phase D budget arithmetic (worst case per pass, new order):
 * router 25 s + Nemotron 60 s + Xing4.0 ~5 s (429s are fast) = ~90 s,
 * which exceeds the 80 s per-pass budget, so the per-attempt timeout is
 * clamped to the remaining pass budget: when the router hangs its full
 * 25 s, Nemotron effectively gets ~54 s in that pass. In the typical
 * case the router fails fast (empty/429 in seconds), so Nemotron gets
 * its full 60 s. Two passes are at most 160 s plus retry delays
 * (~1 s), inside the 170 s overall cap and far inside the 300 s
 * Vercel limit. Typical success path after the reorder: router answers
 * in pass 1 (~5-15 s), or pass 1 costs ~69 s (router fast-fail +
 * Nemotron 60 s + Xing fast 429) and the router answers in pass 2
 * (~10 s), totalling ~80 s, under the ~115 s proxied-request watch item.
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
 * - Xing4.0: 429s are upstream provider (Phala) saturation, not account limits.
 *   Fresh evidence is mixed (ayautomate 2026-11-03: 0/3, worse than 2/3 on
 *   Oct 29; klymentiev daily test checked 2026-11-06: 3 of 7 days answered),
 *   so it stays LAST in the chain, not dropped. Re-evaluate if the Phase D
 *   E2E shows 0/X again.
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
  "openrouter/free,nvidia/nemotron-3-ultra-550b-a55b:free,xingchen-agi/xing4.0-29b-a4b:free";
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
    a longer timeout, Xing4.0 last (chronic upstream 429s). Override with
    OPENROUTER_MODEL in env. */
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

  // F23: one budget-exhaustion check for all three sites. Logs the
  // chain-timeout (naming the overall budget if that one ran out,
  // otherwise the per-pass budget) and returns true; the caller then
  // does `break passLoop`. The pass-retry site passes Infinity for
  // remainingPass, so it checks the overall budget only, as before.
  const budgetExhausted = (
    remainingPass: number,
    remainingOverall: number,
    elapsedMs: number
  ): boolean => {
    if (remainingPass > 0 && remainingOverall > 0) return false;
    const budget = remainingOverall <= 0 ? overallTimeoutMs : totalTimeoutMs;
    logFailure(
      "chain-timeout",
      null,
      `AI chain total timeout budget exhausted (${budget}ms)`,
      elapsedMs
    );
    return true;
  };

  passLoop: for (let pass = 1; pass <= maxPasses; pass++) {
    if (pass > 1) {
      const elapsedOverall = Date.now() - overallStart;
      if (budgetExhausted(Infinity, overallTimeoutMs - elapsedOverall, elapsedOverall)) {
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

      if (budgetExhausted(remainingPass, remainingOverall, elapsedOverall)) {
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
          attemptStart - overallStart
        )
      ) {
        break passLoop;
      }

      const effectiveTimeoutMs = Math.min(
        opts.timeoutMs ?? getModelTimeoutMs(model),
        remainingPassAfterDelay,
        remainingOverallAfterDelay
      );
      const controller = new AbortController();
      let timer: NodeJS.Timeout | undefined;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new Error(`Model attempt timed out after ${effectiveTimeoutMs}ms`)
          );
        }, effectiveTimeoutMs);
      });

      const executionPromise = (async (): Promise<GeneratedChat> => {
        const res = await fetchFn(OPENROUTER_URL, {
          method: "POST",
          signal: controller.signal,
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
          throw new OpenRouterError(`OpenRouter ${res.status}`, detail);
        }

        const data = await res.json();
        const rawText: string | undefined =
          data?.choices?.[0]?.message?.content;
        const text =
          typeof rawText === "string" ? stripThinking(rawText) : undefined;
        if (!text) throw new Error("Empty model response");
        if (opts.validate && !opts.validate(text)) {
          throw new Error("Model response failed validation");
        }
        return { text, model: data?.model ?? model };
      })();

      // Prevent unhandled rejection if timeoutPromise settles first
      executionPromise.catch(() => {});

      try {
        const result = await Promise.race([executionPromise, timeoutPromise]);
        const elapsedMs = Date.now() - attemptStart;
        logSuccess(model, elapsedMs, i, pass, opts.route);
        return result;
      } catch (err) {
        const elapsedMs = Date.now() - attemptStart;
        const detail = err instanceof OpenRouterError ? err.detail : undefined;
        logFailure("model-failed", model, err, elapsedMs, detail);
        // Fall through to the next model in the chain.
      } finally {
        clearTimeout(timer);
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
