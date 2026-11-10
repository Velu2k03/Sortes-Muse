// Point 9: a follow-up on a reading the server does not have yet (the earlier
// sync failed) gets "Reading not found". Nothing is spent on that 404, so
// re-sync that one reading to /api/history and retry exactly once.
import type { Reading } from "@/lib/types";

export async function postFollowUp(
  reading: Reading,
  question: string,
  fetchFn: typeof fetch = fetch
): Promise<{ res: Response; data: { error?: string; followUps?: Reading["followUps"]; credits?: number } }> {
  const ask = async () => {
    const res = await fetchFn("/api/reading/follow-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, readingId: reading.id }),
    });
    return { res, data: await res.json() };
  };
  const first = await ask();
  if (first.res.status !== 404) return first;
  const sync = await fetchFn("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readings: [reading] }),
  }).catch(() => null);
  if (!sync?.ok) return first;
  return ask();
}
