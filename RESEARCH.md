# Competitor Research: Sortes by Resonant Atlas

Researched 2026-09-29. Competitors studied via web search + page-text fetches (no live browser):
Labyrinthos (labyrinthos.co / Labyrinthos Academy app), Golden Thread Tarot
(goldenthreadtarot.com + legacy app), Biddy Tarot (biddytarot.com). Plus current
2025-2026 design guidance for mystical/spiritual apps from maintained design
systems (mystical-dark-ui skill, tarot-ai-app CLAUDE.md, tarot-timer Figma
guidelines, 2026 motion-design guides, PWA best-practice guides, Keen x Mother
Design 2026 rebrand, Astroideal 2026 sector analysis).

---

## 1. Labyrinthos (Labyrinthos Academy) — flow map

- **Landing:** "Tarot Classes & Supplies for Modern Witchcraft." Hero CTAs: shop
  physical decks / download app. No prices on the hero; monetization discovered
  inside the app. Newsletter captures email with a free 3-part tarot guide.
- **Onboarding:** No forced signup. Web app greets you as "Nameless Ghost" with
  limited features; account unlocks more but is not mandatory. First open drops
  you straight into a free 3-card daily reading (learn by doing, not by tutorial).
- **Reading flow:** 1) Choose a spread (70+, organized by category: General,
  Spiritual, Love, Career, Moon Phase; plus custom spread builder and freeform
  placement on a mat). 2) Draw with options (reversals on/off, pick your own or
  let the app pick, choose deck). 3) Cards laid out; tapping a card pops a bubble
  with its meaning (keywords, description, suit, numerology, element, zodiac).
  4) Optional AI interpretation ("Catssandra" cat mascot): you type a question,
  AI returns an overview paragraph + per-position, per-card interpretation, with
  an "entertainment purposes only" disclaimer. AI is framed as a learning aid
  ("help you see interpretations you missed"), not a replacement for learning.
  5) Save to Journal with notes and questions; Mirror analytics aggregates
  (most common card/suit/number, reversal %) over time.
- **Paywalls:** Core (all readings, spreads, journal, lessons, meanings library)
  is FREE. Money rails: (a) credits for AI readings — 33/$0.99, 333/$4.99,
  777/$6.99 (angel-number branding), 33 credits free on install so the first AI
  reading is free, paywall only when credits run out; (b) Premium subscription
  $9.99/mo, $24.99/quarter, $89.99/year (clarifying cards, almost-unlimited AI);
  (c) one-time digital decks $4.99. 100% ad-free.
- **Mobile UX:** Native iOS/Android + web. Five-tab bottom nav
  (Daily / Journal / Reading / Learn / Decks). "Witchy-cute" star motifs, mascot,
  gamification (XP, unlockable avatars, Duolingo-style quizzes with spaced
  repetition). Daily tab is a ritual engine: 3-card reading + moon phase +
  birthday-based life-path cards + study checklist + push reminders.

## 2. Golden Thread Tarot (legacy, superseded by Labyrinthos) — flow map

- **Landing:** "Your Fate is in Your Hands." Download App / Purchase Deck side by
  side. Self-knowledge, not fortune-telling: "Tarot is not about revealing a
  fixed future, but giving you access to the self knowledge you need to make
  better decisions."
- **Reading flow:** 1) Set a question or focus. 2) Timed **shuffle ritual**
  (shuffle timer, not instant draw). 3) Draw digitally (or use your physical
  deck, the app guiding you). 4) Small spread set (3-card past/present/future
  emphasized). 5) **Reveal first impression first**: the app asks you to absorb
  emotional reactions before looking up meanings. 6) **Static database meanings**
  (no AI): keywords, suit, number. Reversed cards displayed rotated 180°.
  7) Save reading **with how you felt** (emotion logging) -> feeds "Your Mirror"
  analytics (top question topics, mood over time, suit distribution).
- **Paywalls:** None — free, no ads, no IAPs. Revenue came only from the $45
  physical deck. The app was eventually abandoned.
- **Aesthetic:** Near-black backgrounds, gold line-art cards, minimal chrome.
  Minimalist gold-on-black art reduced visual noise but made complex spreads
  harder for beginners (too few visual cues).

## 3. Biddy Tarot (biddytarot.com) — flow map

- **Landing:** Founder-led ("Hi, I'm Brigit..."), three self-routing entry paths:
  Learn the Tarot Basics / reading tips / Build a Tarot business. "As Featured
  In" strip (HuffPost, MindBodyGreen, Oprah...), named testimonials.
- **Onboarding:** Education funnel, not product onboarding. Free "How to Read Any
  Tarot Card Intuitively" workshop (email gate), free printable meanings guide,
  weekly newsletter. Everything sells "intuition over memorization."
- **Reading flow:** No automated click-to-draw readings (deliberate brand
  stance). Human-powered free readings: seekers post a question, matched with
  community readers (certification students practicing), reading delivered free
  in exchange for feedback. In the app: "AI-Powered Readings: ask a question,
  get instant insights" + daily card pulls + meditations (free tier + paid
  community).
- **Paywalls:** All 78 card meaning pages FREE (the SEO moat). Paid: one-time
  courses ($97-$1,997 ladder), books/decks, flagship Certification $1,997, and
  the recurring Collective membership community ($30+/month).
- **Card meaning template (their famous pages):** 1) **Keywords block at the
  very top** ("UPRIGHT: Beginnings, innocence, spontaneity... / REVERSED:
  Holding back, recklessness...") — skimmable in seconds. 2) ~200 words
  describing the Rider-Waite imagery symbol by symbol. 3) Card image. 4) ~400
  words upright interpretation, second person, practical. 5) Reversed section
  covering BOTH polarities (blocked AND excess energy). 6) FAQ block (SEO).
- **Mobile UX:** Dark deep teal/navy + warm gold/mustard, elegant serif headings,
  clean sans body. Long editorial single-column pages; keyword blocks make pages
  skimmable on phones.

---

## 5+ UX patterns worth copying (mapped to Sortes build)

1. **First reading free, zero friction, no signup before the first card.**
   (Labyrinthos: first open = free 3-card reading as "Nameless Ghost"; Biddy:
   one question + one card, email asked AFTER, not before; spec already demands
   this for Sortes.) Daily Card must work with zero intake and no account.
2. **Keywords-first card layout.** (Biddy) Upright/reversed keyword chips at the
   very top of every card page, full story below. Serves the 5-second lookup
   user and the deep-read user in one template. Use this for the Deck page and
   in-reading card detail.
3. **Ritualized reading flow, one screen per beat.** (Golden Thread + 2026
   design guidance) Category/question -> shuffle animation -> deal face down ->
   tap-to-reveal ONE card at a time -> interpretation. The pause between draw
   and reveal is the ceremony (peak-end rule: keep the reveal uncluttered).
4. **Journal + "Mirror" pattern analytics as the retention loop.** (Labyrinthos
   + Golden Thread "Your Mirror") Saved readings aggregate into most-drawn
   cards, suit distribution, categories — turning a diary into a quantified-self
   product. Cheap to build, strong differentiator. Fits Sortes' reading history
   feature.
5. **Reflection framing + AI as aid, never oracle.** (Labyrinthos Catssandra
   framed as "see interpretations you missed"; Keen x Mother Design 2026
   rebrand: perspective, not prophecy.) Static card meanings stay free and
   prominent; AI interpretations suggest. Calm disclaimer on intake and results:
   "for self-reflection, not professional advice."
6. **Free-trial bundle of the paid surface before any paywall + upfront fixed
   pricing.** (Labyrinthos: 33 free credits on install, angel-number pricing
   33/333/777 as brand charm.) Sortes' "first full reading free" maps directly.
   Show fixed per-reading prices upfront; no per-minute meters, no hidden fees.
7. **Reflection prompts BEFORE meanings.** (Golden Thread guided readings)
   Prompt a first impression / pick an emotion before revealing interpretations.
   Makes each reading feel personal without costing AI tokens.
8. **Never paywall the dictionary; monetize personalization.** (Biddy keeps all
   78 meanings free; the paid surface is coaching/practice/personalization.)
   Sortes: free deck browsing + static meanings forever; pay for AI-personalized
   readings and spreads.
9. **Delayed, dismissible PWA install prompt + honest offline UX.** (2026 PWA
   practice) Capture `beforeinstallprompt`, surface only after engagement, never
   on first paint; iOS gets Share->Add-to-Home-Screen instructions. Offline:
   cache deck + readings so the deck and history work; queue AI with "will
   generate when you're back online."

---

## 3 mistakes to avoid (mapped to Sortes build)

1. **Persistent nagging upsell UI.** (Labyrinthos review, Apr 2026: an animated
   flashing promo for the subscription was "distracting enough to reduce usage."
   Users asked for a one-time remove-this fee.) Sortes rule: any upsell
   (Top-up prompt, "Unlock the Celtic Cross") must be static, contextual, and
   dismissible. No flashing promos, no persistent badges.
2. **Free app with no monetization path decided on day one.** (Golden Thread:
   beloved, free, no IAPs, revenue only from the physical deck -> abandoned.)
   Sortes decision is baked in: pay-per-reading + credit packs from launch, AI
   personalization as the paid surface.
3. **Requiring signup / onboarding before the first reading.** (Biddy: get the
   first reading in under 30 seconds; ask for email after.) Sortes: Daily Card
   and first full reading are guest-friendly; account creation only at checkout
   (email-only, auto-created after payment).
4. **Gold as a trap color.** (Real audit findings) `#D4AF37` on near-black is
   ~9:1 (AAA) but the same gold on white is 2.5:1 (fail); muted gold labels on
   dark cards routinely fail. Rule: gold text only on dark surfaces; brighten
   toward `#F4D03F`/`#F5E07A` for small text; on gold-filled buttons use
   near-black text. Cap gold at ~20% of any view ("its power is in its rarity").
   Never flat `#000000` — darkness should have color and warmth.
5. **Engagement dark patterns.** (Astroideal 2026 sector analysis) No fabricated
   scarcity ("only 3 readings left!"), no fake countdowns, no confirmshaming,
   no distress-timed upsells after an emotional reading. The "locked spreads"
   blurred-preview pattern from the spec must use honest "Unlock this reading"
   copy, never false urgency.

---

## Design system decisions (2025-2026 guidance applied)

- **Palette (Celestial Indigo):** bg tiers `#0A0E1A` -> `#1A1F2E`/`#1A1F3A`,
  gold `#D4AF37` (small text: `#F4D03F`), mystic purple `#8B5CF6`, body text
  warm cream `#EDE6D6` (not pure white — avoids halation).
- **Type:** exactly two typefaces. Cormorant Garamond (display serif: headings,
  hero titles, revealed card names; italic flourishes) + Inter or DM Sans
  (body/UI/buttons, 16px min, 1.6-1.8 line-height).
- **Motion budget:** 100-150ms micro-interactions, 200-350ms transitions, card
  flip 400-600ms; nothing above 500ms for UI feedback; animate transform/opacity
  only; `prefers-reduced-motion` honored everywhere incl. particles.
- **Card flip:** CSS 3D `rotateY(180deg)`, `backface-visibility: hidden`, fan
  spread layout, hover lift + gold glow on desktop.
- **Particles:** slow-drifting starfield/gold dust via lightweight CSS/canvas;
  paused on `visibilitychange`.
- **Mobile:** 48px min touch targets, 16px min input font (iOS zoom guard),
  safe-area insets for standalone PWA, no horizontal scroll, test at 360px.
- **Haptics:** light tick on card select/reveal only (PWA vibration API).
- **Trust/ethics:** "For reflection, not prediction" framing; persistent calm
  disclaimer on intake + results; health readings never diagnose; intake data
  retention/deletion stated; AI disclosure; gentle session guardrails (no
  dependency-by-design); fixed upfront pricing.
- **PWA UX:** manifest `name`/`short_name`/`start_url`/`scope`/
  `display: standalone`/`theme_color`/`background_color`, `any` + `maskable`
  icons (192/512), splash via manifest; app shortcuts ("Daily card");
  Web Share API for readings; non-blocking "Update available" prompts.
