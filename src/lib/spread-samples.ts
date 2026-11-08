import type { Spread } from "./types";

// Phase 3 (3.7): one distinct, honest sample reading per spread.
// These replace the old shared template, which rendered the same
// three card meanings (Star, Sun, Magician) as the sample for every
// spread. Each sample below is written for its own spread's
// positions and question shape, in the same reflective voice as a
// real reading, and is always shown labelled as a sample, never as
// a personal reading. Short on purpose: a sample shows the shape of
// the output, not a full reading. No customer proof is claimed;
// the sample questions are invented examples.
export const SPREAD_SAMPLES: Record<Spread["slug"], string> = {
  "quick-insight":
    "Sample question: \u201CWhat do I most need to see about today?\u201D The single card lands on the heart of it: not the loudest worry, but the quiet one underneath, the part of the day you have been avoiding naming. A one-card reading does not decide anything; it points at the one thing worth sitting with before you act.",
  "past-present-future":
    "Sample question: \u201CShould I take the new job, or stay where I am?\u201D The Past card honors the work already done rather than calling it wasted. The Present card names the crossroads plainly: the choice is real, and waiting has its own cost. The Future card does not promise an outcome; it shows what the path looks like if the present choice is made with open eyes.",
  "love-insight":
    "Sample question: \u201CWhere do we actually stand?\u201D The You card reflects what you are bringing, including the part you have not said out loud. The Them card reads as a perspective, not a verdict on another person. The Connection card names what the two of you keep circling, and what a single honest conversation could change.",
  "career-path":
    "Sample question: \u201CIs this the right next move at work?\u201D The Current card takes stock without flattery: what is working, and what is only familiar. The Obstacle card points at the block that is not a person, a habit, a missing skill, a decision postponed. The Next Step card narrows it to one move small enough to take this week.",
  "weekly-outlook":
    "Sample question: \u201CWhat should I watch for this week?\u201D The Focus card picks one thread for the week instead of seven. The Challenge card names the likely friction early, while there is still time to plan around it. The Opportunity card points at the opening that is easy to miss once the week gets busy.",
  "celtic-cross":
    "Sample question: \u201CWhy does this decision feel so stuck?\u201D The cross lays out the heart of it, what crosses it, and what lies beneath, the part that was decided long before this week. The staff follows the arc upward: the goal, the deeper root, the advice, the outside influences, and the hopes and fears pulling in opposite directions. The Outcome card closes with a direction, not a guarantee: where this is heading if nothing changes.",
};

export function spreadSample(slug: string): string {
  return SPREAD_SAMPLES[slug as Spread["slug"]] ?? "";
}
