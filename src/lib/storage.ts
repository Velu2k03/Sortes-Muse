import type { DrawnCard, Reading } from "./types";

const K = {
  credits: "sortes-credits",
  freeReadingUsed: "sortes-free-reading-used",
  dailyCard: "sortes-daily-card",
  history: "sortes-reading-history",
  aiCache: "sortes-ai-cache",
  installDismissed: "sortes-install-dismissed",
  pushDismissed: "sortes-push-dismissed",
  purchases: "sortes-purchases",
  dailyStreak: "sortes-daily-streak",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
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

// ---- Credits (guest wallet; synced to DB for logged-in users in Phase 7) ----
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

// ---- Purchase history (guest wallet; server transactions for signed-in users) ----
export interface Purchase {
  packId: string;
  readings: number;
  price: number;
  date: string;
}

export function getPurchaseHistory(): Purchase[] {
  return read<Purchase[]>(K.purchases, []);
}

export function recordPurchase(p: Purchase): void {
  const list = getPurchaseHistory();
  list.unshift(p);
  write(K.purchases, list.slice(0, 50));
}

// ---- First reading free ----
export function freeReadingUsed(): boolean {
  return read<boolean>(K.freeReadingUsed, false);
}
export function markFreeReadingUsed(): void {
  write(K.freeReadingUsed, true);
}

// ---- Daily card: one per calendar day ----
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

// ---- Daily streak: consecutive days the seeker drew their card ----
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

// ---- Reading history ----
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

// ---- AI cache: re-opening history never triggers a second API call ----
export function getCachedInterpretation(key: string): string | null {
  const cache = read<Record<string, string>>(K.aiCache, {});
  return cache[key] ?? null;
}

export function setCachedInterpretation(key: string, text: string): void {
  const cache = read<Record<string, string>>(K.aiCache, {});
  cache[key] = text;
  write(K.aiCache, cache);
}

// ---- PWA prompts ----
export function installBannerDismissed(): boolean {
  return read<boolean>(K.installDismissed, false);
}
export function dismissInstallBanner(): void {
  write(K.installDismissed, true);
}
export function pushPromptDismissed(): boolean {
  return read<boolean>(K.pushDismissed, false);
}
export function dismissPushPrompt(): void {
  write(K.pushDismissed, true);
}
