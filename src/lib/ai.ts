/**
 * One shared OpenRouter client for every AI route (reading/generate,
 * reading/follow-up, chart/interpret, reports/generate). Phase 2, 2.3:
 * the four routes each ran their own copy of the same fetch loop with
 * the same model chain and timeout, so a fix to one never reached the
 * others. There is now exactly one place that talks to OpenRouter.
 *
 * Free models only: the chain stays on :free models (flat 1 Oracle
 * per reading/report is a pricing rule, not a model choice).
 * Models: nvidia/nemotron-3-ultra-550b-a55b:free, xingchen-agi/xing4.0-29b-a4b:free, openrouter/free.
 *
 * Reliability & retry (Phase 8A, Task A2):
 * - Per-model timeout is 25 s (AI_TIMEOUT_MS).
 * - Per-pass budget is 80 s (AI_TOTAL_TIMEOUT_MS), measured from each pass start.
 * - Overall wall-clock cap across both passes is 170 s (AI_RETRY_TOTAL_TIMEOUT_MS),
 *   comfortably within the empirically verified 300 s Vercel function limit.
 * - Bounded server-side retry: exactly ONE retry pass (2 passes total) if all
 *   models in the chain fail on the first pass.
 * - Spend safety: callers pre-check balance, call generateChat, and only spend
 *   after acceptable text is returned. Retry happens before any database write.
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
 * Investigation findings (2026-11-07):
 * - Nemotron Ultra 550B: long-form p95 latency is 80-87 s on prose; 25 s timeout
 *   explains timeouts on long outputs. Scoped retry preserves the model for now.
 * - Xing4.0: 429s are upstream provider (Phala) saturation, not account limits.
 * - openrouter/free: dynamic router pool; retrying re-draws an available free model.
 * - Vercel limit is 300 s (Fluid Compute default), allowing two full passes.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODELS =
  "nvidia/nemotron-3-ultra-550b-a55b:free,xingchen-agi/xing4.0-29b-a4b:free,openrouter/free";
export const AI_TIMEOUT_MS = 25000;
export const AI_TOTAL_TIMEOUT_MS = 80000;
export const AI_RETRY_TOTAL_TIMEOUT_MS = 170000;

export function stripThinking(text: string): string {
  return text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
}

/** Comma-separated fallback chain: fastest free models first, reliable
    workhorse last. Override with OPENROUTER_MODEL in env. */
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
  /** Per-model attempt timeout. Defaults to AI_TIMEOUT_MS. */
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
  const timeoutMs = opts.timeoutMs ?? AI_TIMEOUT_MS;
  const totalTimeoutMs = opts.totalTimeoutMs ?? AI_TOTAL_TIMEOUT_MS;
  const overallTimeoutMs = opts.overallTimeoutMs ?? AI_RETRY_TOTAL_TIMEOUT_MS;
  const maxPasses = opts.maxPasses ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 250;
  const overallStart = Date.now();

  passLoop: for (let pass = 1; pass <= maxPasses; pass++) {
    if (pass > 1) {
      const elapsedOverall = Date.now() - overallStart;
      if (overallTimeoutMs - elapsedOverall <= 0) {
        logFailure(
          "chain-timeout",
          null,
          `AI chain total timeout budget exhausted (${overallTimeoutMs}ms)`,
          elapsedOverall
        );
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

      if (remainingPass <= 0 || remainingOverall <= 0) {
        const budget = remainingOverall <= 0 ? overallTimeoutMs : totalTimeoutMs;
        logFailure(
          "chain-timeout",
          null,
          `AI chain total timeout budget exhausted (${budget}ms)`,
          elapsedOverall
        );
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

      if (remainingPassAfterDelay <= 0 || remainingOverallAfterDelay <= 0) {
        const budget = remainingOverallAfterDelay <= 0 ? overallTimeoutMs : totalTimeoutMs;
        logFailure(
          "chain-timeout",
          null,
          `AI chain total timeout budget exhausted (${budget}ms)`,
          attemptStart - overallStart
        );
        break passLoop;
      }

      const effectiveTimeoutMs = Math.min(
        timeoutMs,
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
