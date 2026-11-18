/**
 * Password strength scoring for the signup meter (Velu 2026-11-18).
 * Hand-built, no library. Pure: same input, same output, no I/O.
 *
 * This is feedback only. It never blocks a submit: the input's
 * minLength={8} and the 8-character check in
 * src/app/api/auth/signup/route.ts stay the only rules.
 *
 * Points:
 *   length   under 8 = 0, 8-11 = 1, 12-15 = 2, 16+ = 3
 *   variety  one point per character class beyond the first
 *            (lowercase, uppercase, digit, symbol), so 0-3
 * Level from the total (0-6):
 *   0-1 Weak, 2-3 Fair, 4 Good, 5-6 Strong
 * Caps: under 8 characters, or fewer than 5 distinct characters
 * (e.g. "aaaaaaaaaaaaaaaa"), is always Weak.
 *
 * score drives the bar: 0 for an empty password, then 1-4 for
 * Weak, Fair, Good, Strong.
 */
export type StrengthLevel = "Weak" | "Fair" | "Good" | "Strong";

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  level: StrengthLevel;
}

export const STRENGTH_MAX_SCORE = 4;

const LEVELS: StrengthLevel[] = ["Weak", "Fair", "Good", "Strong"];

export function scorePassword(password: string): PasswordStrength {
  if (!password) return { score: 0, level: "Weak" };

  const length = password.length;
  const lengthPoints = length >= 16 ? 3 : length >= 12 ? 2 : length >= 8 ? 1 : 0;

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  const varietyPoints = Math.max(0, classes - 1);

  const total = lengthPoints + varietyPoints;
  let index = total >= 5 ? 3 : total === 4 ? 2 : total >= 2 ? 1 : 0;
  if (length < 8 || new Set(password).size < 5) index = 0;

  return { score: (index + 1) as 1 | 2 | 3 | 4, level: LEVELS[index] };
}
