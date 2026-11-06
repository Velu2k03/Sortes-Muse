import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

// Phase G: follow-up quality, code level. A follow-up must retain the
// original reading context (cards, question, spread) and must not
// silently start a new reading. The route builds one prompt from the
// stored reading and tells the model, in the system prompt, never to
// start a new reading. This test captures the exact prompt the route
// hands to generateChat and asserts the context is in it. The live
// quality judgement (does the answer read like a continuation) is in
// hidden_files/phaseG-e2e-plans.md; this pins the mechanism.

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  getReadingForUser: vi.fn(),
  appendFollowUpWithSpend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({
  generateChat: vi.fn(),
}));

import { POST } from "@/app/api/reading/follow-up/route";
import { getUserById, getReadingForUser, appendFollowUpWithSpend } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateChat } from "@/lib/ai";

const mockedGetUserById = vi.mocked(getUserById);
const mockedGetReading = vi.mocked(getReadingForUser);
const mockedAppend = vi.mocked(appendFollowUpWithSpend);
const mockedGetSession = vi.mocked(getSession);
const mockedGenerateChat = vi.mocked(generateChat);

function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reading/follow-up", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

// 20+ sentences naming The Fool, so the route's own validator
// (at least one original card named, 20-800 words) accepts it.
const foolAnswer = (name: string) =>
  Array.from({ length: 20 }, (_, i) => `sentence number ${i} adds a little more reflection to this follow-up answer, and ${name} keeps the thread open`).join(". ") + ".";

const FOOL_READING = {
  question: "What should I focus on next?",
  interpretation: "The Fool opens the draw with a beginning that needs no map.",
  cards: [{ cardId: "major-00", position: "Present", name: "The Fool" }],
  category: "general",
  aiGenerated: true,
  followUps: [],
};

const TOWER_READING = {
  question: "How do I rebuild after the sudden change?",
  interpretation: "The Tower breaks what was rigid, and Death closes what was finished.",
  cards: [
    { cardId: "major-16", position: "Present", name: "The Tower" },
    { cardId: "major-13", position: "Outcome", name: "Death" },
  ],
  category: "general",
  aiGenerated: true,
  followUps: [],
};

describe("follow-up retains the original reading context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedAppend.mockResolvedValue({ ok: true, followUps: [] });
    // Simulate the real client: run the route's validator over the
    // canned answer and return it only when it passes.
    mockedGenerateChat.mockImplementation(async (opts) => {
      const text = foolAnswer("The Fool");
      if (opts.validate && !opts.validate(text)) return null;
      return { text, model: "test-model" };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("signed-in: the prompt carries the original question, cards, and interpretation, and forbids a new reading", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue(FOOL_READING);
    const res = await POST(req({ question: "What does The Fool mean here?", readingId: "r-1" }, "10.2.0.1"));
    expect(res.status).toBe(200);
    expect(mockedGenerateChat).toHaveBeenCalledTimes(1);
    const opts = mockedGenerateChat.mock.calls[0][0];
    expect(opts.system).toContain("Never start a new reading");
    expect(opts.user).toContain("Original question: What should I focus on next?");
    expect(opts.user).toContain("The Fool");
    expect(opts.user).toContain("The Fool opens the draw with a beginning that needs no map.");
    expect(opts.user).toContain("Follow-up question from the seeker:");
    expect(opts.user).toContain("What does The Fool mean here?");
    // The clarifier is drawn for this follow-up and named in the prompt.
    expect(opts.user).toMatch(/Clarifier card drawn for this follow-up: \S+/);
    expect(opts.system).toContain("One clarifier card was drawn for this follow-up");
  });

  it("signed-in: a different reading's cards replace the old ones, they are not mixed in", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue(TOWER_READING);
    mockedGenerateChat.mockImplementation(async (opts) => {
      const text = foolAnswer("The Tower");
      if (opts.validate && !opts.validate(text)) return null;
      return { text, model: "test-model" };
    });
    const res = await POST(req({ question: "How do I rebuild?", readingId: "r-2" }, "10.2.0.2"));
    expect(res.status).toBe(200);
    const opts = mockedGenerateChat.mock.calls[0][0];
    expect(opts.user).toContain("Original question: How do I rebuild after the sudden change?");
    expect(opts.user).toContain("The Tower");
    expect(opts.user).toContain("Death");
    expect(opts.user).not.toContain("The Fool");
    expect(opts.system).toContain("Never start a new reading");
  });

  it("guest: the whitelisted reading object still reaches the prompt intact", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req({ question: "What does The Fool mean here?", reading: FOOL_READING }, "10.2.0.3"));
    expect(res.status).toBe(200);
    const opts = mockedGenerateChat.mock.calls[0][0];
    expect(opts.system).toContain("Never start a new reading");
    expect(opts.user).toContain("Original question: What should I focus on next?");
    expect(opts.user).toContain("The Fool");
  });
});
