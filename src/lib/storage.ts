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

export function makeReading(partial: Omit<Reading, "id" | "createdAt">): Reading {
  return {
    ...partial,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

// Phase 3 (3.6): clear the device copies of account data after an
// account deletion (the server data is deleted by the DELETE route).
// Daily card, streak, AI cache, and install dismissal are device
// ritual state, not account data, so they stay.
export function clearLocalAccountData(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(K.history);
    localStorage.removeItem(K.reports);
    localStorage.removeItem(K.credits);
    localStorage.removeItem(K.purchases);
  } catch {
    // Storage unavailable; there is nothing to clear.
  }
}

// AI cache: re-opening history never triggers a second API call
export function getCachedInterpretation(key: string): string | null {
  const cache = read<Record<string, string>>(K.aiCache, {});
  return cache[key] ?? null;
}

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
