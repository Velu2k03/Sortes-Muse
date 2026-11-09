# Sortes by Resonant Atlas

[![aislop](https://badges.scanaislop.com/score/Velu2k03/Sortes-Muse.svg)](https://scanaislop.com/Velu2k03/Sortes-Muse)

A modern tarot reading web app (PWA). Draw a free daily card, browse all 78
card meanings, and receive personalized AI readings woven around your own
story. Live at **https://sortes.resonantatlas.com**.

Built with Next.js 16, React 19, Tailwind CSS v4, and Framer Motion.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Everything works out of the box with **zero configuration**: auth, credits,
and the database fall back to a local JSON store (`data/local-db.json`,
gitignored), sign-in codes print to the server console in dev, checkout
returns 503 until Lemon Squeezy keys are set, and AI readings return an
honest 503 with no Oracle spent when no API key is set (no static text
is ever served as a personal reading). Production does not fall back to the
JSON store: the app throws at boot when neither `POSTGRES_URL` nor
`DATABASE_URL` is set.

```bash
npm run build      # production build (also runs type checking)
npm start          # serve the production build
```

## Environment variables

Copy the template and fill in what you use. **Never commit `.env.local`.**

```bash
cp .env.example .env.local
```

| Variable | Required | Where to find it |
|---|---|---|
| `OPENROUTER_API_KEY` | For AI readings | [openrouter.ai](https://openrouter.ai) → Keys. Free models only; see below. |
| `OPENROUTER_MODEL` | No | Defaults to `meta-llama/llama-3.3-70b-instruct:free`. Any OpenRouter `:free` model works — browse [openrouter.ai/models](https://openrouter.ai/models) and filter by "free". Other known-free options: `google/gemma-3-27b-it:free`, `deepseek/deepseek-chat-v3-0324:free`, `qwen/qwen3-235b-a22b:free`, `mistralai/mistral-small-3.1-24b-instruct:free`. Free-model availability changes; check the catalog. |
| `AUTH_SECRET` | Production | Any random 32+ character string (`openssl rand -base64 32`). Signs session cookies. |
| `POSTGRES_URL` or `DATABASE_URL` | Production | Supabase → Settings → Database → Connection string (transaction pooler, port 6543, for the app; session pooler, port 5432, for `pg_dump`/migrations). The schema is applied by versioned migrations (`npm run db:migrate`); `ensureSchema` runs them as a dev safety net. Without either variable the app throws at boot in production; a local JSON store is used in dev only. |
| `NEXT_PUBLIC_SUPABASE_URL` | Production | Supabase → Settings → API → Project URL. Browser OTP sign-in (8-digit codes, 1h expiry). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production | Supabase → Settings → API → anon public key. Browser OTP sign-in only. |
| `SUPABASE_JWT_SECRET` | Production | Supabase → Settings → API → JWT Secret. Verifies Supabase-issued tokens server-side. |
| `NEXTAUTH_SECRET` | No | Legacy session-secret name; the app signs its own JWT cookies with `AUTH_SECRET`. Set it the same as `AUTH_SECRET` if any integration reads it. |
| `RESEND_API_KEY` | Production | [resend.com](https://resend.com) → API Keys. Sends sign-in codes by email. Without it (dev), codes print to the server console and appear in the sign-in UI. |
| `EMAIL_FROM` | No | Defaults to `Sortes <noreply@sortes.resonantatlas.com>`. Resend → Domains (verify the domain first). |
| `LEMONSQUEEZY_API_KEY` | For real payments | Lemon Squeezy → Settings → API. Enables real checkout; without it checkout returns 503. |
| `LEMONSQUEEZY_STORE_ID` | For real payments | Lemon Squeezy → Settings → Stores → your store (the numeric ID in the URL). |
| `LEMONSQUEEZY_VARIANT_PACK5` | For real payments | Lemon Squeezy → Products → your product → Variants → the 5-reading variant ID. |
| `LEMONSQUEEZY_VARIANT_PACK12` | For real payments | Same, the 12-reading variant ID. |
| `LEMONSQUEEZY_VARIANT_PACK30` | For real payments | Same, the 30-reading variant ID. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | For real payments | Lemon Squeezy → Settings → Webhooks → your webhook → Signing secret. The webhook URL to register is `https://sortes.resonantatlas.com/api/webhooks/lemonsqueezy`; subscribe to the `order_created` AND `order_refunded` events. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | No | Your domain in [plausible.io](https://plausible.io) (e.g. `sortes.resonantatlas.com`). Without it, analytics calls are no-ops (dev logs to console). |
| `NEXT_PUBLIC_SITE_URL` | No | Defaults to `https://sortes.resonantatlas.com`. Used for checkout redirects and canonical URLs. |
| `CRON_SECRET` | For win-back emails | Random 32+ char string. Vercel Cron sends it as a Bearer token to `/api/cron/winback` (scheduled in `vercel.json`, daily 02:00 UTC). Without it, the win-back job returns 500 and no emails go out. |

## Retention engine

- **Daily streaks** (`src/lib/storage.ts`): consecutive-day daily-card draws, badge on `/daily` at 2+ days. The push prompt (`PushPrompt.tsx`) switches to "Keep your N-day streak alive 🔥" copy when a streak exists.
- **Win-back emails**: `vercel.json` schedules `GET /api/cron/winback` daily at 02:00 UTC. It emails users quiet for 7+ days (max 1 nudge per 60 days, tracked in `users.winback_sent_at`), via Resend. Requires `CRON_SECRET` and `RESEND_API_KEY`.
- **Social proof**: `/api/stats` returns readings cast in the last 7 days (10-min cache). The home page `StatsStrip` shows it only once it reaches 25, so the number is always real and never sad.
- **Sample reading**: `SampleReading.tsx` on the home page shows an anonymized personalized reading so visitors see what they are buying before any paywall.

## How the pieces fit

- **Credits.** 1 credit = 1 full reading, any spread. Packs: 5/$3.99, 12/$7.99
  (most popular), 30/$14.99. The first Quick Insight reading is free, no
  account needed. Guests keep credits in `localStorage`; signing in merges
  them into the database balance.
- **Auth.** Two sign-in paths. Resend email codes (6 digits, 10-minute expiry,
  hashed with SHA-256, 5-attempt lockout) when `RESEND_API_KEY` is set;
  Supabase email OTP (8 digits, 1-hour expiry) when the Supabase browser
  client is configured — that is the live path in production, where
  `AUTH_SECRET`/`RESEND_API_KEY` are not set. Session is a signed JWT in an
  HTTP-only cookie (30 days). Account deletion requires re-authentication
  (password or a fresh email code), not just the session cookie.
- **AI readings** (`POST /api/reading/generate`). Paid readings collect an
  intake (category, story, exact question) and generate a warm, personal
  interpretation. Guardrails: reflection framing, never guaranteed
  prediction; health readings are wellness reflection only, never diagnose,
  and always close with a professional disclaimer. Only the first name and
  story essentials are sent to the model — birthdays and sensitive fields are
  stripped before the request leaves the server. Language matches the user
  (English default, Tagalog/Taglish when detected). Any provider failure,
  timeout (25s), or missing key fails honestly with a 503 and no Oracle
  spent — no static text is ever served as a personal reading.
  Rate-limited to 20 generations per IP per hour.
- **Payments.** With Lemon Squeezy env vars set, checkout redirects to Lemon
  Squeezy (guests check out with email only). The webhook
  (`/api/webhooks/lemonsqueezy`) verifies the HMAC signature, auto-creates
  the account from the buyer's email, grants credits exactly once
  (idempotent on retries), and stores every transaction (email, pack type,
  amount, date). On `order_refunded` it revokes the same credits (also
  idempotent: a double refund is a no-op). After payment the buyer lands on `/oracles?purchase=success`,
  which confirms the credits the moment they land — no waiting screens.
- **PWA / offline.** `public/sw.js` (generated by `node scripts/generate-sw.js`
  — re-run if the card set changes) precaches all 78 card images, the card
  back, and brand assets; app bundles are cached on visit, so readings work
  offline after the first visit. `/offline` is the fallback page.
- **Privacy.** Raw intake answers are never stored — only the finished
  reading. Legal pages state: readings are for reflection only; health
  readings never diagnose; intake stories are deleted after 30 days; only
  first names reach the AI provider.

## Deploying on Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add the environment variables above (at minimum `AUTH_SECRET`,
   `POSTGRES_URL`, `RESEND_API_KEY`, and the Lemon Squeezy keys for real
   payments).
3. Deploy.
4. **Custom domain:** the canonical domain is `sortes.resonantatlas.com`.
   In your DNS provider, add a `CNAME` record: host `sortes` →
   `cname.vercel-dns.com`. Then in Vercel → Project → Settings → Domains,
   add `sortes.resonantatlas.com`. (The root domain and any other subdomains
   are untouched — this project only ever uses `sortes.resonantatlas.com`.)
5. In Lemon Squeezy → Settings → Webhooks, point the webhook at
   `https://sortes.resonantatlas.com/api/webhooks/lemonsqueezy` with the
   `order_created` AND `order_refunded` events.

## Project structure

```
src/app/            # Routes: home, /deck, /daily, /spreads, /spreads/[slug],
                    # /intake/[slug], /reading/[id], /journal, /oracles,
                    # /account, /privacy, /terms, /offline, /api/*
src/components/    # ReadingFlow (3D flip ritual), TarotCard, CheckoutModal,
                    # AuthProvider (guest+server wallet), ShareReading, Starfield…
src/lib/           # tarot.ts (spreads/draws), cards.ts, storage.ts (guest wallet),
                    # db.ts (Postgres or local JSON), auth.ts, lemonsqueezy.ts,
                    # intake.ts (categories/fields), site.ts
src/data/cards.json # All 78 cards: names, keywords, original reflection-tone meanings
public/cards/       # 78 public-domain Rider-Waite images + card back
public/sw.js        # Generated service worker (see scripts/generate-sw.js)
```

## Verification

- `npm run build` — type check + production build must pass.
- All 78 cards: `node -e` check in `scripts/` verifies every `cards.json`
  image resolves to a valid JPEG in `public/cards/`.
- Analytics events (`reading_started`, `reading_completed`,
  `daily_card_drawn`, `purchase_completed`) log to the console in dev and go
  to Plausible in production.
- `npm run lint:gate` — the PR lint gate (`scripts/lint-gate.sh`): repo lint
  must be clean, and the explicit jsx-a11y run may not add any warning beyond
  `scripts/lint-baseline.txt` (tab-delimited file, rule, message). CI runs it
  on every PR (`.github/workflows/lint-gate.yml`).
- Optional pre-push hook (opt-in, once per clone; CI is the real backstop):
  `git config core.hooksPath .githooks` (skip once with `git push --no-verify`).
- `python3 scripts/smoke-crawl.py http://localhost:3100` — signed-out page
  crawl against `npx next start -p 3100`; fails on any page error,
  `console.error` (hydration warnings included) or 5xx, and parses the
  JSON-LD. Needs Python Playwright (`pip install playwright`), not a repo
  dependency.
