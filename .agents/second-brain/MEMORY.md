# Sortes memory (for agy)

Source: main agent context, 2026-11-02. If this file and live code
disagree, live code wins, and this file must be updated.

## What Sortes is

- Sortes by Resonant Atlas: tarot, horoscope, and astrology web app,
  Next.js, hosted on Vercel. Guest use works without an account.
- Repo: github.com/Velu2k03/Sortes-Muse. Workspace: ~/workspace/sortes.
  Vercel project: sortes-muse. Remote main is the source of truth.
- Local checkout note (2026-11-02): a local branch named astro-v1
  existed with uncommitted changes to AccountClient and the callback
  route. Do not assume local equals remote main. Check
  `git status` and remote main before any edit.

## Live domains (both serve the same app)

- https://sortes.resonantatlas.com (canonical domain)
- https://sortes-muse.vercel.app
- Root resonantatlas.com is untouched. "drvelu" never appears in Sortes.

## Features (baseline, built 2026-09-29 and extended since)

- Home Draw a Card, 78-card Rider-Waite deck browser, free Daily Card.
- Category intake (love, career, finances, academics, health) with
  OpenRouter free-model AI personalization, English default,
  Tagalog/Taglish matched. Reading history, share-as-image, PWA offline.
- Western, Vedic (Lahiri, whole-sign), and Ziwei birth-chart
  calculation. Calculation is always free.
- Daily and weekly horoscope, built in-house, free, unsaved, no birth data.
- Charts: iztro 2.6.3 MIT (Ziwei), circular-natal-horoscope-js 1.1.0
  Unlicense (Western), caelus 0.25.0 MIT (Vedic). Swiss Ephemeris
  (AGPL/paid) is excluded, as are all AGPL/GPL traps.
- True solar time is longitude correction only, disclosed on page.
  Manila +3.9 min, 08:00 becomes 08:04. No timezone DB, no DST,
  no equation of time. Unknown birth time stays noon.
- Privacy rule for charts: calculate positions, store only
  positions/signs/palaces. Do NOT store raw birth date/time/location
  in the database. Do NOT send raw birth data to any AI prompt.
  Birthdays in intake are never sent to AI and never stored.
  Geocoding place string is used only for lookup. Reading intake
  raw data is deleted after 30 days.

## Pricing and credits (UNCHANGED by sign-in work, do not change)

- 1 credit per full reading / full chart interpretation.
- First per system free: tarot first Quick Insight free; charts first
  interpretation per system free, calculation always free.
- Packs in `src/lib/site.ts` CREDIT_PACKS: 5/$3.99, 12/$7.99
  (popular), 30/$14.99, via Lemon Squeezy.
- Credits are client-side only in the current code; neither AI route
  checks a server balance. That is a known gap, not a rule to copy.

## Sign-in architecture

- Original auth is custom (`src/lib/auth.ts`, jose JWT, cookie
  `sortes_session`, scrypt, 30-day session), NOT Supabase-as-primary.
- PR #23 added a Supabase bridge: `POST /api/auth/supabase-session`,
  callback route, dynamic code length (8 Supabase / 6 local).
- PR #7 fail-fast: 503 "Sign-in is not configured on this server
  yet" before user creation.
- Account page: `src/app/account/AccountClient.tsx`, two tabs:
  Password tab (default, email + password, login/signup routes,
  Postgres via POSTGRES_URL/DATABASE_URL, tables auto-created in
  `src/lib/db.ts`) and Email code tab (Supabase OTP in production,
  local 6-digit fallback in dev).
- Session secret fallback in `src/lib/auth.ts`: AUTH_SECRET, then
  NEXTAUTH_SECRET, then SUPABASE_JWT_SECRET.
- Vercel production env (names only, values never recorded):
  17 variables: 7 Postgres, 9 Supabase, 1 OPENROUTER_API_KEY.
  AUTH_SECRET, RESEND_API_KEY, EMAIL_FROM were NOT present, which
  is why the old custom email-code flow showed "not configured".
- Supabase project state (2026-11-02): region ap-northeast-1,
  Email provider on, Confirm email ON, GitHub on, Google DISABLED
  as a Sortes auth provider, OTP 8 digits, expiry 3600s.
- Site URL in Supabase dashboard was left unchanged (an internal
  Vercel deployment address, not a public domain).

## PR history (merged, verified where stated)

- PRs #1 through #27 merged (charts phases, Vedic, daily horoscope,
  light theme, guides, About, sign-in bridge PR #23, topic spreads
  PR #24, llms.txt PR #25, weekly horoscope/birth-card/FAQ PR #26,
  HoloCard PR #27).
- PR #29 merged 2026-11-02, main 580c5dc9, live verified: five
  scoped React Bits effects (Dark Veil hero dark only, Shiny Text
  hero tagline only, Click Spark daily draw + spread start,
  Magic Bento home spread grid, Star Border primary CTAs).
  React Bits Pro is PAID, must not use without approval.
- PR #31 merged 2026-11-02, main 0f47133, live verified: deck orbit
  showcase below spreads grid, centre image approved Flow moon
  400x400 at public/orbit-centre-moon-400.jpg, Rubber Segment on
  horoscope toggle, Lattice Loader + Thought Line waiting
  experience with real stages only, no card names while waiting,
  credit spend-first/refund-on-failure preserved.
- PR #34 merged 2026-11-02, main ce218e4, live verified: audit
  batch 1 (per-page canonicals, horoscope h2, credits explainer,
  llms.txt canonical URLs, light gold #7c5e00, birth-card hint).
- PR #35 merged 2026-11-02, main b421242, live verified on both
  domains: sign-in origin fix (see VERIFIED-FACTS).
- React Bits Batch 1 implemented (branch react-bits-batch1, uncommitted):
  refined Dark Veil with light-theme pale gold mist gradient (non-WebGL);
  toned down Shiny Text to static typography with subtle 16s light pass;
  narrowed Click Spark to drawing, revealing, and beginning a reading;
  refined Magic Bento with pointer gold glow and removed click ripple;
  toned down Star Border to 7s travelling light on single primary CTA per page
  with static gold borders elsewhere; stopped JS handlers under prefers-reduced-motion.
- HoloCard: `src/components/HoloCard.tsx` + CSS, ONLY in CardModal,
  preset gold, foilColor #d4af37, width 160, radius 12. Velu was
  asked if he wants bursts instead of gold, unanswered.

## Design tokens

- Dark: ink #0a0e1a, navy #141b2e, panel #1a1f2e, gold #d4af37,
  goldbright #f4d03f, cream #ede6d6, mist #9ca3af, violet #8b5cf6.
- Light: paper #fdf9ee, panel #ffffff, text #1c1a15, gold #7c5e00,
  mist #45423c, violet #6d28d9.
- Display Cormorant Garamond, body Inter. btn-gold is a metallic
  gradient, NOT flat yellow.
- Logo: ONLY the original Flow moon image (gold line art on navy
  #0a0e1a). Bold simplified crescent+star favicon was REJECTED by
  Velu 2026-11-02. Background removal via Google Flow was pending
  his phone approval. Do not ship the bold set.

## Standing user rules that bind agy work

- No em dashes in any user-facing text.
- Audit-then-merge gate before any merge: typecheck, build,
  charts check, local dev, mobile 360/390, dark/light, reduced
  motion, no em dashes, no pricing/credits/auth/spreads data changes.
  Fix findings in the same PR, then verify production deployed.
- Do not start the larger redesign (issue #32) or a React Bits
  overhaul until the user says so. Preserve functionality and
  design decisions he already approved.
- Do not manipulate scores to get higher numbers. Do not add
  unnecessary SEO content or schema markup. Do not treat validator
  bugs as website failures.
- Browser first, always, for checking live behaviour.
- Agent may edit Sortes code directly in the workspace. Push rules
  belong to the main agent: review first, user go-ahead, correct
  push route per repo. Never push from a stale tree: reset to
  origin/main first.
- Antigravity is for Sortes fixing/coding ONLY, on his Google Pro
  quota. NOT for ReelDirector (Muse Code codes that, agent monitors).
- Do NOT read Velu's Gmail for a Sortes sign-in code unless he asks
  for that specific retrieval.
- Never use Impeccable in any form. It is banned.
