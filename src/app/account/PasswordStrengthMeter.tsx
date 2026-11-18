import { scorePassword, STRENGTH_MAX_SCORE } from "@/lib/password-strength";

export const PASSWORD_STRENGTH_ID = "acct-password-strength";

/**
 * Signup password strength meter (Velu 2026-11-18): a quiet
 * four-segment bar plus one line of text, computed live from the
 * password the form already holds. Hand-built, no library.
 *
 * AGENTS.md self-check exception (same reasoning as the pricing
 * pill span, PR #152): the meter is raw <div>/<span>, not Astryx
 * components. The account sign-in form it sits in is built from
 * raw divs and inputs, and no Astryx primitive fits a segmented
 * strength bar, so it follows the form's existing pattern.
 * Colours are theme tokens only (gold, cream, mist), no gradient,
 * no animation.
 */
export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, level } = scorePassword(password);
  return (
    <div className="mt-2">
      {/* The visible bar is decorative segments only; the native
          <progress> below carries the semantics (jsx-a11y
          prefer-tag-over-role: a progressbar role is a warning). */}
      <div aria-hidden="true" className="grid grid-cols-4 gap-1">
        {Array.from({ length: STRENGTH_MAX_SCORE }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`h-1 rounded-full ${i < score ? "bg-gold/70" : "bg-gold/15"}`}
          />
        ))}
      </div>
      <progress
        aria-label="Password strength"
        aria-valuetext={password ? level : "Not set"}
        value={score}
        max={STRENGTH_MAX_SCORE}
        className="sr-only"
      />
      <p id={PASSWORD_STRENGTH_ID} aria-live="polite" className="mt-1.5 text-left text-xs text-mist">
        {password ? (
          <>
            Password strength: <span className="text-cream">{level}</span>
          </>
        ) : (
          "Use 8 or more characters. Mixing cases, numbers and symbols makes it stronger."
        )}
      </p>
    </div>
  );
}
