/**
 * Phase B (R6): guest-generation observability.
 *
 * Decision (see the decision log): guest free generation stays — it
 * is the top of funnel — with the existing per-IP rate limits, and
 * abuse becomes visible instead of silent. Every successful guest
 * AI generation logs one structured line in the existing JSON format
 * (same shape as the Lemon Squeezy checkout-failed line), so a log
 * drain can count guest generations per route over time and a spike
 * is visible. Only the route name is logged: no IP, no email, no
 * prompt, no user id. Failed generations are not logged here (they
 * cost nothing and are already logged as model-failed by ai.ts).
 *
 * This is observability, not enforcement. If the counts show abuse,
 * the cheapest next control is a tighter guest budget in
 * src/lib/rateLimit.ts, not a CAPTCHA or a guest-identity system
 * (both were considered and rejected for this phase; see the
 * decision log).
 */
export function logGuestGeneration(route: string): void {
  console.log(
    JSON.stringify({
      source: "sortes-guest",
      event: "guest-generation",
      route,
    })
  );
}
