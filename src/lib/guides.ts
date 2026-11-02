// Guides for Sortes: substantive, citable pages that explain what the
// app actually does. Written in-house for Sortes, reflection-framed,
// never a guaranteed prediction, never medical or financial advice.
// These pages are the fix for the audit finding that search and AI
// tools had no substantive content to cite: they describe the deck,
// the spreads, and the charts exactly as they work in this app.
export type GuideSection = { heading: string; paragraphs: string[] };
export type Guide = {
  slug: string;
  title: string;
  description: string;
  sections: GuideSection[];
};

export const GUIDES: Guide[] = [
  {
    slug: "what-is-tarot",
    title: "What is tarot?",
    description:
      "The 78-card deck, the Major and Minor Arcana, the four suits, and how Sortes uses tarot for reflection, not prediction.",
    sections: [
      {
        heading: "The deck in one page",
        paragraphs: [
          "A tarot deck has 78 cards. Twenty-two are the Major Arcana, from The Fool to The World, and they tend to describe larger themes: a beginning, a choice, a loss, a turning point. Fifty-six are the Minor Arcana, in four suits of fourteen cards each, and they tend to describe everyday life: work, feelings, conflict, and material matters.",
          "The four suits in the Rider-Waite deck used by Sortes are Cups, Wands, Swords, and Pentacles. Cups often point to feelings and relationships. Wands often point to energy, work, and will. Swords often point to thought, conflict, and decisions. Pentacles often point to money, work, health, and the physical world. A suit is a hint about the area of life, not a verdict about it.",
        ],
      },
      {
        heading: "Upright and reversed",
        paragraphs: [
          "A card can appear upright or reversed. In Sortes, a reversed card is not a bad card. It usually points to the same theme turned inward, delayed, blocked, or seen from the other side. The Fool reversed, for example, can mean a start held back by fear, rather than a start that is doomed.",
          "Reversal is one reason a reading is better read as a whole than card by card. Two cards can pull in opposite directions, and that tension is often the useful part.",
        ],
      },
      {
        heading: "Reflection, not prediction",
        paragraphs: [
          "Sortes treats tarot as a mirror for reflection. A reading offers language for what you already sense, a different angle on a decision, and questions worth sitting with. It does not guarantee what will happen, and it never replaces professional advice about health, money, or legal matters.",
          "If a reading feels wrong, that is also information. A useful response is to ask what part felt off, and what you would have wanted it to say instead. That answer often names the real question better than the first one did.",
        ],
      },
      {
        heading: "How Sortes uses tarot",
        paragraphs: [
          "Sortes has three free entry points. The daily card is one free card each day, with no account and no payment. The deck browser lets you read all 78 card meanings at your own pace. The spreads are the paid readings: Quick Insight with one card, topic spreads with three cards, and the Celtic Cross with ten cards. The first full reading is free, and later readings cost one credit each.",
        ],
      },
    ],
  },
  {
    slug: "how-to-ask-a-tarot-question",
    title: "How to ask a tarot question",
    description:
      "Open questions get better readings than yes or no questions. What to ask, what to avoid, and how Sortes uses your question.",
    sections: [
      {
        heading: "Ask about a situation, not a verdict",
        paragraphs: [
          "A reading works best when the question names a situation and leaves room for an answer. “What do I need to see about this job change?” will give you more to work with than “Will I get the job?” The first question invites advice, obstacles, and trade-offs. The second question invites a yes or no, and tarot is a poor tool for that.",
          "The same rule applies to relationships, money, and study. Ask what is happening, what is hidden, what to focus on, or what to let go of, rather than asking for a single outcome.",
        ],
      },
      {
        heading: "One question, one story",
        paragraphs: [
          "Sortes asks for one question and a short story behind it, plus a category such as love, career, finances, academics, or health. The story matters more than the wording. A question with context, such as what has already happened and what worries you most, lets the reading speak to your actual situation instead of a generic theme.",
          "Keep the story short and honest. You do not need to share names, dates, or private details. A first name and the shape of the situation are enough, and raw intake data is deleted after 30 days.",
        ],
      },
      {
        heading: "Questions to avoid",
        paragraphs: [
          "Avoid questions that ask tarot to decide for you, questions about a third person who has not asked for a reading, and questions that need a professional: a medical diagnosis, an investment decision, or a legal outcome. For those, a reading can help you clarify what you want to ask the professional, but it cannot answer in their place.",
          "Avoid asking the same question over and over until you get the answer you want. If you feel pulled to re-ask, write down the first reading, sit with it for a day, and notice what changed in your own mind. That is usually the real movement.",
        ],
      },
      {
        heading: "After the reading",
        paragraphs: [
          "Read the whole spread once, then read it again slowly, position by position. Note one sentence that felt true, one that felt wrong, and one action, however small, that the reading suggests. A reading that ends in a concrete next step, such as a conversation to have or a fact to check, has done its job better than a reading that only feels mysterious.",
        ],
      },
    ],
  },
  {
    slug: "celtic-cross-explained",
    title: "The Celtic Cross, position by position",
    description:
      "The classic ten-card spread as it works in Sortes, with each of the ten positions explained in the order the app shows them.",
    sections: [
      {
        heading: "Why ten cards",
        paragraphs: [
          "The Celtic Cross is the classic ten-card spread because it shows a situation from ten angles at once: the present, the obstacle, the past, the near future, the goal, the foundation, the advice, the outside world, hopes and fears, and the outcome. It is best for a situation with history and stakes, not for a quick daily check. For a quick check, Sortes offers Quick Insight with one card instead.",
          "Read the cross first, then the staff. The first six cards describe the situation itself. The last four cards describe how you meet it, what surrounds it, and where it may head.",
        ],
      },
      {
        heading: "The ten positions in Sortes",
        paragraphs: [
          "Present: the heart of the matter, where you stand right now. Challenge: what crosses you, the obstacle or tension in the way. Past: the foundation behind you, what shaped this moment. Future: what is approaching, not a fixed fate but the next turn of the path.",
          "Above: your goal or best outcome, what you are aiming at whether you have named it or not. Below: the deeper foundation, the root cause or unconscious drive under the situation. Advice: how to approach it, the attitude or action the spread suggests.",
          "External: outside influences, other people, timing, or circumstances you do not control. Hopes and fears: what you hope for or dread, and how those two often point at the same thing. Outcome: where this is heading if things continue as they are, which is a direction to work with, not a sentence to accept.",
        ],
      },
      {
        heading: "How to read it without getting lost",
        paragraphs: [
          "Start with Present and Challenge together, because their contrast usually names the real problem. Then read Past and Future as a line through time. Then read Above and Below as a line from aspiration to root. Finally read Advice, External, Hopes and Fears, and Outcome as a line from action to result.",
          "If two cards seem to contradict each other, do not force them to agree. Note the contradiction and ask what part of you agrees with each card. That split is often the most honest part of the reading.",
        ],
      },
    ],
  },
  {
    slug: "tarot-and-birth-charts",
    title: "Tarot readings and birth charts: what is different?",
    description:
      "Sortes offers tarot spreads and three chart systems: Ziwei, Western, and Vedic. What each one uses, what it shows, and when to use which.",
    sections: [
      {
        heading: "Tarot answers a question",
        paragraphs: [
          "A tarot reading starts with your question and your story, and it draws cards for that moment. It is situational: the same question asked next month, with a different story, can give a different spread, because the situation has changed. Tarot is the right tool when you have a decision, a relationship, or a project in front of you and want a fresh angle on it.",
        ],
      },
      {
        heading: "Charts map a birth moment",
        paragraphs: [
          "A birth chart starts with a birth date, time, and place, and it calculates positions: planets in signs and houses for Western and Vedic charts, and stars in palaces for Ziwei charts. It is structural: the chart does not change with your question, because it describes the sky at one moment. Charts are the right tool when you want a longer view of patterns, strengths, and timing, rather than advice on one decision.",
          "Sortes calculates charts for free. Interpretation costs one credit per system, with the first interpretation per system free. Ziwei, Western, and Vedic charts each use different methods, so their language differs, and the same birth moment can be described in three different vocabularies.",
        ],
      },
      {
        heading: "Privacy, in one paragraph",
        paragraphs: [
          "For charts, Sortes calculates positions and stores only those positions, signs, and palaces. It does not store your raw birth date, time, or place in the database, and it never sends raw birth data to an AI prompt. The AI interpretation receives only positions, signs, houses, and stars, plus your question or focus. For tarot, raw intake data is deleted after 30 days.",
          "A chart calculation also uses a longitude correction, not a full timezone database: the correction is four minutes per degree between your longitude and the nearest fifteen-degree meridian, so a birth time near a double-hour or house boundary may fall on either side. That limit is shown on the charts page itself.",
        ],
      },
      {
        heading: "Which one to use",
        paragraphs: [
          "Use a tarot spread when you have a specific question and want to act soon. Use a chart when you want to understand a pattern that keeps repeating, or to compare how three traditions describe the same birth moment. Use both when a decision sits inside a longer pattern: the chart shows the pattern, and the spread shows the next step inside it.",
        ],
      },
    ],
  },
  {
    slug: "topic-spreads-love-career-week",
    title: "Love, career, and weekly spreads: which one fits your question?",
    description:
      "Sortes topic spreads use three cards each. Love Insight, Career Path, and Weekly Outlook, and how to pick the right one for your question.",
    sections: [
      {
        heading: "Love Insight: you, them, and the connection",
        paragraphs: [
          "Love Insight draws three cards: You, Them, and Connection. It is for a relationship question where two people are involved, not for a question about one person alone. Ask about the relationship itself, for example what needs attention between you, rather than asking what the other person secretly thinks, which tarot cannot answer for you.",
        ],
      },
      {
        heading: "Career Path: current, obstacle, and next step",
        paragraphs: [
          "Career Path draws three cards: Current, Obstacle, and Next Step. It is for a work question where you need a practical next move, not a prediction about a job offer. Ask about the step in front of you, for example what is blocking a project, rather than asking whether you will be promoted, which no spread can guarantee.",
        ],
      },
      {
        heading: "Weekly Outlook: focus, challenge, and opportunity",
        paragraphs: [
          "Weekly Outlook draws three cards: Focus, Challenge, and Opportunity. It is for the week ahead as a whole, not for a single decision. Use it at the start of a week to choose where to put your attention, and read it as reflection, not as a forecast of what will happen on a given day.",
        ],
      },
      {
        heading: "Pricing, same as every spread",
        paragraphs: [
          "Topic spreads cost one credit each, like every full reading in Sortes, after your first free Quick Insight reading. The daily card and the deck browser stay free, and a spread never asks for a card payment directly: credits are bought in packs on the credits page.",
        ],
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
