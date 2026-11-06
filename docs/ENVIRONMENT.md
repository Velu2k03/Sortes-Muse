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
| `AUTH_SECRET` | `src/lib/auth.ts:16` (first in fallback chain) | Recommended, **not strictly required** (missing) | Required, staging value (generated, see staging-preview-env.md) | Optional (dev-only secret) | Falls back to `NEXTAUTH_SECRET`, then `SUPABASE_JWT_SECRET`. Production throws only if ALL THREE are missing. Dedicated secret is preferred for key separation: `SUPABASE_JWT_SECRET` also signs Supabase tokens, so sharing it means a Supabase secret rotation invalidates every Sortes session and a leak compromises both systems. |
| `NEXTAUTH_SECRET` | `src/lib/auth.ts:17` (second in fallback chain) | **Not needed** — do NOT add | Not needed | Not needed | Nothing while `SUPABASE_JWT_SECRET` (or `AUTH_SECRET`) is set. Legacy alias only. |
| `SUPABASE_JWT_SECRET` | `src/lib/auth.ts:18,79` (last in fallback chain) | **Required as the fallback** (set) | Not needed if staging `AUTH_SECRET` is set | Optional | Sessions cannot be signed in production unless `AUTH_SECRET` or `NEXTAUTH_SECRET` is set instead. Note: it is NOT used to verify Supabase tokens server-side (that goes through the anon-key client + `getUser`); it only signs Sortes' own session cookies. |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase-browser.ts:16`, `src/lib/supabase-server.ts:11`, `src/app/api/auth/supabase-session/route.ts:33` | **Required** (set) | Required, staging project URL | Optional | Supabase OTP sign-in, magic-link callback, and the Supabase session bridge all return 503 / fall back. The custom Resend code path is the only remaining sign-in route. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same three sites as above | **Required** (set) | Required, staging anon key | Optional | Same as above. Public key by design; safe to expose in browser code. |
| `RESEND_API_KEY` | `src/lib/email.ts:11,53`, `src/app/api/auth/request-code/route.ts:51` | **Conditionally required** (missing) | Blocked (no test key yet) | Optional (codes print to console) | Primary sign-in is unaffected: the account page uses Supabase OTP first in production (8-digit code, Supabase default mail). What breaks without it: (1) the local-dev / non-Supabase email-code path returns 503 in production; (2) **account deletion by code** — the delete panel's "Send me a code" uses `/api/auth/request-code` directly, so a passwordless account in production cannot delete by code (password deletion still works). Add a Resend key (owner approval) or route delete-code through Supabase OTP (a code decision, not yet made). |
| `EMAIL_FROM` | `src/lib/email.ts:20,61` | Optional (missing) | Optional | Optional | Defaults to `Sortes <noreply@sortes.resonantatlas.com>`. Only used when `RESEND_API_KEY` is set. |
| `LEMONSQUEEZY_API_KEY` | `src/lib/lemonsqueezy.ts` (checkout, getOrder) | **Required** (set) | Blocked (needs test-mode key) | Optional | Checkout returns 503 "Checkout not configured". |
| `LEMONSQUEEZY_STORE_ID` | `src/lib/lemonsqueezy.ts`, webhook route store check | **Required** (set) | Blocked (needs test-mode store) | Optional | Checkout 503; webhook refuses every order (store mismatch). |
| `LEMONSQUEEZY_VARIANT_PACK5` / `_PACK12` / `_PACK30` | `src/lib/lemonsqueezy.ts` (variant map, amount checks) | **Required** (set) | Blocked (needs test-mode variants) | Optional | `lemonConfigured()` false → checkout 503; webhook cannot map a variant to readings. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | `src/lib/lemonsqueezy.ts:135` (HMAC verify) | **Required** (set) | Blocked (needs test-mode secret) | Optional | Every webhook returns 401; no credits are ever granted. |
| `LEMONSQUEEZY_API_BASE` | `src/lib/lemonsqueezy.ts:10` (API base override) | **Not needed** — do NOT add | Not needed | Local mock-API only | Overrides the Lemon Squeezy API base URL (used by `getOrder` for webhook verification). Only for local tests against a mock server; never set on Vercel. |
| `SORTES_LOCAL_DEV_CODE` | `src/lib/email.ts:12` (`localDevCodeEnabled`) | **Not needed** - do NOT add | Not needed | Set to `1` locally only | Gates returning the code in the API response for local development (Phase B, R11); the code value is never logged. Without it, the local code path returns 500. Never set on Vercel. |
| `OPENROUTER_API_KEY` | `src/lib/ai.ts` via callers (`reading/generate`, `follow-up`, `chart/interpret`, `reports/generate`) | **Required** (set) | Blocked (needs its own key or a test key) | Optional | AI routes return an honest 503, no model call, no Oracle spent (verified by tests). Chart fallback text still works where it exists. |
| `OPENROUTER_MODEL` | `src/lib/ai.ts:28` | Optional (unset) | Optional | Optional | Defaults to the free chain `nvidia/nemotron-3-ultra-550b-a55b:free, xingchen-agi/xing4.0-29b-a4b:free, openrouter/free`. |
| `CRON_SECRET` | `src/app/api/cron/winback/route.ts:13` | Required for the cron (missing) | Not needed | Not needed | `/api/cron/winback` returns 500 "CRON_SECRET is not configured". Only the daily win-back email job is affected (Vercel Cron, `vercel.json`, 02:00 UTC). No impact on sign-in, readings, or payments. |
| `NEXT_PUBLIC_SITE_URL` | `src/lib/email.ts:53`, `src/lib/lemonsqueezy.ts` (redirect URL) | Optional (unset) | Optional | Optional | Defaults to `https://sortes.resonantatlas.com` in both places. Set it only if Preview/staging must redirect somewhere else. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `src/app/layout.tsx:89` | Optional (unset) | Optional | Optional | Analytics only; nothing breaks without it. |

## Script-only variables (not read by the app)

| Variable | Where used | Notes |
|---|---|---|
| `SORTES_MIGRATE_PRODUCTION` | `scripts/migrate.mjs` | Safety flag: the migrate script refuses a production-looking URL unless this is `1`. Never set it in Vercel. |
| `SORTES_RECONCILE_PRODUCTION` | `scripts/reconcile.mjs` | Same pattern for the reconcile script. |
| `SORTES_TEST_DATABASE_URL` / `SORTES_TEST_DATABASE_URL_MIGRATIONS` | `src/lib/__tests__/db-postgres.test.ts`, `migrations-pg.test.ts` | Local test-only. Point at the local staging databases, never production. |
| `SORTES_TEST_DATABASE_URL_RLS` | `src/lib/__tests__/rls-005.test.ts` | Local test-only. RLS 005 tests against the dedicated `sortes_pgtest_rls` database; requires the one-time `anon` / `authenticated` role setup (see `docs/STAGING.md`). |

## Production gaps, resolved

1. `DATABASE_URL` — **do not add**. `POSTGRES_URL` is set and is the
   only database variable the app needs.
2. `NEXTAUTH_SECRET` — **do not add**. Legacy alias; `SUPABASE_JWT_SECRET`
   already covers the fallback chain.
3. `AUTH_SECRET` — **add (owner approval)**. Not strictly required, but
   the correct dedicated session secret; removes the key-reuse with
   Supabase and survives a Supabase secret rotation.
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
