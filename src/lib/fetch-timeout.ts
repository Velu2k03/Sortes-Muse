export const TIMEOUT_ERROR_MESSAGE = "The request timed out. Please try again.";

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  ) {
    return true;
  }
  return false;
}

/**
 * Fetch with a timeout abort. Rejects with a friendly timeout error
 * when aborted rather than leaking "AbortError" to the caller.
 */
export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  ms = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new Error(TIMEOUT_ERROR_MESSAGE);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Promise.race against a timer that rejects with the friendly timeout error.
 * Clears the timer in finally to prevent timer leaks.
 * The optional `label` names the call site in one structured log line
 * when the deadline fires (diagnosis round 4, 2026-11-07): a bare race
 * cancels nothing and used to swallow the underlying error, so without
 * the label the next failure could not say which wrapper stalled. The
 * line carries no per-instance id — this helper is generic; the DB
 * layer's own lines in the same call (withDbTimeout, labelled) carry
 * DB_INSTANCE_ID for instance correlation. Callers that pass no label
 * get no log line (unchanged behaviour).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms = 10000,
  label?: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (label !== undefined) {
        console.error(
          `[sortes-db] event=db-timeout label=${label} source=withTimeout`
        );
      }
      reject(new Error(TIMEOUT_ERROR_MESSAGE));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
