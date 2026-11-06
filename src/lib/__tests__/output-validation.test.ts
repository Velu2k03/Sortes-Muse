import { describe, expect, it } from "vitest";
import {
  countWords,
  significantWords,
  validateReadingText,
  validateFollowUpText,
  validateChartText,
  validateReportText,
  anchorTerms,
} from "@/lib/output-validation";

// A valid paid-style reading: 350-550 words, names every drawn card,
// echoes the question's key words, asks one reflection question, and
// names one practical step. Built by repeating a grounded paragraph
// shape, not by inventing content: every sentence names a card, the
// question, or the step.
const CARDS = [{ name: "The Fool" }, { name: "The Magician" }, { name: "The High Priestess" }];
const QUESTION = "What should I focus on next in my career?";

function validReading(): string {
  const para = (card: string, n: number) =>
    `${card} speaks to the question of what to focus on next in your career, and the card does not answer it alone. ` +
    `It asks you to look at the work in front of you the way a careful craftsperson looks at one tool at a time, ` +
    `noticing which part of the task is yours to shape and which part belongs to timing, other people, or plain luck. ` +
    `That attention is itself the focus your question is reaching for, and it grows steadier the longer you practise it. `;
  const body = [0, 1, 2].map((i) => para(CARDS[i].name, i)).join("");
  const close =
    `What stands out for your question is the movement from openness through skill to stillness, and the tension in this draw ` +
    `is between starting before you feel ready and waiting until the picture is complete. What you may be overlooking is how much ` +
    `of the next step is already in your hands, not in a future decision. One practical step you could take this week is to choose ` +
    `a single small task from the career change you are weighing and finish it before Friday, then notice what that finished task ` +
    `teaches you about the larger choice. What would change if you treated the next step as an experiment instead of a verdict?`;
  return `${body}${close}`;
}

describe("countWords", () => {
  it("counts words, ignoring extra whitespace", () => {
    expect(countWords("  one   two three\nfour ")).toBe(4);
    expect(countWords("")).toBe(0);
  });
});

describe("significantWords", () => {
  it("keeps long content words and drops stopwords", () => {
    expect(significantWords("What should I focus on next in my career?")).toEqual([
      "focus",
      "next",
      "career",
    ]);
  });
  it("returns nothing for a question with no content words", () => {
    expect(significantWords("Why?")).toEqual([]);
  });
});

describe("validateReadingText", () => {
  it("accepts a grounded reading in the prompted band", () => {
    const text = validReading();
    const words = countWords(text);
    expect(words).toBeGreaterThanOrEqual(300);
    expect(words).toBeLessThanOrEqual(600);
    expect(validateReadingText(text, { cards: CARDS, question: QUESTION })).toBe(true);
  });

  it("rejects text that swaps the card names for cards not in the draw (swap test)", () => {
    const swapped = validReading()
      .replaceAll("The Fool", "The Tower")
      .replaceAll("The Magician", "Death")
      .replaceAll("The High Priestess", "The Devil");
    expect(validateReadingText(swapped, { cards: CARDS, question: QUESTION })).toBe(false);
  });

  it("rejects text that names fewer than half the drawn cards", () => {
    const thin = validReading()
      .replaceAll("The High Priestess", "a quiet card")
      .replaceAll("The Magician", "another card");
    expect(validateReadingText(thin, { cards: CARDS, question: QUESTION })).toBe(false);
  });

  it("rejects text that never echoes the question", () => {
    const offTopic = validReading()
      .replaceAll("focus on next", "walk by the sea")
      .replaceAll("focus", "walking")
      .replaceAll("career", "garden")
      .replaceAll("next", "later");
    expect(validateReadingText(offTopic, { cards: CARDS, question: QUESTION })).toBe(false);
  });

  it("rejects text with no reflection question", () => {
    const noQuestion = validReading().replace("?", ".");
    expect(validateReadingText(noQuestion, { cards: CARDS, question: QUESTION })).toBe(false);
  });

  it("rejects text with no practical step", () => {
    const noStep = validReading().replaceAll("step", "notion");
    expect(validateReadingText(noStep, { cards: CARDS, question: QUESTION })).toBe(false);
  });

  it("rejects text outside the word band", () => {
    expect(
      validateReadingText("The Fool. ".repeat(20), { cards: CARDS, question: QUESTION })
    ).toBe(false);
    expect(
      validateReadingText(`${validReading()} ${validReading()}`, {
        cards: CARDS,
        question: QUESTION,
      })
    ).toBe(false);
  });
});

describe("validateFollowUpText", () => {
  it("accepts an answer that names an original card", () => {
    const text =
      "The Fool keeps the thread open here: the beginning you described is still beginning, " +
      "and the next move is smaller than the decision you are afraid of. ".repeat(3);
    expect(
      validateFollowUpText(text, { cardNames: ["The Fool", "The Magician"], clarifierName: "Strength" })
    ).toBe(true);
  });

  it("accepts an answer that names only the clarifier", () => {
    const text =
      "Strength is the clarifier here, and it steadies the whole thread: the work is staying with it, " +
      "not forcing it. ".repeat(3);
    expect(
      validateFollowUpText(text, { cardNames: ["The Fool"], clarifierName: "Strength" })
    ).toBe(true);
  });

  it("rejects a generic answer that names neither an original card nor the clarifier", () => {
    const text =
      "This is a thoughtful moment to pause and consider what matters most to you going forward. ".repeat(3);
    expect(
      validateFollowUpText(text, { cardNames: ["The Fool"], clarifierName: "Strength" })
    ).toBe(false);
  });

  it("keeps the 20 to 800 word band", () => {
    expect(validateFollowUpText("The Fool.", { cardNames: ["The Fool"], clarifierName: null })).toBe(false);
  });
});

describe("anchorTerms", () => {
  it("pulls planet, sign, palace, and date terms out of chart lines", () => {
    const terms = anchorTerms(
      "Sun: Aries, 10.00 degrees, house 1. Moon: Cancer, 100.00 degrees. " +
        "Transit report for 2026-11-07. Home palace: Sun, Blessing."
    );
    expect(terms).toContain("Sun");
    expect(terms).toContain("Aries");
    expect(terms).toContain("Moon");
    expect(terms).toContain("Cancer");
    expect(terms).toContain("2026-11-07");
  });
});

describe("validateChartText", () => {
  const anchors = ["Sun", "Aries", "Moon", "Cancer", "Leo"];
  const base =
    `Your Sun in Aries opens this reflection, and your Moon in Cancer answers it with a quieter counsel. ` +
    `The two placements pull in different directions, and the tension between them is the honest centre of this chart. ` +
    `What stands out is how the fire of Aries wants a decision while the water of Cancer wants more time to feel it. ` +
    `What you may be overlooking is that both placements agree on one thing: the choice is yours to make slowly. ` +
    `One practical step you could take is to write down the smallest next move and do it before the week ends. ` +
    `What would change if you trusted the slower placement first? `;
  const valid = () => base.repeat(3);

  it("accepts a grounded chart reflection in the band", () => {
    const text = valid();
    expect(countWords(text)).toBeGreaterThanOrEqual(300);
    expect(countWords(text)).toBeLessThanOrEqual(600);
    expect(validateChartText(text, { anchors })).toBe(true);
  });

  it("rejects a reflection that names no placement", () => {
    const generic =
      ("This is a thoughtful moment to pause and consider what matters most to you going forward. " +
        "Trust yourself and take one small step at a time, and notice what changes. What would change if you slowed down? ").repeat(11);
    expect(countWords(generic)).toBeGreaterThanOrEqual(300);
    expect(validateChartText(generic, { anchors })).toBe(false);
  });

  it("rejects a reflection with no closing question", () => {
    expect(validateChartText(valid().replaceAll("?", "."), { anchors })).toBe(false);
  });
});

describe("validateReportText", () => {
  it("accepts a grounded year-ahead report in its wider band", () => {
    const anchors = ["2027", "January", "Sun", "Capricorn", "Moon"];
    const base =
      `The year 2027 opens with your Sun in Capricorn steadying the first quarter, and January asks for ` +
      `one clear commitment rather than five half-made ones. The Moon moves through the months the way weather ` +
      `moves through a year, and each quarter carries its own invitation. What stands out is the arc from ` +
      `steadiness toward a wider opening in the second half, and the tension is between holding the plan and ` +
      `letting it breathe. What you may be overlooking is how much the small monthly steps add up to by December. ` +
      `One gentle question to sit with through the year: what would you keep doing even if nobody watched? `;
    const text = base.repeat(5);
    expect(countWords(text)).toBeGreaterThanOrEqual(450);
    expect(countWords(text)).toBeLessThanOrEqual(750);
    expect(validateReportText(text, { anchors, minWords: 450, maxWords: 750 })).toBe(true);
  });

  it("rejects a report that never names a date or placement", () => {
    const generic =
      ("This is a thoughtful moment to pause and consider what matters most to you going forward. " +
        "Trust yourself and take one small step at a time, and notice what changes. What would change if you slowed down? ").repeat(16);
    expect(countWords(generic)).toBeGreaterThanOrEqual(450);
    expect(
      validateReportText(generic, { anchors: ["2027", "January"], minWords: 450, maxWords: 750 })
    ).toBe(false);
  });
});
