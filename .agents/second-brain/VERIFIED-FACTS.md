# Verified facts only (2026-11-02)

Every entry here was verified live or by a stated check on the
stated date. Anything not listed here is NOT verified, even if it
is plausible or was merged.

## Verified live, 2026-11-02

- PR #35 sign-in origin fix, live on BOTH domains
  (sortes.resonantatlas.com and sortes-muse.vercel.app): live
  JavaScript chunks contain `window.location.origin` for
  `emailRedirectTo` in AccountClient, after an initial check that
  still showed the old chunk (Vercel build time). Method: repeated
  live chunk checks, three consecutive passes on both domains.
- Supabase redirect list, 2026-11-02 ~22:01 Manila, dashboard:
  added https://sortes.resonantatlas.com/auth/callback and
  https://sortes.resonantatlas.com/**, dashboard message
  "Successfully added 2 URLs", final list 8 URLs after reload,
  Site URL unchanged, nothing else touched.
- PR #34 live: canonicals correct to their own pages on 10 pages
  (charts, horoscope, spreads, deck, credits, faq, guides,
  birth-card, about, daily); horoscope h2 live; llms.txt canonical
  with faq/birth-card, no vercel URLs; credits explainer in live
  JS chunk. Lighthouse mobile after PR #34: Charts 98/100/100/100
  and Credits 98/100/100/100, SEO 92 to 100.
- PR #31 live: Vercel Production deployment for 0f47133 Ready;
  home 200, moon image 200 with 15,422 bytes, live home chunks
  contain orbit-centre reference.
- PR #29 live verified (React Bits batch).
- Domain: sortes.resonantatlas.com live verified 200 on /,
  /sitemap.xml, /robots.txt, /deck on 2026-11-02. DNS: CNAME
  sortes to Vercel DNS, Proxy Disabled. Contact email in code:
  support@resonantatlas.com, SITE_URL in code is the canonical domain.
- W3 before PR #34 (all 15 pages): 0 errors everywhere, 1 warning
  only (/horoscope "Article lacks heading"). After PR #34:
  horoscope 0 errors 0 warnings, credits 0 errors 0 warnings,
  only informational trailing-slash notes.
- Axe 2026-11-02, local dev: dark theme 0 violations on all
  11 pages. Light theme before gold fix: 1 color-contrast
  violation, 2 nodes, footer labels "Explore" and "Trust"
  #8a6d0a on #f9f4e3, contrast 4.46 vs 4.5 required. After gold
  #7c5e00: light home re-run 0 violations.
- Lighthouse before PR #34: Home Mobile 86/100/100/100, FCP 1.5s,
  LCP 3.8s, TBT 0, CLS 0; Home Desktop 100 all, LCP 0.6s.
  Charts Mobile 100/100/100/92, Horoscope 100/100/96/92,
  Spreads 96/100/100/92, Deck 100/100/100/92. Subpage SEO 92 was
  the canonical-to-root bug, fixed by PR #34.
- LightSite GEO fresh run 2026-11-02 (site-wide home scan, valid
  set): Home AI Readiness 64/100 Grade D+, Discovery 7/25,
  Crawler Access 22/25, Structured Data 13/25, Page Clarity 22/25.
  Individual subpage scans 35-51 are a TOOL BUG (probes
  /daily/robots.txt etc.), do NOT use.
- BugSmash roast fresh 2026-11-02: Overall 6.3 (Product Clarity 6,
  UX Design 8, Content Strategy 6, Conversion Readiness 5).
  Roast: https://tools.bugsmash.io/roast-my-website/a3208d73-b3b1-4990-9c6f-a744d0c024b7
- Verified chart example used in tests: 1990-01-01 08:00 Manila,
  Female, lat 14.5995, lon 120.9842. Ziwei: Snake, Capricorn,
  Life Sun/Blessing, Lunar 1989-12-5. Western: Sun Capricorn
  280.30 house 12, Moon Aquarius 326.55, Rising Aquarius 303.82,
  Midheaven Scorpio 223.82, 39 aspects.
- Daily horoscope built in-house: aztro API was dead (HTTP 000,
  2026-11-01) and NOT used.
- Antigravity CLI agy 1.4.12 signed in 2026-11-02 22:19 Manila as
  velu2k03@gmail.com, session persists, headless needs
  --dangerously-skip-permissions before -p with -p="..." attached.
- React Bits Batch 1 local verification (2026-11-03 00:12 Manila):
  npx tsc --noEmit exited 0. npm run build exited 0 with all 44 routes generated.
  Zero em dashes in modified files. Uncommitted on branch react-bits-batch1.

## DO-NOT-CLAIM list (not verified, do not say they work)

- A complete live sign-in with a real mailbox and code, end to end,
  on either domain. Never done. A live sign-in test by Velu is owed.
- A complete live magic-link sign-in.
- A complete live password sign-up, sign-out, sign-back-in cycle.
- Supabase OTP mail delivery speed, spam placement, or rate limits
  for a new mailbox.
- Whether "Confirm email ON" changes the first OTP for a new email.
- Cross-domain session behaviour (start on one domain, land on
  the other, cookie behaviour).
- Real hardware phone test, real reduced-motion browser test,
  tarot ShareReading image output click test.
- Live OpenRouter interpretation end to end with a live key.
  Never tested end to end. Failed paid interpretation is NOT
  auto-refunded (disclosed risk).
- Chinese Western/Vedic legends, geocoding beyond the Manila preset.
- Mozilla Observatory scan.
- Support email Cloudflare Email Routing completion: guide given,
  completion NOT confirmed.
- Together AI startup accelerator response: status unverified from
  the futureai inbox (not connected). Baseten: REJECTED on the
  $1M funding rule.
- Any claim that a fix "works" based only on a merge. Merges are
  not live verifications.
