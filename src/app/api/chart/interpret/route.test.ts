import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  hasUsedFreeInterpretation: vi.fn(),
  saveReadingWithSpend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST } from "@/app/api/chart/interpret/route";
import { getUserById, hasUsedFreeInterpretation, saveReadingWithSpend } from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedGetUserById = vi.mocked(getUserById);
const mockedSave = vi.mocked(saveReadingWithSpend);
const mockedHasUsedFree = vi.mocked(hasUsedFreeInterpretation);
const mockedGetSession = vi.mocked(getSession);

const CHART = {
  system: "western",
  sunSign: "Aries",
  ascendantSign: "Leo",
  midheavenSign: "Taurus",
  planets: [
    { name: "Sun", sign: "Aries", longitude: 10, house: 1, retrograde: false },
    { name: "Moon", sign: "Cancer", longitude: 100, house: 4, retrograde: false },
  ],
  cusps: [],
  aspects: [],
};

function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/chart/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

// A valid chart reflection under the Phase E validator: 300-600
// words, names placements back from the chart lines (Sun in Aries,
// Moon in Cancer, Leo rising), and closes with a question. The stub
// below returns this for every success-path test.
const CHART_TEXT = [
  "This chart reflection begins with your Sun in Aries, a placement that wants a clear direction and a first move it can believe in. The Sun in Aries does not ask for permission. It asks for a horizon, and then it walks toward it with the whole body, not only the plan.",
  "Your Moon in Cancer answers that fire with water. The Moon in Cancer holds the inner weather of the chart, and it asks for shelter before speed. Where Aries wants to decide, Cancer wants to feel whether the decision can be lived in. That is not a contradiction. It is the chart showing you both the engine and the fuel gauge.",
  "Leo rising gives the whole chart its stage. A Leo rising carries the question of how to be seen without performing, and the Sun in Aries agrees with that question more than it argues with it. The tension in these placements is between moving first and waiting until the feeling catches up, and both placements are right in their own season.",
  "What stands out for your focus is the movement from fire through water to a rising sign that wants both. What you may be overlooking is how much of the next step is already in your hands, not in a future decision. One practical step you could take is to write down the smallest next move and do it before the week ends, then notice what that finished step teaches you. The Moon in Cancer keeps the record of what the week actually felt like, and that record is worth reading before the next decision.",
  "This chart reflection closes the way it opened, with the Sun in Aries and the Moon in Cancer in the same room. What would change if you trusted the slower placement first?",
].join(" ");

describe("POST /api/chart/interpret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedHasUsedFree.mockResolvedValue(false);
    mockedSave.mockImplementation(async (_u, _r, tryFree) => ({ ok: true, free: tryFree }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: CHART_TEXT } }],
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  // Batch D (B4, OWASP A01): guests must sign in. 401 comes before any
  // validation or model call, and nothing is saved or spent.
  it("refuses a guest with 401 before any model call, save, or spend", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req({ system: "western", chart: CHART, category: "general" }, "10.0.2.9"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("Sign in");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
    expect(mockedHasUsedFree).not.toHaveBeenCalled();
  });

  it("rejects a question over 300 characters with 400 instead of truncating it", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(
      req({ system: "western", chart: CHART, question: "x".repeat(301) }, "10.0.2.1")
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("300");
  });

  it("accepts a question at exactly 300 characters", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(
      req({ system: "western", chart: CHART, question: "x".repeat(300) }, "10.0.2.2")
    );
    expect(res.status).toBe(200);
  });

  it("serves a signed-in first interpretation free and marks it", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(
      req({ system: "western", chart: CHART, category: "general" }, "10.0.2.3")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    expect(data.interpretation).toContain("chart reflection");
    // Free claim and the reading row are one call (one transaction).
    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave).toHaveBeenCalledWith("u1", expect.objectContaining({ free: true }), true, "western", 1);
  });

  // Batch D (B4): the server stores the interpretation and returns it with
  // its id, so the client save (same id) is a no-op and a closed tab loses nothing.
  it("returns the server-saved reading (same id, chart summary present)", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    const res = await POST(
      req({ system: "western", chart: CHART, category: "general", chartSummary: "Western chart. Sun: Aries." }, "10.0.2.6")
    );
    const data = await res.json();
    expect(mockedSave).toHaveBeenCalledWith("u1", expect.objectContaining({ free: false }), false, "western", 1);
    const saved = mockedSave.mock.calls[0][1] as unknown as { id: string; interpretation: string; chartSummary: string; spreadSlug: string };
    expect(data.reading.id).toBe(saved.id);
    expect(saved.interpretation).toBe(data.interpretation);
    expect(saved.spreadSlug).toBe("chart-western");
    expect(saved.chartSummary).toBe("Western chart. Sun: Aries.");
  });

  it("returns 402 with no reading when the transaction finds no credit", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    mockedSave.mockResolvedValue({ ok: false, free: false });
    const res = await POST(req({ system: "western", chart: CHART, category: "general" }, "10.0.2.7"));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.reading).toBeUndefined();
    expect(data.interpretation).toBeUndefined();
  });

  it("returns 409 (not 402/500) when the reading id belongs to another user", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    mockedSave.mockResolvedValue({ ok: false, free: false, conflict: true });
    const res = await POST(req({ system: "western", chart: CHART, category: "general" }, "10.0.2.8"));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("No Oracle was spent");
    expect(data.reading).toBeUndefined();
  });

  // Chart-interpret fix (2026-11-07): the chart prompt is ~836 words
  // (~1,110 tokens: 10 planets + 12 cusps + 43 aspects) but the route
  // reused the reading route's 1200-token budget, and the system
  // prompt demanded one section per placement group while also
  // demanding 350-550 words — for a 43-aspect chart those contradict
  // and every free model fails validation. The route now requests
  // 2000 tokens and caps the reflection at four themed sections.
  it("requests 2000 max_tokens and caps the reflection at four themed sections", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const fetchMock = vi.mocked(fetch);
    const res = await POST(
      req({ system: "western", chart: CHART, category: "general" }, "10.0.2.5")
    );
    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("openrouter.ai")
    );
    expect(call).toBeDefined();
    const body = JSON.parse(String((call?.[1] as RequestInit)?.body ?? "{}")) as {
      max_tokens: number;
      messages: { role: string; content: string }[];
    };
    expect(body.max_tokens).toBe(2000);
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("no more than four sections");
    expect(system).not.toContain("one section per key placement group");
  });

  // Phase B (R7): when the atomic free claim loses the race, the
  // request spends one Oracle instead of serving a second free
  // interpretation, and reports free: false.
  it("reports free:false when the free claim loses the race (transaction spent instead)", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedSave.mockResolvedValue({ ok: true, free: false });
    const res = await POST(
      req({ system: "western", chart: CHART, category: "general" }, "10.0.2.4")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(false);
    expect(mockedSave).toHaveBeenCalledWith("u1", expect.anything(), true, "western", 1);
  });
});
