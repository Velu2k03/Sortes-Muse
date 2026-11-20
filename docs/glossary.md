# Sortes UI glossary

The words the site uses, and the words it never uses. Every label, button,
helper line, and error message in the UI should match this glossary. When a
new screen is added, check it here first. The wiring test
`src/lib/__tests__/phase4-batch44-glossary.test.ts` fails if the forbidden
words below appear in the four money-flow UI files.

## Words we use

- **Reading**: one AI tarot reading for one question. A reading is written
  just for the asker and saved in their journal.
- **Card**: one of the 78 tarot cards. A card is drawn, not generated.
- **Spread**: the set of cards a reading uses. The free reading is the
  1-card Quick Insight spread.
- **Credits**: the unit a reading costs (since the credit cutover,
  2026-11-20). A 1-card reading costs 100 credits, a 3-card reading 200,
  a Celtic Cross, a chart interpretation, or a report 300, a follow-up 50.
  Credits are bought in top-ups (1,000 for $9.99, 3,000 for $24.99) or
  come with a monthly plan. Purchased credits never expire. Monthly plan
  credits roll over up to two months of the plan, then stop.
- **Follow-up**: a question asked after a reading, in the same thread.
  The first follow-up is free, then 50 credits each, up to 3.
- **Sign in**: the action of entering an existing account. Always "Sign
  in", two words, capital S.
- **Sign up**: the action of making a new account. Always "Sign
  up", two words, capital S. (Velu's wording decision, 2026-11-16:
  "Sign up" and "Sign in".)
- **Get credits**: the action of buying credits. The button that
  opens checkout.
- **Top up**: the action of adding credits to an existing balance. Used in
  the header pill and the account page.

## The one cost phrase

State a cost as "N credits", with the number from the price table:
buttons ("Personalize and begin · 200 credits"), helper text ("This
reading uses 200 credits."), and the purchase confirmer. In code, build
it with `creditsLabel(...)` from `src/lib/subscription-tiers.ts`, so the
singular reads "1 credit" and large amounts read "1,000 credits".

## Words we never use

- **Oracle / Oracles** as a unit: the old word for the currency, retired
  at the credit cutover. The `/oracles` URL stays (inbound links, SEO),
  and code identifiers (`preCheckOracleBalance`, `ORACLE_TO_CREDITS`)
  are internal only. The one exception in UI copy is a purchase-history
  row for a retired Oracle pack, which keeps the unit it was bought in.
- **Log in**: always "Sign in".
- **Register**: always "Sign up".
- **Login / Signup** (one word): always "Sign in" / "Sign up".

## Free reading

The free reading is the **1-card Quick Insight** spread, one per account
(or per device for guests). It is free, no payment card required. Never
call any other spread free, and never promise a free 3-card reading.
