import type { Reading } from "./types";
import type { SavedReport } from "./reports";

const K = {
  credits: "sortes-credits",
  freeReadingUsed: "sortes-free-reading-used",
  dailyCard: "sortes-daily-card",
  history: "sortes-reading-history",
  aiCache: "sortes-ai-cache",
  installDismissed: "sortes-install-dismissed",
  purchases: "sortes-purchases",
  dailyStreak: "sortes-daily-streak",
  reports: "sortes-reports",
  birthProfiles: "sortes-birth-profiles",
  intakeDraft: "sortes-intake-draft",
  returnTo: "sortes-return-to",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    console.warn(`[sortes] could not read local key ${key}; using fallback`);
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (key === K.credits) {
      window.dispatchEvent(new Event("sortes:credits-changed"));
    }
  } catch {
    /* storage full or unavailable; non-fatal */
  }
}

// Credits (guest wallet; synced to DB for logged-in users in Phase 7)
export function getCredits(): number {
  return read<number>(K.credits, 0);
}
export function setCredits(n: number): void {
  write(K.credits, Math.max(0, Math.floor(n)));
}
export function addCredits(n: number): number {
  const next = getCredits() + n;
  setCredits(next);
  return next;
}
export function spendCredit(n = 1): boolean {
  const c = getCredits();
  if (c < n) return false;
  setCredits(c - n);
  return true;
}

// Purchase history (guest wallet; server transactions for signed-in users)
export interface Purchase {
  packId: string;
  readings: number;
  price: number;
  date: string;
}

export function getPurchaseHistory(): Purchase[] {
  return read<Purchase[]>(K.purchases, []);
}

// First reading free
export function freeReadingUsed(): boolean {
  return read<boolean>(K.freeReadingUsed, false);
}
export function markFreeReadingUsed(): void {
  write(K.freeReadingUsed, true);
}

// First chart interpretation free, per system
// Same pattern as tarot's freeReadingUsed: a device-local flag, checked
// in the charts page before any credit is spent. The server never sees
// this flag and never charges; the page spends 1 credit only when the
// flag for that system is already used.
export type ChartFreeSystem = "ziwei" | "western" | "vedic";
export function chartFreeUsed(system: ChartFreeSystem): boolean {
  return read<boolean>(`sortes-chart-free-used-${system}`, false);
}
export function markChartFreeUsed(system: ChartFreeSystem): void {
  write(`sortes-chart-free-used-${system}`, true);
}

// Daily card: one per calendar day
export interface DailyCardState {
  date: string; // YYYY-MM-DD
  cardId: string;
  reversed: boolean;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function getDailyCard(): DailyCardState | null {
  const s = read<DailyCardState | null>(K.dailyCard, null);
  if (!s || s.date !== todayKey()) return null;
  return s;
}

export function setDailyCard(cardId: string, reversed: boolean): DailyCardState {
  const s: DailyCardState = { date: todayKey(), cardId, reversed };
  write(K.dailyCard, s);
  recordDailyDraw();
  return s;
}

// Daily streak: consecutive days the seeker drew their card
export function getDailyStreak(): number {
  const days = read<string[]>(K.dailyStreak, []);
  if (days.length === 0) return 0;
  // Count back consecutive days from today (or yesterday, if today's
  // card has not been drawn yet this session).
  const today = todayKey();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let cursor = days.includes(today) ? today : yesterday;
  let streak = 0;
  const set = new Set(days);
  while (set.has(cursor)) {
    streak++;
    const cd = new Date(cursor + "T12:00:00");
    cd.setDate(cd.getDate() - 1);
    cursor = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}-${String(cd.getDate()).padStart(2, "0")}`;
  }
  return streak;
}

// Phase E (item 6): the gentle replacement for the streak. The
// streak counted consecutive days and reset to zero on a missed
// day; this counts days practiced in total and in the last 30, so
// it never resets. getDailyStreak stays exported: ReturnLoop still
// uses it, and that call site is a separate decision.
export function getDailyPracticeDays(): { total: number; last30: number } {
  const days = read<string[]>(K.dailyStreak, []);
  const total = days.length;
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 29);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const last30 = days.filter((day) => day >= fmt(cutoff) && day <= fmt(today)).length;
  return { total, last30 };
}

function recordDailyDraw(): void {
  const days = read<string[]>(K.dailyStreak, []);
  const today = todayKey();
  if (!days.includes(today)) {
    write(K.dailyStreak, [...days.slice(-365), today]);
  }
}

// Reading history
const MAX_HISTORY = 100;

export function getHistory(): Reading[] {
  return read<Reading[]>(K.history, []);
}

export function saveReading(r: Reading): void {
  const h = getHistory();
  h.unshift(r);
  write(K.history, h.slice(0, MAX_HISTORY));
}

export function getReading(id: string): Reading | null {
  return getHistory().find((r) => r.id === id) ?? null;
}

// M1.1: update an existing reading in place (by id), instead of
// saveReading's unshift, which would duplicate it. Returns the updated
// reading, or null when the id is not in local history.
export function updateReading(id: string, patch: Partial<Reading>): Reading | null {
  const h = getHistory();
  const idx = h.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const updated = { ...h[idx], ...patch, id: h[idx].id };
  h[idx] = updated;
  write(K.history, h.slice(0, MAX_HISTORY));
  return updated;
}

// M2.2: remove a reading from local history. True when one was removed.
export function deleteReading(id: string): boolean {
  const h = getHistory();
  const next = h.filter((r) => r.id !== id);
  if (next.length === h.length) return false;
  write(K.history, next);
  return true;
}

// The one id minter (readings, reports, chart interpretations). Browsers
// that expose crypto.randomUUID get a UUID, which the generate routes require.
export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function makeReading(partial: Omit<Reading, "id" | "createdAt">): Reading {
  return {
    ...partial,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
}

// M4.1: keep-forever reports, guest device-local mirror of the server
// reports table. Same shape as a saved report; birth inputs are never
// stored here, only positions, aspects, and the interpretation.
const MAX_REPORTS = 100;

export function getReports(): SavedReport[] {
  return read<SavedReport[]>(K.reports, []);
}

export function saveReport(r: SavedReport): void {
  const list = getReports();
  // Phase 3 (3.5): saving is idempotent — the same report id stores
  // once. The server branch already dedupes (ON CONFLICT DO NOTHING);
  // without this, the guest retry-save button after a failed save
  // would store the same report twice in device storage.
  if (list.some((x) => x.id === r.id)) return;
  list.unshift(r);
  write(K.reports, list.slice(0, MAX_REPORTS));
}

export function getReport(id: string): SavedReport | null {
  return getReports().find((r) => r.id === id) ?? null;
}

export function deleteReport(id: string): boolean {
  const list = getReports();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return false;
  write(K.reports, next);
  return true;
}

// Clear the device copies of per-user data: after an account deletion
// (Phase 3, 3.6), and on sign-out or session expiry (audit item 5), so a
// signed-out load of / never shows the previous user's reading, daily
// card, streak, or saved birth details. Only device-level flags stay
// (free-reading-used, install banner dismissal, theme, chart language).
export function clearLocalAccountData(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of [
      K.history, K.reports, K.credits, K.purchases, K.dailyCard, K.dailyStreak,
      K.aiCache, K.birthProfiles, K.intakeDraft, K.returnTo, "sortes-birth-details",
    ]) localStorage.removeItem(key);
    // Checkout email prefill (per-tab, but still the previous user's).
    window.sessionStorage?.removeItem("sortes-purchase-email");
  } catch {
    // Storage unavailable; there is nothing to clear.
  }
}

// Batch D (A3): the intake draft. Sign-in happens on /account (a full
// navigation away from the intake page), so what the seeker typed is kept on
// the device and restored on return. One draft at a time; it is cleared after
// a successful generation and on sign-out. Birth-sensitive answers are
// stripped by the caller before saving.
export interface IntakeDraft {
  slug: string;
  categoryKey: string | null;
  answers: Record<string, string>;
  story: string;
  question: string;
}

// Point 6: the draft holds a whole story (health included) in localStorage, so
// on a shared device it must not outlive the sitting. 6 hours covers leaving to
// sign in (even waiting on an email link) and coming back the same day, and is
// short enough that the next person on the device does not get it pre-filled.
export const INTAKE_DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

export function getIntakeDraft(slug: string): IntakeDraft | null {
  const d = read<(Partial<IntakeDraft> & { savedAt?: number }) | null>(K.intakeDraft, null);
  if (!d) return null;
  // No timestamp (older build) counts as expired. An expired draft is cleared.
  if (typeof d.savedAt !== "number" || Date.now() - d.savedAt > INTAKE_DRAFT_TTL_MS) {
    clearIntakeDraft();
    return null;
  }
  if (d.slug !== slug) return null;
  return {
    slug,
    categoryKey: typeof d.categoryKey === "string" ? d.categoryKey : null,
    answers: d.answers && typeof d.answers === "object" ? d.answers : {},
    story: typeof d.story === "string" ? d.story : "",
    question: typeof d.question === "string" ? d.question : "",
  };
}

export function saveIntakeDraft(d: IntakeDraft): void {
  write(K.intakeDraft, { ...d, savedAt: Date.now() });
}

export function clearIntakeDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(K.intakeDraft);
  } catch {
    // Storage unavailable; there is nothing to clear.
  }
}

// Point 6: where to land after signing in. The gate sends the seeker to
// /account?returnTo=/intake/<slug>. Password and code sign-in finish on that
// page, but Google and the email link come back through /auth/callback (which
// drops the query), so the path is also stashed here for an hour and consumed
// once the session exists. Same-site paths only: never an external URL.
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

export function stashReturnTo(path: string): void {
  write(K.returnTo, { path, at: Date.now() });
}

export function takeReturnTo(): string | null {
  const v = read<{ path?: string; at?: number } | null>(K.returnTo, null);
  if (typeof window === "undefined") return null;
  try { localStorage.removeItem(K.returnTo); } catch { /* nothing to clear */ }
  if (!v || typeof v.at !== "number" || Date.now() - v.at > 60 * 60 * 1000) return null;
  return safeReturnTo(v.path);
}

// AI cache: re-opening history never triggers a second API call
export function setCachedInterpretation(key: string, text: string): void {
  const cache = read<Record<string, string>>(K.aiCache, {});
  cache[key] = text;
  write(K.aiCache, cache);
}

// Phase 5 (5.2): saved birth profiles, local-only (same privacy
// model as remembered birth details). Birth data never leaves the
// device from here; only computed chart positions are ever sent.
import type { BirthProfile } from "./birth-profiles";

export function getBirthProfiles(): BirthProfile[] {
  const list = read<BirthProfile[]>(K.birthProfiles, []);
  return Array.isArray(list) ? list : [];
}

export function saveBirthProfiles(profiles: BirthProfile[]): void {
  write(K.birthProfiles, profiles);
}

// PWA prompts
export function installBannerDismissed(): boolean {
  return read<boolean>(K.installDismissed, false);
}
export function dismissInstallBanner(): void {
  write(K.installDismissed, true);
}

// PWA prompts: at most one prompt per session, whichever appears first.
// Session storage (not local storage) so the rule resets next session.
const SESSION_PROMPT_KEY = "sortes-prompt-shown-session";
export function promptShownThisSession(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(SESSION_PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}
export function markPromptShownThisSession(): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(SESSION_PROMPT_KEY, "1");
  } catch {
    // session storage unavailable; the per-session rule simply cannot apply.
  }
}
