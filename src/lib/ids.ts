// Point 1: client-minted attempt ids. Routes accept an optional UUID so a
// retry of the same attempt replays the saved row instead of spending again.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Thrown by the save functions when the id is not a UUID (callers map it to 400). */
export class InvalidIdError extends Error {
  constructor() {
    super("id must be a UUID");
  }
}

/** Defence in depth: a client-supplied id never becomes a row key unless it is a UUID. */
export function assertUuid(id: unknown): asserts id is string {
  if (!isUuid(id)) throw new InvalidIdError();
}

/**
 * Raised inside a save transaction when the insert wrote 0 rows (the id is
 * taken). Throwing rolls the spend back; the caller then tells a lost race
 * (same user, return the winner's row) from a foreign id (409).
 */
export class IdTakenError extends Error {
  constructor(readonly sameUser: boolean) {
    super("id already taken; rolled back");
  }
}
