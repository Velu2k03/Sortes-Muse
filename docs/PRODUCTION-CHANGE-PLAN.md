# Sortes — Production Change Plan (Phase 7, documentation only)

**Status:** NOT APPLIED. Every item below needs Velu's explicit
approval for that specific change. This document records the exact
effect, risk, and rollback of each change so the approval is informed.
Nothing in this document changes production by itself.

**Production baseline (verified live 2026-11-06):** Supabase project
VELU1231's Project, Postgres 17.6.1.166, FREE plan, ~27 MB, ~1 user,
~8 transactions, ~1 reading. Schema has 6 of 8 tables (missing
`free_readings`, `checkout_nonces`). 7 indexes, all PK/unique. No
migration history. RLS disabled on all 7 app tables.

**Common preconditions for every item:** a fresh `pg_dump` of
production taken immediately before the change (see
`docs/BACKUP-RECOVERY.md`), and the dump verified restorable. The
app is deployed from `main`; the release candidate branch is
`sortes-transformation-2026-11-05` at `6381be2` (not yet merged).

---

## 1. Migration 001 — baseline schema (`migrations/001_baseline.sql`)

**Exact effect:** creates the 7 tables the code expects, all
`IF NOT EXISTS`, plus two `ADD COLUMN IF NOT EXISTS` on `users`
(`winback_sent_at`, `password_hash`).

- `users (id TEXT PK, email TEXT UNIQUE NOT NULL, credits INTEGER
  NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  winback_sent_at TIMESTAMPTZ, password_hash TEXT)`
- `auth_codes (email TEXT PK, code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)`
- `transactions (id TEXT PK, user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL, pack_type TEXT NOT NULL, amount NUMERIC NOT NULL,
  readings INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
- `readings (id TEXT PK, user_id TEXT REFERENCES users(id),
  data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
- `reports` — same shape as `readings`.
- `free_interpretations (user_id TEXT NOT NULL REFERENCES users(id),
  system TEXT NOT NULL, used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PK (user_id, system))`
- `free_readings (user_id TEXT NOT NULL REFERENCES users(id),
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PK (user_id))`

**Tables/rows affected:** the 6 existing tables are untouched (a
no-op for them — `IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`).
Exactly one table is created: `free_readings` (0 rows). The
`checkout_nonces` table is intentionally NOT created (claim endpoint
deleted in Phase 6; production never had it).

**Idempotency:** fully idempotent; re-running is a no-op. The runner
records the version in `schema_migrations`.

**What breaks if it goes wrong:** almost nothing can break — the
statements only add a missing empty table and two nullable columns.
Worst case is a transient lock on `users` while the columns are
added (milliseconds on a 1-row table). If the migration failed
halfway, the ledger would not record version 001 and the next run
would retry cleanly.

**Rollback:** drop the created table (`DROP TABLE IF EXISTS
free_readings;`) and drop the two columns only if they did not exist
before (check the pre-change dump first). In practice no rollback is
needed: the change is purely additive.

**Risk: LOW.**

## 2. Migration 002 — indexes, constraints, JSONB repair (`migrations/002_indexes_constraints.sql`)

**Exact effect:**

- 4 secondary indexes (all `IF NOT EXISTS`):
  `idx_readings_user_created` on `readings (user_id, created_at DESC)`,
  `idx_reports_user_created` on `reports (user_id, created_at DESC)`,
  `idx_transactions_user_created` on `transactions (user_id, created_at DESC)`,
  `idx_transactions_pack_type` on `transactions (pack_type)`.
- `CHECK (credits >= 0)` constraint `users_credits_nonnegative` on
  `users` (added inside a DO block that swallows `duplicate_object`,
  so re-running is a no-op).
- JSONB repair loop: every row in `readings`/`reports` whose `data`
  is a JSON string (double-encoded by the old
  `${JSON.stringify(x)}::jsonb` pattern) is re-encoded in place to a
  JSON object. Rows already objects are untouched. A row whose string
  is not valid JSON is skipped with a `RAISE WARNING` (visible in the
  migrate log) instead of failing the migration.

**Tables/rows affected:** indexes touch no rows (build only).
Constraint: checked against existing data at apply time — the app
already clamps with `GREATEST(0, ...)`, so the ~1 user satisfies it;
if any row violated it, the migration would fail loudly rather than
corrupt data. JSONB repair: production has ~1 reading and ~0 reports;
the repair loop is expected to touch 0–1 rows. Each repair is a
lossless re-encoding (same JSON value, correct type).

**Idempotency:** indexes and constraint are no-ops on re-run. The
repair loop is a no-op on re-run (repaired rows are objects, not
strings). Unparseable rows stay skipped with a warning on every run.

**What breaks if it goes wrong:** index creation takes a brief lock
on each table (seconds at most on this size). A failed constraint
add leaves the table unchanged. A failed repair update rolls back
only that row's statement (per-row exception handler), not the whole
migration. The one untested path is the unparseable-row skip (no such
row is known to exist in production; the warning would surface in
the log if one appears).

**Rollback:** `DROP INDEX IF EXISTS` for the four indexes;
`ALTER TABLE users DROP CONSTRAINT IF EXISTS
users_credits_nonnegative;`. The JSONB repair has no inverse and
needs none — the re-encoded value is identical JSON, only stored
with the correct type.

**Risk: LOW.**

## 3. Migration 003 — drop orphan table (`migrations/003_drop_checkout_nonces.sql`)

**Exact effect:** `DROP TABLE IF EXISTS checkout_nonces;`

**Tables/rows affected:** none in production — the table does not
exist there (verified live 2026-11-06). On databases that ran
pre-Phase-6 `ensureSchema` (local dev / staging), it drops an orphan
table nothing references.

**Idempotency:** fully idempotent (`IF EXISTS`).

**What breaks if it goes wrong:** nothing in production (no-op).
If the table existed and held rows, they would be lost — but no code
references the table any more (verified by repo-wide grep) and
production never had it.

**Rollback:** none needed in production. Elsewhere, re-create an
empty table with the old definition (it is not needed by any code).

**Risk: NEGLIGIBLE in production.**

## 4. How migrations 001–003 are applied (procedure, not yet run)

```bash
# 1. pg_dump production first (see docs/BACKUP-RECOVERY.md).
# 2. From the release-candidate checkout, against the PRODUCTION
#    database URL (session pooler, port 5432), with the safety flag:
SORTES_MIGRATE_PRODUCTION=1 \
DATABASE_URL="postgres://postgres.<prod-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" \
  npm run db:migrate
# 3. Verify with the queries in docs/STAGING.md (ledger shows
#    001, 002, 003; 7 tables; 4 secondary indexes; CHECK exists;
#    zero double-encoded JSONB rows).
# 4. pg_dump again after the apply.
```

The migrate CLI refuses a production-looking run without
`SORTES_MIGRATE_PRODUCTION=1`, and the in-app runner no longer
auto-applies pending migrations in production (verify-only). The
database password comes from Secure Vault, never from chat or a
committed file.

## 5. RLS migration 004 — reports + free_interpretations (`migrations/approval-required/004_rls-reports-free-interpretations.sql`)

**Exact effect:** two statements, nothing else:

```sql
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_interpretations ENABLE ROW LEVEL SECURITY;
```

No policies are created (deny-by-default for `anon` and
`authenticated`).

**Tables/rows affected:** 2 tables, ~1 report row, ~0
free_interpretation rows. No rows are modified, only the access
rule changes.

**What it fixes:** Supabase Advisor's 2 CRITICAL issues. Today, with
RLS disabled, any table the `anon`/`authenticated` roles hold a
grant on is readable through the public PostgREST endpoint with the
anon key. Phase 6B proved the exposure on local Postgres: anon
SELECT returned a victim user's report text before the migration
and 0 rows after.

**What breaks if it goes wrong:** nothing for the app — it connects
as the `postgres` role, which bypasses RLS entirely (superuser +
table owner). Verified on local Postgres: the app role still reads
after the migration; anon SELECT returns 0 rows; anon INSERT fails;
authenticated SELECT returns 0 rows. The failure mode to watch is a
future connection change: if the app ever connects as a non-owner,
non-bypass role, it would see 0 rows and break. That change would
need its own test against RLS first.

**Idempotency:** `ENABLE ROW LEVEL SECURITY` is a no-op when already
enabled.

**Rollback:** `ALTER TABLE public.reports DISABLE ROW LEVEL SECURITY;`
and the same for `free_interpretations`. Instant, no data loss.

**Risk: LOW** (given the postgres-role connection; see the caveat
above).

## 6. Remaining RLS-disabled tables — assessment (no migration written yet)

The other five app tables are exposed the same way as the two in
§5 (Supabase grants `anon`/`authenticated` SELECT/INSERT/UPDATE/
DELETE on all public tables by default), but Advisor did not flag
them in the 2026-11-06 check. Each needs the same assessment +
migration before a public launch (owner item B-W). The pattern is
identical to 004: `ENABLE ROW LEVEL SECURITY` with zero policies,
deny-by-default, app (postgres role) unaffected.

| Table | Data it holds | Exposure if left open | Risk of enabling (zero policies) |
|---|---|---|---|
| `users` | id, email, Oracle balance, password_hash, winback timestamp | **Highest.** Email addresses + password hashes readable via PostgREST anon key; balance tampering if anon holds UPDATE. | LOW for the app (postgres role bypasses). Same future-role caveat as §5. |
| `auth_codes` | email, code hash, expiry, attempts | **High.** Code hashes + attempt counts; an attacker could enumerate which emails have live codes. | LOW for the app. |
| `transactions` | order ids, user ids, emails, pack types, amounts | **Medium.** Purchase history + emails readable. | LOW for the app. |
| `readings` | user ids + full reading JSONB | **High.** Private readings readable. | LOW for the app. |
| `free_readings` | user ids + used_at | **Low.** Only user ids + a timestamp. | LOW for the app. |

**Recommendation:** apply the same zero-policy RLS enablement to
all five, as a follow-up migration `005_rls-remaining-tables.sql`,
tested on local Postgres the same way 004 was (anon 0 rows, app
role reads). The one table to treat with extra care is `users`:
because it holds `password_hash`, verify after enabling that the
sign-up/login/delete flows still work end to end on staging before
applying to production.

**Risk if left undone at launch: HIGH** for `users` and
`auth_codes` (credential material), **MEDIUM** for `readings` /
`transactions`, **LOW** for `free_readings`. Risk of enabling:
**LOW** (same mechanics as 004, already proven).

## 7. AUTH_SECRET — production environment variable

**What it is:** the dedicated secret that signs Sortes' own session
cookies. The fallback chain in `src/lib/auth.ts` is
`AUTH_SECRET → NEXTAUTH_SECRET → SUPABASE_JWT_SECRET`. Production
currently has only `SUPABASE_JWT_SECRET` set, so sessions work
today — but that secret also signs Supabase tokens, so sharing it
means a Supabase secret rotation invalidates every Sortes session
and a leak compromises both systems.

**How to generate it (owner or dashboard task, never in chat):**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Where to set it:** Vercel → sortes-muse → Settings →
Environment Variables → Add `AUTH_SECRET`, value = the generated
secret, Environment = **Production only**. Never tick Preview or
Development (Preview has its own staging value already generated in
`hidden_files/staging-preview-env.md`). Do NOT set `DATABASE_URL`
or `NEXTAUTH_SECRET` (aliases; see `docs/ENVIRONMENT.md`).

**What breaks without it:** nothing today — the fallback chain
covers it. Adding it changes one user-visible thing: `secret()` in
`src/lib/auth.ts` picks the FIRST secret present in the chain, and
verification uses that single secret — so sessions signed with
`SUPABASE_JWT_SECRET` stop verifying once `AUTH_SECRET` is set, and
those users are signed out and sign in again. That is the only
effect, and it is acceptable: sessions are 30-day cookies and
re-sign-in is the normal path. Confirm this behaviour in the preview
deployment (sign in before setting the staging `AUTH_SECRET`, then
set it and confirm the old session is rejected) before applying to
production.

**Rotation notes:** rotating `AUTH_SECRET` invalidates sessions
signed with the old value; users simply sign in again. Rotate by
generating a new value and replacing it in Vercel Production, then
redeploying (a redeploy is required for the new value to take
effect). Never rotate `SUPABASE_JWT_SECRET` and `AUTH_SECRET` at
the same time.

**Risk of adding it: LOW.** Risk of never adding it: **MEDIUM**
(key reuse across two systems; a Supabase rotation silently logs
everyone out).

## 8. Approval checklist (one line per decision)

- [ ] Apply migrations 001–003 to production (procedure §4).
- [ ] Apply RLS 004 to production.
- [ ] Write + test + apply RLS 005 for the remaining five tables.
- [ ] Add `AUTH_SECRET` to Vercel Production.
- [ ] Add `RESEND_API_KEY` + `EMAIL_FROM` to Vercel Production
      (only if the Resend code path / deletion-by-code is wanted).
- [ ] Add `CRON_SECRET` to Vercel Production (only if the win-back
      cron should run).
- [ ] Do NOT add `DATABASE_URL` or `NEXTAUTH_SECRET`.
- [ ] Postgres 17.11.0.018 upgrade — separate decision, not part of
      this plan.
