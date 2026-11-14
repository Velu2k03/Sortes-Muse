# Sortes environment variables — definitive audit by code usage

Generated 2026-11-06 (Phase 6B) by grepping every `process.env` access in
`src/` and `scripts/` and reading each use site. This is the single source
of truth for what the app actually reads. Vercel dashboard state (verified
2026-11-06): Production has 23 variables set; Preview and Development have
ZERO. The six names reported missing in Production are resolved below —
**three of them are NOT actually required** (see the table).

## Rules

- Set exactly ONE database variable: `POSTGRES_URL`. `DATABASE_URL` is a
  fallback alias read by the same code; setting both to the same value is
  harmless but redundant, and setting them to *different* databases is a
  live footgun. The app prefers `POSTGRES_URL`, and the reconcile script
  now prefers `POSTGRES_URL` too (Phase B, R13); `DATABASE_URL` is the
  fallback for both.
- Never copy a Production secret into Preview/Development. Preview must
  use staging/test values only (see `docs/STAGING.md` and
  `hidden_files/staging-preview-env.md`).
- Names only are listed here; no values. Values live in Vercel / the
  Supabase dashboard / the owner's Secure Vault.

## Variable table

| Variable | Where used | Production | Preview (staging) | Development | Behaviour when missing |
|---|---|---|---|---|---|
| `POSTGRES_URL` | `src/lib/db.ts:43,47`, `scripts/migrate.mjs:24` | **Required** (set) | Required, staging value | Optional (JSON fallback) | Production: app throws at first DB call — "POSTGRES_URL (or DATABASE_URL) is required in production" (fail-fast guard, Phase 6). Non-production: silent local JSON store. |
| `DATABASE_URL` | `src/lib/db.ts:43,47` (fallback), `scripts/reconcile.mjs:49` (fallback), `scripts/migrate.mjs:24` (fallback) | **Not needed** — do NOT add | Not needed | Not needed | Nothing, while `POSTGRES_URL` is set. Alias only. |
| `AUTH_SECRET` | `src/lib/auth.ts` `secret()` | **Required** (set 2026-11-10) | Required: its own generated staging value (see staging-preview-env.md), **distinct from Production's, never a copy**. Set it under Vercel Preview env vars (Preview builds run with `NODE_ENV=production`, so the throw-if-missing check runs there too) | Optional (dev-only secret) | The only session-signing secret. No fallback: the `SUPABASE_JWT_SECRET` fallback was deleted (item 9), so a missing value in production throws `AUTH_SECRET is required in production.` and sessions fail loudly. Outside production a dev-only secret is used. Rotating it signs every user out. |
| `NEXTAUTH_SECRET` | removed from `src/lib/auth.ts` (AF-005, 2026-11-08) | **Not needed** — do NOT add | Not needed | Not needed | Setting it has no effect any more. Legacy alias only; removed so it can never sign sessions. |
| `SUPABASE_JWT_SECRET` | not read by Sortes session code | **Not needed for sessions** | Not needed | Not needed | No longer used to sign Sortes session cookies (fallback deleted, item 9). Supabase tokens are verified through the anon-key client + `getUser`, not this secret. |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase-browser.ts:16`, `src/lib/supabase-server.ts:11`, `src/app/api/auth/supabase-session/route.ts:33` | **Required** (set) | Required, staging project URL | Optional | Supabase OTP sign-in, magic-link callback, and the Supabase session bridge all return 503 / fall back. The custom Resend code path is the only remaining sign-in route. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same three sites as above | **Required** (set) | Required, staging anon key | Optional | Same as above. Public key by design; safe to expose in browser code. |
| `RESEND_API_KEY` | `src/lib/email.ts:11,53`, `src/app/api/auth/request-code/route.ts:51` | **Conditionally required** (missing) | Blocked (no test key yet) | Optional (codes print to console) | Primary sign-in is unaffected: the account page uses Supabase OTP first in production (8-digit code, Supabase default mail). What breaks without it: (1) the local-dev / non-Supabase email-code path returns 503 in production; (2) **account deletion by code** — the delete panel's "Send me a code" uses `/api/auth/request-code` directly, so a passwordless account in production cannot delete by code (password deletion still works). Add a Resend key (owner approval) or route delete-code through Supabase OTP (a code decision, not yet made). |
| `EMAIL_FROM` | `src/lib/email.ts:20,61` | Optional (missing) | Optional | Optional | Defaults to `Sortes <noreply@sortes.resonantatlas.com>`. Only used when `RESEND_API_KEY` is set. |
| `LEMONSQUEEZY_API_KEY` | `src/lib/lemonsqueezy.ts` (checkout, getOrder) | **Required** (set) | Blocked (needs test-mode key) | Optional | Checkout returns 503 "Checkout not configured". |
| `LEMONSQUEEZY_STORE_ID` | `src/lib/lemonsqueezy.ts`, webhook route store check | **Required** (set) | Blocked (needs test-mode store) | Optional | Checkout 503; webhook refuses every order (store mismatch). |
| `LEMONSQUEEZY_VARIANT_PACK5` / `_PACK12` / `_PACK30` | `src/lib/lemonsqueezy.ts` (variant map, amount checks) | **Required** (set) | Blocked (needs test-mode variants) | Optional | `lemonConfigured()` false → checkout 503; webhook cannot map a variant to readings. |
| `LEMONSQUEEZY_VARIANT_SUB_SPARK_M` / `_STAR_M` / `_MOON_M` / `_SPARK_Y` / `_STAR_Y` / `_MOON_Y` | `src/lib/lemonsqueezy.ts` (subscription variant map), `src/app/pricing/page.tsx` (gating), `src/app/api/checkout/subscription/route.ts` | **Required for subscriptions** (not yet set — dashboard task) | Blocked (needs test-mode variants) | Optional | `subscriptionsConfigured()` false → pricing page shows "Coming soon" with disabled tier buttons; subscription checkout returns 503. Packs keep working. |
| `LEMONSQUEEZY_VARIANT_TOPUP_1000` / `_TOPUP_3000` | `src/lib/lemonsqueezy.ts` (top-up map, amount checks) | **Required for top-ups** (not yet set — dashboard task) | Blocked (needs test-mode variants) | Optional | `topUpsConfigured()` false → pricing top-up buttons disabled; top-up checkout returns 503. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | `src/lib/lemonsqueezy.ts:135` (HMAC verify) | **Required** (set) | Blocked (needs test-mode secret) | Optional | Every webhook returns 401; no credits are ever granted. |
| `LEMONSQUEEZY_API_BASE` | `src/lib/lemonsqueezy.ts:10` (API base override) | **Not needed** — do NOT add | Not needed | Local mock-API only | Overrides the Lemon Squeezy API base URL (used by `getOrder` for webhook verification). Only for local tests against a mock server; never set on Vercel. |
| `UPSTASH_REDIS_REST_KV_REST_API_URL` / `UPSTASH_REDIS_REST_KV_REST_API_TOKEN` | `src/lib/rateLimit.ts` `getStore()` | **Required for shared limits** (Production: set by the Upstash integration; Preview: separate Secret vars pointing at the Preview store) | Production set by the integration; Preview set as separate Secret vars | Not needed | Non-standard `_KV` names, read explicitly (`Redis.fromEnv()` would not find them). If missing, the limiter uses per-instance memory (logged once in production). If Upstash errors or exceeds the 500 ms timeout it fails OPEN to memory with a throttled `[rateLimit] FALLBACK ACTIVE` error log. Backed by `@upstash/ratelimit`; keys are `rl:<VERCEL_ENV>:<key>` (old `rl:<key>` keys expire via TTL) and email keys are SHA-256 hashed. **Two stores since 2026-11-14 (Point 8, Option A):** Production uses the Vercel-managed `sortes-rate-limit` store (ID `e5aae920-c838-45bc-b12d-8f0b09f3e2d6`); Preview uses `sortes-rate-limit-preview` (ID `e17ba867-6ddc-4055-9559-f151fb60a094`), which lives in the **Personal Upstash account (velu2k03@gmail.com), NOT Vercel-managed** — the integration will not rotate it, and it is not tied to the Vercel project's lifecycle, so rotate/replace it by hand in the Upstash console if ever needed. Both Free, Tokyo ap-northeast-1. Old `rl:preview:*` keys linger in the old store until their TTL expires; that is harmless, not a leak. |
| `SORTES_LOCAL_DEV_CODE` | `src/lib/email.ts:12` (`localDevCodeEnabled`) | **Not needed** - do NOT add | Not needed | Set to `1` locally only | Gates returning the code in the API response for local development (Phase B, R11); the code value is never logged. Without it, the local code path returns 500. Never set on Vercel. |
| `OPENROUTER_API_KEY` | `src/lib/ai.ts` via callers (`reading/generate`, `follow-up`, `chart/interpret`, `reports/generate`) | **Required** (set) | Blocked (needs its own key or a test key) | Optional | AI routes return an honest 503, no model call, no Oracle spent (verified by tests). Chart fallback text still works where it exists. |
| `OPENROUTER_MODEL` | `src/lib/ai.ts:28` | Optional (unset) | Optional | Optional | Defaults to the free chain `openrouter/free, nvidia/nemotron-3-ultra-550b-a55b:free, xingchen-agi/xing4.0-29b-a4b:free` (Phase D: router first, Nemotron 60 s timeout, Xing4.0 last). |
| `CRON_SECRET` | `src/app/api/cron/winback/route.ts:13`, `src/app/api/cron/subscription-drip/route.ts` | Required for the crons (missing) | Not needed | Not needed | `/api/cron/winback` returns 500 "CRON_SECRET is not configured". Only the daily win-back email job is affected (Vercel Cron, `vercel.json`, 02:00 UTC). No impact on sign-in, readings, or payments. `/api/cron/subscription-drip` (Vercel Cron, `vercel.json`, 03:00 UTC daily) also needs it: without it the annual subscription drip never runs, so annual buyers only ever receive the first month's credits. |
| `NEXT_PUBLIC_SITE_URL` | `src/lib/email.ts:53`, `src/lib/lemonsqueezy.ts` (redirect URL) | Optional (unset) | Optional | Optional | Defaults to `https://sortes.resonantatlas.com` in both places. Set it only if Preview/staging must redirect somewhere else. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `src/app/layout.tsx:89` | Optional (unset) | Optional | Optional | Analytics only; nothing breaks without it. |

## Script-only variables (not read by the app)

| Variable | Where used | Notes |
|---|---|---|
| `SORTES_MIGRATE_PRODUCTION` | `scripts/migrate.mjs` | Safety flag: the migrate script refuses a production-looking URL unless this is `1`. Never set it in Vercel. |
| `SORTES_RECONCILE_PRODUCTION` | `scripts/reconcile.mjs` | Same pattern for the reconcile script. |
| `SORTES_TEST_DATABASE_URL` / `SORTES_TEST_DATABASE_URL_MIGRATIONS` | `src/lib/__tests__/db-postgres.test.ts`, `migrations-pg.test.ts` | Local test-only. Point at the local staging databases, never production. **Gotcha:** if `SORTES_TEST_DATABASE_URL` is not exported, `npm test` silently SKIPS the Postgres money-path tests (the skip count rises) and still looks green. Export it before running (`postgres://sortes_test:<pw>@127.0.0.1:5432/sortes_pgtest_money`). CI sets it against a Postgres service container. `db-query-timeout.test.ts` has one known-failing case (cancel_timeout, direct) that is skipped when `CI` is set. |
| `SORTES_TEST_DATABASE_URL_RLS` | `src/lib/__tests__/rls-005.test.ts` | Local test-only. RLS 005 tests against the dedicated `sortes_pgtest_rls` database; requires the one-time `anon` / `authenticated` role setup (see `docs/STAGING.md`). |

## Production gaps, resolved

1. `DATABASE_URL` — **do not add**. `POSTGRES_URL` is set and is the
   only database variable the app needs.
2. `NEXTAUTH_SECRET` — **do not add**. Legacy alias, removed from the
   session-signing chain (AF-005, 2026-11-08); setting it has no effect.
3. `AUTH_SECRET` — **required, set in Production 2026-11-10**. The
   dedicated session secret; there is no fallback any more (item 9).
4. `RESEND_API_KEY` — **add (owner approval) if the custom code path and
   passwordless-account deletion by code must work**. Primary sign-in
   works without it via Supabase OTP.
5. `EMAIL_FROM` — optional; the default is fine unless a verified sender
   domain is wanted.
6. `CRON_SECRET` — **add (owner approval)** when the win-back cron should
   run; harmless to add, only affects the daily job.

## Preview gaps

Preview has zero variables. Populate it from
`hidden_files/staging-preview-env.md` (staging values only) once the
owner approves a preview deployment. Blocked items there: Lemon Squeezy
test-mode keys, a Resend test key, and an OpenRouter key for preview —
none of those may be invented or copied from Production.
