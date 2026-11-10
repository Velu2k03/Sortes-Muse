import { describe, expect, it } from "vitest";
import { suggestQuestionRewrite } from "@/lib/question-rewrite";

// Batch 6a: the templates embed the user's question in quotes and
// end the frame with a question mark, so a question that already
// ends in one produced `"Will I get a job?"?`. The trailing
// punctuation is stripped first, so the output ends with a single
// `?` outside the quotes.
describe("suggestQuestionRewrite", () => {
  it("does not double the question mark on a will-question", () => {
    expect(suggestQuestionRewrite("Will I get a job?")).toBe(
      'What is in my control, and what is not, when it comes to: "Will I get a job"?',
    );
  });

  it("strips the trailing mark on a should-question", () => {
    expect(suggestQuestionRewrite("Should I quit my job?")).toBe(
      'What do I need to weigh up before deciding: "Should I quit my job"?',
    );
  });

  it("strips a trailing period on a yes/no opener", () => {
    expect(suggestQuestionRewrite("Is it time to change direction.")).toBe(
      'What should I consider about: "Is it time to change direction"?',
    );
  });

  it("strips a trailing ellipsis on a will-question", () => {
    // Review round: a trailing unicode ellipsis was not stripped.
    expect(suggestQuestionRewrite("Will I get a job…")).toBe(
      'What is in my control, and what is not, when it comes to: "Will I get a job"?',
    );
  });

  it("returns null for open questions and empty input", () => {
    expect(suggestQuestionRewrite("What should I focus on?")).toBeNull();
    expect(suggestQuestionRewrite("How do I move forward?")).toBeNull();
    expect(suggestQuestionRewrite("")).toBeNull();
    expect(suggestQuestionRewrite("   ")).toBeNull();
  });
});
