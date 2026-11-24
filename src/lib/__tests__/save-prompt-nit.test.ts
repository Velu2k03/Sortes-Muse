import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";

// Save-prompt nit (2026-11-24): a signed-in user saw "Sign in to save
// this reading" on /reading/[id]. Two causes: (1) the guest prompt
// rendered while /api/auth/me was still loading (~2 s live), and (2)
// a failed guest migration threw into refresh()'s catch and cleared
// a session /me had just confirmed.

const auth = vi.hoisted(() => ({
  value: { user: null as { id: string; email: string } | null, loading: true },
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => auth.value,
}));
vi.mock("@/components/ShareReading", () => ({ default: () => null }));
vi.mock("@/components/SupportPanel", () => ({ default: () => null }));
vi.mock("@/app/reading/[id]/useReadingDetail", () => ({
  useReading: () => ({
    reading: {
      id: "r1",
      spreadSlug: "three-card",
      spreadName: "Three Card",
      cards: [],
      createdAt: "2026-11-24T00:00:00.000Z",
      interpretation: "text",
      aiGenerated: true,
      free: false,
    },
    setReading: () => {},
  }),
  useReadingField: () => ({}),
  useFollowUp: () => ({}),
}));
vi.mock("@/app/reading/[id]/ReadingSections", () => {
  const none = () => null;
  return {
    AtAGlance: none,
    CardMeanings: none,
    CardRow: none,
    Interpretation: none,
    ThreeCardNudge: none,
    NewReadingPrompt: none,
    NextStepPanel: none,
    NotePanel: none,
    ReadingHeader: none,
    ReadingHeirloom: none,
    RevisitPanel: none,
    GuestKeepNotice: () => createElement("p", null, "GUEST_KEEP_NOTICE"),
    FollowUpThread: ({ isGuest }: { isGuest: boolean }) =>
      createElement("p", null, isGuest ? "FOLLOWUP_GUEST" : "FOLLOWUP_MEMBER"),
  };
});

const storage = vi.hoisted(() => ({ history: [] as unknown[] }));
vi.mock("@/lib/storage", () => ({
  getCredits: () => 0,
  setCredits: () => {},
  getHistory: () => storage.history,
  clearLocalAccountData: () => {},
  saveReading: () => {},
  updateReading: () => null,
  deleteReading: () => {},
}));
vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowser: () => null }));

async function renderPage() {
  const { default: ReadingDetail } = await import(
    "@/app/reading/[id]/ReadingDetailClient"
  );
  return renderToStaticMarkup(createElement(ReadingDetail, { id: "r1" }));
}

describe("reading page guest prompt waits for auth", () => {
  it("shows no guest prompt and no guest follow-up label while auth is loading", async () => {
    auth.value = { user: null, loading: true };
    const html = await renderPage();
    expect(html).not.toContain("GUEST_KEEP_NOTICE");
    expect(html).not.toContain("FOLLOWUP_GUEST");
  });

  it("shows the guest prompt for a confirmed signed-out user", async () => {
    auth.value = { user: null, loading: false };
    const html = await renderPage();
    expect(html).toContain("GUEST_KEEP_NOTICE");
    expect(html).toContain("FOLLOWUP_GUEST");
  });

  it("hides the guest prompt for a signed-in user", async () => {
    auth.value = { user: { id: "u1", email: "a@b.c" }, loading: false };
    const html = await renderPage();
    expect(html).not.toContain("GUEST_KEEP_NOTICE");
    expect(html).toContain("FOLLOWUP_MEMBER");
  });
});

describe("migrateGuestData never throws and never re-fetches /me", () => {
  let store: Record<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    vi.stubGlobal("window", { dispatchEvent: () => true });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    storage.history = [{ id: "g1" }];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function load() {
    const actual = await vi.importActual<typeof import("@/components/AuthProvider")>(
      "@/components/AuthProvider"
    );
    return actual.migrateGuestData;
  }

  it("resolves false (no throw) when the history sync aborts, and leaves MIGRATED_KEY unset for a retry", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const migrate = await load();
    await expect(migrate(Date.now() + 10000)).resolves.toBe(false);
    expect(store["sortes-migrated-v1"]).toBeUndefined();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/history"]);
  });

  it("resolves false when the history sync returns non-OK", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const migrate = await load();
    await expect(migrate(Date.now() + 10000)).resolves.toBe(false);
    expect(store["sortes-migrated-v1"]).toBeUndefined();
  });

  it("resolves true, sets MIGRATED_KEY, and makes no /api/auth/me call on success", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const migrate = await load();
    await expect(migrate(Date.now() + 10000)).resolves.toBe(true);
    expect(store["sortes-migrated-v1"]).toBe("1");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/history"]);
  });

  it("refresh() takes credits from its own /me before the migration runs", () => {
    const src = readFileSync("src/components/AuthProvider.tsx", "utf8").replace(/\s+/g, " ");
    expect(src).toContain(
      "setCredits(data.user.credits ?? null); if (!localStorage.getItem(MIGRATED_KEY)) { await migrateGuestData(deadline); }"
    );
  });
});
