# Sortes Taste, pick-ui-library, transitions.dev, Vercel guidelines — 2026-11-17

Griffin order after Impeccable (S-20): Taste (S-18), pick-ui-library (S-21/S-33),
transitions.dev (S-22), Vercel guidelines (S-23, final QA). Branch
sortes-taste-pick-transitions-2026-11-17, from origin/main f582b28.
No copy, pricing, palette, font, auth, database or payment changes.
Gold-gradient wordmark untouched (locked brand). Sonner toaster and
Oracles links untouched (other agents' work).

## 1. Taste (S-18) — design read, homepage + pricing

Kind: software (AI tarot product). One main action per screen: hero =
ask a question and start a reading. Palette is Velu's locked navy
#141b2e + gold #d4af37 + cream #ede6d6. Fonts Cormorant Garamond +
Manrope, Inter not loaded.

### Pre-flight checklist

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | No purple gradient, no violet | PASS | Violet purged in S-03 (PR #123); grep finds no violet/lavender tokens in src/app/page.tsx, src/components/PricingClient.tsx, src/app/globals.css |
| 2 | No lorem ipsum, no fake numbers | PASS | All copy is real; StatsStrip (src/components/StatsStrip.tsx:9-23) hides below 25 real readings from /api/stats, never fakes a count |
| 3 | No generic headline | PASS | H1 rotates among 4 authored variants (src/lib/hero-variants.ts); Variant A "Ask one honest question. Draw one clear card." |
| 4 | Real images, real product | PASS | Hero uses /brand/hero-bg.jpg, deck uses the real 78 card images, SampleReading shows real cards |
| 5 | One focal point per screen | PASS | Hero: question box + H1, one primary CTA (single-CTA layout, Velu decision). Sections: one H2 each |
| 6 | Break the center | PASS | Section headings left-aligned (PR #123 Run B); hero stays centered by Velu's decision |
| 7 | Equal edges | PASS | Every section uses mx-auto max-w-6xl px-4 sm:px-6 |
| 8 | One section per screen | PASS | Hero, TodaySample, StatsStrip, spreads, deck, What is tarot, SampleReading, ReturnLoop, daily card, pricing preview — each ~1 screen, no neighbour heading peeking |
| 9 | One system: fonts, buttons, cards, radius | PASS | 2 fonts only; btn-gold / btn-secondary / btn-ghost; rounded-2xl cards; one gold border language |
| 10 | Colour has a job, gold rationed | PASS | Gold = headings, prices, CTA, borders only; body copy cream/75-85 on navy; no gold body text |
| 11 | Motion from the user, not the scroll | PARTIAL | See transitions audit. Card-sheen 9s loop and Orb/starfield are ambient and mostly resting (Run D); SampleReading 0.6s reveals were over the 150-250ms guide — fixed to 0.25s in this run |
| 12 | Hero H1 presence | NOTE | H1 on this branch is text-4xl/5xl. Impeccable live made it text-5xl/6xl on branch impeccable-live-2026-11-17 (commit 862dcb6, not merged). Not duplicated here — that branch owns the change |

### Notes, no change in this run (need Velu's call, not a fix)

- Homepage pricing preview is 3 identical centered cards — the slop
  shape — but Velu locked identical-size pricing cards, popular by
  border/badge not height. Real content (price + Oracles) is the
  differentiator. Stays.
- Two same-shape card rows on one page ("What's on your mind?" 4 cards
  + pricing preview 3 cards). Both are functional and locked. Stays
  unless Velu wants a different pricing-preview shape.
- Homepage copy is very short ("78 cards. Tarot helps you think.").
  That is the S-15 real-content pass, still open; no copy rewritten
  here.

## 2. pick-ui-library (S-21 / S-33) — audit, no installs

Curated list: Emil Kowalski's picks. One library per component task.

| Task / component | Current in Sortes | Pick | Verdict |
|---|---|---|---|
| Toasts / notifications | Sonner ^2.0.8, SonnerToaster.tsx, failure-toast.ts | Sonner | CORRECT, already in use |
| General animation (springs, enter/exit) | motion ^14.9.0, page.tsx, SampleReading.tsx, CardModal.tsx | motion | CORRECT, already in use |
| Unstyled primitives (dialog, popover, menu, select) | Hand-rolled: CardModal.tsx (motion spring + useFocusTrap.ts), BranchedMenu.tsx, GlideSelect.tsx | base-ui | GAP — no base-ui installed. Modal/menu/select are hand-built with manual focus handling. Recommend base-ui when a refactor is wanted; not installed in this run |
| Drawers / bottom sheets | None in Sortes | Vaul | NO FIT YET — no drawer exists. Possible future fit: mobile card detail / reading detail as a bottom sheet. Audit only |
| Command menu (⌘K) | None; GuidesSearch.tsx and DeckClient.tsx have search | cmdk | NO FIT — nav is small, search already exists per surface. Do not add a palette |
| Animating numbers | Custom CountUp.tsx (rAF, 700ms) + Counter.tsx | NumberFlow | GAP — NumberFlow handles digit transitions properly; CountUp re-renders text. Fit: Oracle balance, pricing "Save $X a year". Audit only, no install in this run |
| Charts | Custom SVG: WesternWheel.tsx, VedicChart.tsx, ZiweiChartBoard.tsx | recharts | NO FIT — astro charts are custom geometry, not recharts-shaped |
| Drag and drop | None | dnd kit | NO FIT — no drag surface |
| Virtualization (long lists) | DeckClient renders all 78 cards, no virtualization | Virtuoso | NOTE — 78 rows is over the >50 threshold in the Vercel guidelines; consider Virtuoso or content-visibility for /deck. Audit only |
| State management | AuthProvider context + useState | zustand | NO FIT — no prop-drilling web to fix |
| className conditionals | Template-literal ternaries (e.g. PricingClient.tsx billing toggle) | clsx (cva if variant-shaped) | MINOR GAP — clsx would clean the ternaries. Audit only |
| Theme switching | html[data-theme] + OS prefers-color-scheme, no flash handling noted | next-themes | NOTE — current theming works; next-themes is the curated pick if flash-on-load ever shows. Audit only |
| Design components (Beautiful UI, RareUI, Magic UI, Aceternity, 21st.dev) | ReactBits StarBorder vendored, in use on pricing; MagicBento removed (lint fail, Phase 4C) | — | NO ADD in this run — no component on homepage/pricing needs a design-library swap |
| OTP inputs | None | input-otp | NO FIT — no OTP flow |
| Toasts, again | Sonner | Sonner | CORRECT (see above) |

## 3. transitions.dev (S-22) — audit + fixes applied

Tokens used: --duration-fast 250ms (dropdown/modal open, tabs, page
slide), --duration-very-slow 500ms (text reveal, success check, badge),
--ease-smooth-out cubic-bezier(0.22, 1, 0.36, 1). Guide: motion 150-250ms.

| Location | Was | Fix applied | Rule |
|---|---|---|---|
| src/app/page.tsx:325 spread cards hover lift | duration-300 (300ms) | duration-250 | --duration-fast 250ms, hover lift / position change |
| src/app/page.tsx:362 deck cards hover lift | duration-300 | duration-250 | same |
| src/app/page.tsx:480 daily fan cards hover lift | duration-300 | duration-250 | same |
| src/components/SampleReading.tsx:54 body reveal | duration 0.6s, delay 0.1s | duration 0.25s, no delay | Guide 150-250ms; matches the page's own fadeUp 0.25s |
| src/components/SampleReading.tsx:127 heading reveal | duration 0.6s | duration 0.25s | same |
| src/components/CountUp.tsx:9 default duration | 700ms | 500ms | --duration-very-slow 500ms, number pop-in |

Checked, left alone, with reason:

- globals.css btn-gold transition 0.15s/0.2s — inside tokens, leave.
- globals.css calendar-pop 0.22s — inside 250ms, leave.
- globals.css card-sheen 9s infinite — Taste says card loops 2.5-4s,
  but Run D deliberately calmed it to a 9s cycle with the sweep only
  in the last 10%, mostly resting. Re-tightening it would re-add the
  loopiness Run D removed. Leave.
- globals.css magic-glow 3.2s one-shot — one-shot, settles, leave.
- globals.css btn-shimmer 0.6s on hover/focus only — one sweep,
  leave.
- CardModal.tsx spring damping 28 / stiffness 300 — motion spring,
  leave.
- Header.tsx:342 animate-pulse skeleton — Tailwind 2s pulse with
  motion-reduce:animate-none, leave.
- page.tsx fadeUp/fadeIn/riseSoft 0.25s/0.25s/0.2s — already in guide.
- No `transition: all` anywhere in src. No `transition-colors` abuse:
  the chip hover (page.tsx:278) lists colour properties only.
- PricingClient.tsx billing toggle (Monthly/Annual) has no sliding
  pill — transitions.dev tabs-sliding (16-tabs-sliding.md) would fit,
  but it needs JS pill orchestration inside the Astryx layout and is
  not a timing fix. Audit only, listed as a next task.
- Reduced motion: globals.css kills all animation/transition duration
  to 0.01ms under prefers-reduced-motion, and CountUp skips animation
  entirely. Leave.

## 4. Vercel guidelines (S-23) — final QA, changed pages only

Source fetched 2026-11-17:
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
17 categories. Checked src/app/page.tsx, src/components/PricingClient.tsx,
src/components/SampleReading.tsx, src/components/CountUp.tsx,
src/components/SonnerToaster.tsx, src/components/Header.tsx.

Pass:

- Icon-only buttons have aria-label (Header.tsx:316 theme, :394 menu,
  :414 close, :361 retry, :377 account).
- Form controls labelled: hero input has sr-only label, autocomplete
  off, maxLength 300 (page.tsx).
- `<button>` for actions, `<Link>` for navigation, no div onClick.
- Images: next/image throughout, hero priority, below-fold lazy by
  default, decorative alt="".
- Headings hierarchical: h1, then h2 per section, h3 "How it works",
  h4 step titles (page.tsx). Skip link present in layout.
- Focus: global :focus-visible 2px gold ring (globals.css); every
  focus:outline-none pairs with focus-visible:ring-2 (grep verified);
  IntakeSteps h1 outline-none! is a non-interactive focus target with
  an explanatory comment.
- Animation: transform/opacity only, no transition:all, reduced-motion
  kill switch, autoplay loops >5s are ambient decoration (Orb,
  starfield) and rest under reduced motion.
- Typography: text-balance on H1, tabular-nums on prices and Oracle
  counts (.num, font-number, lining-nums), "…" in "Starting
  checkout…".
- Safe areas: Sonner mobileOffset keeps toasts above the iOS home
  indicator (PR #124); html/body overflow-x: clip.
- Dark mode: color-scheme dark/light set, theme-color in layout.
- Hydration: hero variant renders A on server, random pick after
  mount in a microtask (no mismatch).
- Hover: every button/link/card has a hover state.

Findings, report only, no change in this run:

- src/app/page.tsx hero placeholder "What's on your mind?" — Vercel
  says placeholders end with "…" and show an example pattern. That is
  a copy change; out of scope for this run.
- src/components/PricingClient.tsx:121 billing toggle is useState
  only — Vercel says URL should reflect state (monthly/annual). URL
  sync is a behaviour change; out of scope.
- src/app/deck/DeckClient.tsx (not a changed page, noted): 78 cards
  rendered without virtualization — Vercel says >50 rows virtualize.
- No global `touch-action: manipulation` or `-webkit-tap-highlight-color`
  set — Vercel touch rule. Global CSS change; listed, not applied.
- No `<link rel="preconnect">` for CDN/asset domains and no font
  preload in the checked pages — the fonts load via the layout; listed,
  not changed.

## Gates

Run in ~/workspace/sortes-taste-next-2026-11-17, 2026-11-17, all pass:

- Typecheck: `npx tsc --noEmit` pass. Note: the first run failed on
  src/app/layout.tsx:97 `LayoutProps` — a missing generated-types file
  in the fresh worktree, pre-existing, not this change. `npx next
  typegen` generated it, then tsc passed clean.
- Lint: `npx eslint .` exit 0, no errors.
- Tests: `npx vitest run` — 1079 passed, 100 skipped, 0 failed
  (151 test files passed, 8 skipped), same counts as the origin/main
  baseline.
- Build: `npm run build` pass, all routes built including / and
  /pricing.
