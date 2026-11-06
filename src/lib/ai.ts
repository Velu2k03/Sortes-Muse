/**
 * One shared OpenRouter client for every AI route (reading/generate,
 * reading/follow-up, chart/interpret, reports/generate). Phase 2, 2.3:
 * the four routes each ran their own copy of the same fetch loop with
 * the same model chain and timeout, so a fix to one never reached the
 * others. There is now exactly one place that talks to OpenRouter.
 *
 * Free models only: the chain stays on :free models (flat 1 Oracle
 * per reading/report is a pricing rule, not a model choice). A model
 * that errors, times out, returns nothing, or fails the caller's
 * validation is skipped and the next model in the chain is tried,
 * with a small backoff between attempts. Failures are logged as
 * structured JSON so a dead model is visible in server logs.
 *
 * Returns null when no model produced acceptable text (or no API key
 * is configured); callers fail honestly with no spend on that path.
 * Callers keep their own no-key 503 message and their own validation.
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODELS =
  "google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free,nvidia/nemotron-3.5-lightning:free";
export const AI_TIMEOUT_MS = 25000;
export const AI_TOTAL_TIMEOUT_MS = 80000;

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
  /** Total timeout budget across all models. Defaults to AI_TOTAL_TIMEOUT_MS. */
  totalTimeoutMs?: number;
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

function logFailure(
  event: string,
  model: string | null,
  error: unknown,
  elapsedMs?: number
): void {
  console.error(
    JSON.stringify({
      source: "sortes-ai",
      event,
      model,
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
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
  const retryDelayMs = opts.retryDelayMs ?? 250;
  const chainStart = Date.now();

  // Try each model in order; rate-limited or retired free models fail
  // fast and we move to the next one instead of giving up.
  for (let i = 0; i < models.length; i++) {
    const elapsedBeforeAttempt = Date.now() - chainStart;
    const remainingBudget = totalTimeoutMs - elapsedBeforeAttempt;
    if (remainingBudget <= 0) {
      logFailure(
        "chain-timeout",
        null,
        `AI chain total timeout budget exhausted (${totalTimeoutMs}ms)`,
        elapsedBeforeAttempt
      );
      break;
    }

    const model = models[i];
    if (i > 0 && retryDelayMs > 0) {
      const delay = Math.min(
        retryDelayMs * 2 ** (i - 1),
        Math.max(0, totalTimeoutMs - (Date.now() - chainStart))
      );
      if (delay > 0) {
        await sleep(delay);
      }
    }

    const attemptStart = Date.now();
    const remainingAfterDelay = totalTimeoutMs - (attemptStart - chainStart);
    if (remainingAfterDelay <= 0) {
      logFailure(
        "chain-timeout",
        null,
        `AI chain total timeout budget exhausted (${totalTimeoutMs}ms)`,
        attemptStart - chainStart
      );
      break;
    }

    const effectiveTimeoutMs = Math.min(timeoutMs, remainingAfterDelay);
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
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
      const data = await res.json();
      const text: string | undefined =
        data?.choices?.[0]?.message?.content?.trim();
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
      return result;
    } catch (err) {
      const elapsedMs = Date.now() - attemptStart;
      logFailure("model-failed", model, err, elapsedMs);
      // Fall through to the next model in the chain.
    } finally {
      clearTimeout(timer);
    }
  }

  logFailure(
    "all-models-failed",
    null,
    "every model in the chain failed",
    Date.now() - chainStart
  );
  return null;
}
