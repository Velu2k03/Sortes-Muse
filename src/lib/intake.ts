export interface IntakeField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  hint?: string;
}

export interface IntakeCategory {
  key: string;
  name: string;
  tagline: string;
  fields: IntakeField[];
}

/**
 * Fields marked `sensitive` in the API layer (birthdays) are collected for
 * context but NEVER sent to the AI model and never stored.
 */
export const INTAKE_CATEGORIES: IntakeCategory[] = [
  {
    key: "love",
    name: "Love and Relationships",
    tagline: "Matters of the heart, held gently.",
    fields: [
      { key: "yourName", label: "Your first name", type: "text", placeholder: "Maya", required: true },
      { key: "partnerName", label: "Their first name", type: "text", placeholder: "Alex", required: true },
      { key: "nickname", label: "A nickname for them (optional)", type: "text", placeholder: "How you fondly refer to them" },
      { key: "yourAge", label: "Your age (optional)", type: "text", placeholder: "28" },
      { key: "partnerAge", label: "Their age (optional)", type: "text", placeholder: "30" },
      {
        key: "yourBirthday", label: "Your birthday (optional)", type: "date",
        hint: "Stays on your device. Never sent to the AI.",
      },
      {
        key: "partnerBirthday", label: "Their birthday (optional)", type: "date",
        hint: "Stays on your device. Never sent to the AI.",
      },
      {
        key: "relationshipStatus", label: "Relationship status", type: "select", required: true,
        options: ["Single", "Dating", "In a relationship", "Engaged", "Married", "Separated", "Divorced", "It's complicated", "Other"],
      },
      { key: "situation", label: "Current situation", type: "textarea", required: true, placeholder: "Where do things stand between you right now?" },
    ],
  },
  {
    key: "career",
    name: "Career and Work",
    tagline: "Direction, purpose, and the next move.",
    fields: [
      {
        key: "status", label: "Current status", type: "select", required: true,
        options: ["Employed", "Self-employed", "Job seeking", "Student", "Career break", "Other"],
      },
      { key: "position", label: "Current position or field", type: "text", placeholder: "e.g. Junior designer", required: true },
      { key: "dreamGoal", label: "Dream goal", type: "text", placeholder: "Where do you want to be?", required: true },
      { key: "challenge", label: "The challenge", type: "textarea", required: true, placeholder: "What is standing in the way?" },
    ],
  },
  {
    key: "finances",
    name: "Finances and Money",
    tagline: "Clarity around resources and flow.",
    fields: [
      { key: "incomeSource", label: "Income source", type: "text", placeholder: "e.g. Salary, freelance, business", required: true },
      { key: "goal", label: "Financial goal", type: "text", placeholder: "What are you working toward?", required: true },
      { key: "struggle", label: "The struggle", type: "textarea", required: true, placeholder: "What feels hard about money right now?" },
      { key: "desiredOutcome", label: "Desired outcome", type: "text", placeholder: "What would good look like?", required: true },
    ],
  },
  {
    key: "academics",
    name: "Academics and Studies",
    tagline: "Learning, exams, and the path ahead.",
    fields: [
      {
        key: "schoolLevel", label: "School level", type: "select", required: true,
        options: ["High school", "Undergraduate", "Graduate", "Vocational", "Self-study", "Other"],
      },
      { key: "course", label: "Course or field of study", type: "text", placeholder: "e.g. Biology, Computer Science", required: true },
      { key: "challenges", label: "Challenges", type: "textarea", required: true, placeholder: "What is difficult about your studies right now?" },
    ],
  },
  {
    key: "health",
    name: "Health and Wellness",
    tagline: "Gentle reflection for body and mind.",
    fields: [
      { key: "concern", label: "Wellness concern", type: "text", placeholder: "e.g. Sleep, stress, energy", required: true },
      { key: "currentSituation", label: "Current situation", type: "textarea", required: true, placeholder: "How have you been feeling lately?" },
      { key: "desiredOutcome", label: "Desired outcome", type: "text", placeholder: "What would feeling well look like?", required: true },
    ],
  },
];

export function getCategory(key: string): IntakeCategory {
  const c = INTAKE_CATEGORIES.find((c) => c.key === key);
  if (!c) throw new Error(`Unknown intake category: ${key}`);
  return c;
}

export interface IntakePayload {
  category: string;
  categoryName: string;
  firstName: string;
  answers: Record<string, string>;
  story: string;
  question: string;
}

/** Keys that must never leave the device / never reach the AI model. */
export const SENSITIVE_KEYS = ["yourBirthday", "partnerBirthday"];
