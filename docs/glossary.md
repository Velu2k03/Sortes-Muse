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
- **Oracle**: the unit a reading costs. One reading costs **1 Oracle**.
  Oracles are bought in top-ups (1,000 for $9.99, 3,000 for $24.99) or
  come with a monthly plan. Purchased Oracles never expire. Monthly plan
  Oracles roll over up to two months of the plan, then stop.
- **Follow-up**: a question asked after a reading, in the same thread.
  The first follow-up is free, then 1 Oracle each, up to 3.
- **Sign in**: the action of entering an existing account. Always "Sign
  in", two words, capital S.
- **Sign up**: the action of making a new account. Always "Sign
  up", two words, capital S. (Velu's wording decision, 2026-11-16:
  "Sign up" and "Sign in".)
- **Get Oracles**: the action of buying Oracles. The button that
  opens checkout.
- **Top up**: the action of adding Oracles to an existing balance. Used in
  the header pill and the account page.

## The one cost phrase

A reading costs **1 Oracle**. Say it exactly that way everywhere the cost
is stated: buttons ("Personalize and begin · 1 Oracle"), helper text
("This reading uses 1 Oracle."), and the purchase confirmer. Never write
"1 credit", "1 Oracle per reading", "costs one Oracle", or any other
variant. The rate is implied by the phrase: one reading, one Oracle.

## Words we never use

- **credit / credits**: the old word for the currency. The site runs on
  Oracles. Code identifiers (`credits` variable, `CREDIT_PACKS`,
  `sortes:credits-changed`, `/api/credits/*`) are internal only and are
  not user-facing copy. The test allows those identifiers; it fails on the
  standalone word "credit" in UI strings.
- **Log in**: always "Sign in".
- **Register**: always "Sign up".
- **Login / Signup** (one word): always "Sign in" / "Sign up".

## Free reading

The free reading is the **1-card Quick Insight** spread, one per account
(or per device for guests). It is free, no payment card required. Never
call any other spread free, and never promise a free 3-card reading.
