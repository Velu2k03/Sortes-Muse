# Credit cutover runbook — Oracles to credits

**Status: NOT RUN.** The credit-cost flag (`CREDIT_COSTS_ENABLED` in
`src/lib/subscription-tiers.ts`) ships OFF. This runbook is the
procedure for the cutover, when Velu gives the go-ahead. Do NOT
flip the flag or run the conversion without his explicit approval:
the conversion needs holders emailed first and pack sales stopped.

## What the cutover does

1. Readings, charts, reports, and follow-ups start costing credits
   (1-card 100, 3-card 200, chart 300, report 300, follow-up 50)
   instead of 1 Oracle each.
2. Every existing Oracle balance converts to purchased credits at
   **1 Oracle = 300 credits** (Velu's decided rate). Purchased
   credits never expire.
3. Oracle packs stop being sold; top-ups (1,000 / $9.99, 3,000 /
   $24.99) take their place on /oracles.
4. Subscriptions (Spark / Star / Moon) become the monthly product.

## Order of operations (do NOT reorder)

**Deploy flag-ON first, then run the conversion, then verify.**

- **Flag-ON first.** The flag-ON window is safe-degraded, not
  leaking: while the flag is ON and balances are still in Oracles,
  a reading costs 100/200/300 *credits*, and the spend reads the
  `users.credits` total (monthly + purchased). An Oracle balance
  of N is worth N credits in that window — the user is charged
  more per reading than their balance is worth, which is a
  degraded experience (they may be told they cannot afford a
  reading), but no credits are created or destroyed, and no
  purchase can over-grant. The window is kept SHORT (minutes).
- **Conversion-before-flag would leak.** If the conversion ran
  first (balances multiplied by 300) while the flag was still OFF,
  a reading would still cost 1 *credit* — one 300-credit Oracle
  would buy 300 readings. Never do this.
- **A purchase landing in the window** is handled by the
  conversion guard in `convertOraclesToCredits` (migration 010
  batch): the function refuses any user with a `monthly` grant
  (subscriptions only exist after the flag flips) or a purchase
  recorded in `transactions` after the flag-flip time (packs and
  top-ups record there, not in credit_grants — no code writes a
  `purchased` grant row). The runner MUST pass `flagFlippedAt`
  (the flag-ON deploy time) for the purchase check; without it
  only the monthly-grant check runs. A pack bought after the flag
  flipped is already in credits (fulfillOrder grants credits when
  the flag is ON), so the guard skips that user instead of
  multiplying the balance by 300. The runner is NOT built yet;
  build it before scheduling the cutover.

## Preconditions (all must be true)

1. Velu's go-ahead for the cutover (explicit, in chat).
2. The Oracle-holder census is done: every holder and balance
   counted from production (Batch A follow-up, still owed).
3. Holders have been emailed: the conversion, the new costs, and
   the date. (Velu's requirement before any conversion.)
4. Pack sales are stopped (or the runner handles post-flag pack
   purchases — see above).
5. The subscription variants + top-up variants exist in Lemon
   Squeezy (live mode) and their ids are in Vercel env vars.
6. The test-mode rehearsal is done: a test subscription created,
   renewed, cancelled, and expired, with the monthly grant verified
   at each step. (See the dashboard brief in
   `~/workspace/sortes-verify/lemonsqueezy-dashboard-brief-batch-B.md`.)
7. A fresh production backup exists (GitHub Actions
   `sortes-backup.yml`, workflow_dispatch) taken immediately
   before the cutover.
8. The conversion runner is built, reviewed, and tested on the
   staging/test database (including the post-flag-grant check and
   the post-conversion purchase + refund nets-to-zero case).

## Procedure

1. **Freeze window.** Announce it. No new pack purchases during
   the window (the store can stay up; the freeze is on the
   conversion, not the site).
2. **Take a fresh production backup.** Record the run id and
   artifact. Verify the artifact downloads and decrypts.
3. **Flip the flag.** Set `CREDIT_COSTS_ENABLED = true` in
   `src/lib/subscription-tiers.ts`, commit, PR, review, merge.
   Vercel auto-deploys main. Verify the deploy is live (the
   /oracles page shows top-ups, /pricing buttons are enabled).
   The flag-ON window starts NOW — keep it as short as possible.
4. **Run the conversion.** Run the conversion runner against
   production (the runner converts each holder's Oracle balance
   to purchased credits at 1 = 300, records a `conversion` grant
   row per user, and is idempotent). Record the runner's output:
   users converted, total Oracles, total credits.
5. **Verify (see below).** Do not close the window until every
   check passes.
6. **Close the window.** Announce the cutover is done.

## Verification (all must pass)

1. **Balances.** For a sample of holders (and the test account):
   new purchased credits = old Oracles x 300, monthly credits
   unchanged, total = monthly + purchased. Spot-check the
   `credit_grants` rows (kind `conversion`, one per user).
2. **Spend.** A 1-card reading costs 100 credits (monthly first,
   then purchased). A 3-card costs 200, a chart 300, a follow-up
   50. A user with 0 credits gets a 402 with a credit-denominated
   message, and nothing is spent.
3. **Purchase.** A top-up purchase grants the exact credits
   (1,000 / 3,000) as purchased, never expiring. A subscription
   purchase grants the first month on payment success.
4. **Refund.** A refunded top-up / subscription period revokes
   exactly what was granted (post-conversion purchase + refund
   nets to zero).
5. **No double conversion.** Re-running the runner converts
   nothing (idempotent).
6. **Packs.** The /oracles page shows top-ups, not packs. A pack
   checkout attempt is refused (the pack route is untouched, but
   the page no longer offers packs).

## Abort criteria (stop, do not push through)

- The fresh backup fails or cannot be verified → abort before
  flipping the flag.
- The flag-ON deploy fails or the live site does not show the
  top-up page → abort, revert the flag, investigate.
- The conversion runner errors partway, or its output does not
  reconcile (converted total != census total) → STOP the runner,
  do NOT re-run it blindly, restore from the pre-cutover backup
  if any balance is wrong, and report to Velu.
- Any verification check fails → hold the freeze window, fix or
  roll back (flag OFF + restore the backup), and report to Velu.

## Rollback

- **Flag OFF** (revert the flag commit) returns the spend to
  1 Oracle per reading. Note: balances already converted to
  credits stay converted — a rollback after conversion also needs
  the pre-cutover backup restored, or a reverse-conversion
  (credits / 300, only for balances that were converted). This
  is why the backup is taken first and the window is kept short.
- **Restore from backup** is the only clean rollback after the
  conversion has run. Procedure: `docs/PRODUCTION-CHANGE-PLAN.md`
  §8 (restore), then re-apply migration 008 + 009 if the backup
  predates them (it does not — the backup is taken after both).

## After the cutover

- The conversion runner is archived (it must never run again).
- The `CREDIT_COSTS_ENABLED` flag stays ON. The Oracle unit is
  gone from the product; the code paths that still mention Oracles
  (pack checkout, pack webhook) are dead code until they are
  removed in a later cleanup batch.
- Update this runbook with the actual run date, backup run id,
  and the conversion totals.

## Known limitations (Claude review, PR #92 — accepted, not blockers)

- **Refunded annual invoice now revokes all months and stops the
  drip (FIXED in the notes batch, migration 010).** A refunded
  subscription invoice revokes every monthly grant for the cycle
  (`revokeAllSubscriptionGrants`) and stamps `refunded_at` on the
  subscription row, which excludes it from the drip cron. A
  partial refund revokes the same share of each month and leaves
  the subscription (and the drip) running. Before the cutover,
  still confirm whether Lemon Squeezy cancels or expires the
  subscription on a refund and test that path.
- **Re-subscribe during the grace period keeps the old monthly
  balance.** A user who resubscribes while the old subscription
  is still live keeps the old subscription's leftover monthly
  credits (capped at two months of the plan); the old expiry does
  not zero them because the new subscription is live. This is an
  accepted trade-off: the leftover is at most two months of the
  plan and the user paid for both periods.
- **A null cycle start is "keep existing".** The webhook passes a
  null `currentPeriodStart` for non-invoice events and the upsert
  preserves the existing value (Postgres COALESCE / local
  preserve). Only an invoice (payment_success) supplies a new
  start, so a `subscription_updated` on renewal cannot reset the
  annual cycle. The drip cron falls back to the row's `created_at`
  when the start is null (a brand-new row before its first
  invoice).
