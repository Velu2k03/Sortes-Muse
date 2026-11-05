// Birth cards: the traditional Personality & Soul pair (Mary Greer
// system), calculated in memory only. The date is never stored, never
// sent to a server, and never sent to AI.
//
// Method: add all digits of the birth date. If the total is over 22,
// add the digits of that total, repeating until it is 22 or less —
// that is the Personality card number (22 is The Fool). Then add the
// digits of the Personality number until a single digit remains —
// that is the Soul card number. When the Personality number is
// already a single digit, it is also the Soul card. Examples:
// 1985-11-22 sums to 29 → Personality 11 (Justice), Soul 2 (High
// Priestess); 1991-01-01 sums to 22 → Personality 22 (Fool),
// Soul 4 (Emperor). This is a reflection tool, not a prediction.
export interface BirthCards {
  /** The raw digit sum, before any reduction. */
  total: number;
  /** 1–22; 22 is The Fool. */
  personality: number;
  /** 1–9; the Personality number reduced to one digit. */
  soul: number;
}

function digitSum(n: number): number {
  return String(n)
    .split("")
    .reduce((s, ch) => s + Number(ch), 0);
}

export function birthCardNumbers(date: string): BirthCards | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const total = date
    .replaceAll("-", "")
    .split("")
    .reduce((s, ch) => s + Number(ch), 0);
  let personality = total;
  while (personality > 22) personality = digitSum(personality);
  let soul = personality;
  while (soul > 9) soul = digitSum(soul);
  return { total, personality, soul };
}
