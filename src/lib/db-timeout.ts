import { randomBytes } from "crypto";
import { TIMEOUT_ERROR_MESSAGE } from "./fetch-timeout";

// Leaf module (F21): split out of db.ts so db.ts <-> migrations.ts is no longer a cycle.

/**
 * Hang diagnosis (2026-11-07): the 10 s server-side statement_timeout
 * above never reaches the server through a transaction-mode pooler.
 * PgBouncer/Supavisor discard client startup parameters they do not
 * track, and statement_timeout is not one Postgres reports, so it
 * cannot be tracked. Proven on a local PgBouncer 1.22 transaction
 * pooler with this exact factory: SHOW statement_timeout returned 0
 * (direct Postgres: 10s) and pg_sleep(15) ran the full 15 s with no
 * 57014. The server-side half of the fix is a database-level setting
 * the pooler cannot strip — ALTER DATABASE postgres SET
 * statement_timeout = '10s' (runbook in docs/STAGING.md; staging
 * needs the DB password, production needs Velu's approval). This
 * client-side deadline is the other half: it bounds the waits the
 * server cannot see at all, because no statement has reached it yet
 * — waiting to acquire the max:1 pool connection (measured: a
 * SELECT 1 waited the full 20.0 s for a held connection) and
 * waiting in the pooler's queue for a server connection. 12 s sits
 * just above the 10 s server timeout so the server kills first when
 * its setting is in place; the client race is the backstop.
 *
 * Pool-unwedging (2026-11-07): the deadline is NOT a bare race.
 * The earlier version only rejected the caller's promise while the
 * underlying query kept holding the single max:1 connection, so a
 * never-settling holder wedged the whole Vercel instance — the 6
 * consecutive /api/auth/me failures in 7 minutes were one wedged
 * instance, not six slow queries, and zero 57014s prove the waits
 * are pre-statement. withDbTimeout now CANCELS the query on
 * timeout (below): a queued job is removed from the pool's waiting
 * list and rejected, an in-flight statement is cancelled
 * server-side via CancelRequest, and a transaction rolls back and
 * releases its lease — so the pool recovers with no manual release.
 * Callers still get the same friendly timeout message the fetch
 * layer already uses.
 *
 * Diagnosis round 4 (2026-11-07): the underlying error used to be
 * swallowed — the race absorbs the later rejection, nothing in the
 * DB/auth path logs it, so Vercel logs could only ever show the
 * friendly timeout message by construction. withDbTimeout now logs
 * two structured lines (see logDbTimeout below): one when the
 * deadline fires, one when the underlying promise settles after
 * the timeout already won, carrying the backend's eventual answer.
 * And every DB log line carries DB_INSTANCE_ID, a module-level
 * random hex generated once per process: Vercel logs expose no
 * instance id, so this is the only way to answer "same instance
 * or different instance" from the logs. Labels are static
 * call-site names — never query text or parameters (parameters
 * can contain emails).
 */
export const DB_INSTANCE_ID = randomBytes(4).toString("hex");

/** Flatten an error's cause chain to its distinct Postgres error codes, top-level first. */
function errorCodes(err: unknown): string[] {
  const codes: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur instanceof Error; depth++) {
    const withCode = cur as Error & { code?: unknown; cause?: unknown };
    const code =
      typeof withCode.code === "string" && withCode.code
        ? withCode.code
        : typeof withCode.code === "number"
          ? String(withCode.code)
          : "";
    if (code && !codes.includes(code)) codes.push(code);
    cur = withCode.cause;
  }
  return codes;
}

/** One line, max 200 chars, no newlines (Vercel log lines are single-line). */
function oneLine(value: string): string {
  const flat = value.replace(/[\r\n]+/g, " ").trim();
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat;
}

/**
 * Structured DB timeout log, console.error so it lands in Vercel
 * Runtime Logs as an Error line (console.log/info are not retained
 * on the Hobby plan). Exactly one line per event:
 * - event=db-timeout: the deadline fired. `cancel=issued` means the
 *   abort reached pool.cancel; `cancel=none` means the promise was
 *   not a postgres.js Query, so nothing could be cancelled. This is
 *   the pool outcome observable at fire time.
 * - event=db-timeout-settled: the underlying promise settled AFTER
 *   the timeout already won, with the backend's eventual answer:
 *   57014 = statement cancelled, CANCEL_UNANSWERED = cancel issued,
 *   server silent, CONNECTION_DESTROYED = socket died, 25P04 =
 *   transaction_timeout fired, resolved-late = the query actually
 *   completed, just too late. The code is the top-level error's
 *   code; when the cause chain carries a different code it is
 *   appended as `cause=` — the common case is
 *   code=CONNECTION_DESTROYED cause=CANCEL_UNANSWERED (the cancel
 *   went unanswered, so the socket was destroyed). If the
 *   underlying promise never settles, only the db-timeout line
 *   exists — which itself proves the wedge (nothing ever answered).
 */
export function logDbTimeout(
  label: string,
  event: "db-timeout" | "db-timeout-settled",
  err?: unknown,
  cancel?: "issued" | "none"
): void {
  const codes =
    event === "db-timeout-settled" && err !== undefined ? errorCodes(err) : [];
  const code =
    event === "db-timeout-settled"
      ? err === undefined
        ? "resolved-late"
        : (codes[0] ?? "unknown")
      : undefined;
  const causeField =
    event === "db-timeout-settled" && codes[1] !== undefined
      ? ` cause=${codes[1]}`
      : "";
  const message =
    event === "db-timeout-settled" && err instanceof Error && err.message
      ? ` message="${oneLine(err.message)}"`
      : "";
  const cancelField =
    event === "db-timeout" && cancel !== undefined ? ` cancel=${cancel}` : "";
  const codeField = code !== undefined ? ` code=${code}` : "";
  console.error(
    `[sortes-db] instance=${DB_INSTANCE_ID} event=${event} label=${label}${cancelField}${codeField}${causeField}${message}`
  );
}

export const DB_QUERY_TIMEOUT_MS = 12_000;

/** Client-side bound for the cold-start schema check in
 * ensureSchema (two fast SELECTs when nothing is pending). 30 s, not
 * 12 s: applying a pending migration can legitimately take longer
 * than a single query, and the in-app path only ever applies on
 * Preview/dev (tiny tables); production never applies in-app and the
 * operator CLI (scripts/migrate.mjs) has no timeout at all. */
export const DB_SCHEMA_TIMEOUT_MS = 30_000;

/** Race a DB promise against the query deadline above, and CANCEL
 * the underlying query when the deadline fires — a bare race only
 * rejects the caller's promise while the query keeps holding the
 * single max:1 connection (see the note on DB_QUERY_TIMEOUT_MS).
 * The promise is usually a postgres.js Query, which exposes
 * .signal() (types: PendingQueryModifiers). Attaching the
 * controller wires the abort to this.cancel() -> handler.cancel ->
 * pool.cancel (src/pool.js:603-615): a queued job is removed from
 * waiting and rejected with 57014, an in-flight statement gets a
 * CancelRequest and is killed server-side. The abort is the ONLY
 * cancel issued: a second, explicit cancel could hit an unrelated
 * statement if the query settled and its connection was reused in
 * the meantime. A caller may pass its own controller so the same
 * deadline also cancels work created inside a pg.begin callback
 * (see txWithSignal); otherwise one is created per call. Promises
 * that are not Queries (e.g. a bare pg.begin promise) keep the old
 * race behaviour — their inner queries carry the signal instead.
 * The optional `label` names the call site in the structured timeout
 * logs (see logDbTimeout); the default "db" covers the many call
 * sites not yet labelled. */
export async function withDbTimeout<T>(
  promise: Promise<T>,
  controller: AbortController = new AbortController(),
  label = "db"
): Promise<T> {
  const query = promise as Promise<T> & {
    signal?: (signal: AbortSignal) => unknown;
  };
  const cancellable = typeof query.signal === "function";
  if (typeof query.signal === "function") {
    query.signal(controller.signal);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      logDbTimeout(label, "db-timeout", undefined, cancellable ? "issued" : "none");
      reject(new Error(TIMEOUT_ERROR_MESSAGE));
    }, DB_QUERY_TIMEOUT_MS);
  });
  // Diagnosis round 4: the underlying error used to be swallowed by
  // the race. This settlement handler fires only if the timeout
  // already won, and logs the one structured line carrying the
  // backend's eventual answer (see logDbTimeout). Attaching the
  // handler consumes the later rejection, so a timed-out query that
  // settles afterwards can never surface as an unhandled rejection.
  // The handler never throws (errorCode/oneLine are pure).
  promise.then(
    () => {
      if (timedOut) logDbTimeout(label, "db-timeout-settled");
    },
    (err: unknown) => {
      if (timedOut) logDbTimeout(label, "db-timeout-settled", err);
    }
  );
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
