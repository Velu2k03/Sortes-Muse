# Credit cutover audit, 2026-11-20

Branch `sortes-credit-cutover-prep-2026-11-20`, base `8e56662` (PR #173 merge).
Governing doc: `docs/CREDIT-CUTOVER-RUNBOOK.md`.

**Scope of this PR:** conversion runner, census script, tests, and this
audit. `CREDIT_COSTS_ENABLED` (`src/lib/subscription-tiers.ts:75`) is
`false` and stays `false`. No user-visible copy changed. Nothing ran
against production. No email sent. Lemon Squeezy not touched.

## 1. Runner and census

| Tool | Location | What it does |
|---|---|---|
| Conversion runner | `scripts/convert-oracles.mjs` | Calls the existing `convertOraclesToCredits` (`src/lib/db/ledgers.ts:578`) once per holder. It has no conversion SQL of its own. |
| Census | `scripts/census-oracles.mjs` | Read-only (READ ONLY transaction). Lists holders and totals. |
| Tests | `src/lib/__tests__/convert-oracles-runner.test.ts` | 9 end-to-end tests that run both scripts as child processes against real Postgres. |

### Runner usage

```
POSTGRES_URL=postgres://... node scripts/convert-oracles.mjs --flag-flipped-at 2026-11-21T03:00:00Z --dry-run
POSTGRES_URL=postgres://... node scripts/convert-oracles.mjs --flag-flipped-at 2026-11-21T03:00:00Z --live
```

- `--flag-flipped-at` is required. It must be ISO 8601 with an explicit
  zone (`Z` or `+hh:mm`) and must not be in the future. A future time
  would turn off the post-flag purchase guard, because every purchase
  would count as "before the flip". If it is missing or invalid, the
  runner prints usage to stderr and exits 2 before it connects to the
  database.
- Exactly one of `--dry-run` / `--live`.
- **Population:** every user with `purchased_credits > 0`, the same
  population the census counts.
- **Dry run:** a read-only transaction. It lists `wouldConvert[]` (id,
  email, oracles, credits) and `alreadyConvertedUsers[]`, and changes
  nothing. Refusals are NOT predicted. The guard in
  `convertOraclesToCredits` decides them at `--live` time, and the
  runner does not copy that guard's SQL.
- **Live:** `converted[]`, `alreadyConvertedUsers[]`, `refused[]` (id,
  email, oracles, refuseReason), and `errors[]`, plus the totals
  `usersConverted`, `alreadyConverted`, `refusedCount`, `errorCount`,
  `totalOracles`, `totalCredits` (totals cover this run's conversions
  only).
- **stdout** carries the JSON only. **stderr** carries a one-line
  summary plus one line per refused user or error. `console.log` is
  routed to stderr because the app pool prints Postgres NOTICEs through
  it.
- **Exit codes:** 0 when every holder converted, was already converted,
  or was refused. 1 when any holder errored (the run continues past
  per-user errors). 2 for usage, environment, or safety refusals.
- **Idempotent:** a second `--live` converts 0, and the converted
  users report `alreadyConverted`.
- **Refused users are never converted by any re-run.** The guard
  refuses them every time. `refused[]` is the manual-handling list the
  runbook requires.

### Runner safety rails

1. A production-looking URL (`NODE_ENV=production`, `*.supabase.co`,
   `pooler.supabase.com`, the same test as `scripts/reconcile.mjs`) is
   refused unless `SORTES_CONVERT_PRODUCTION=1`.
2. Against production the runner sets `NODE_ENV=production` before the
   db layer loads, so `ensureSchema()` only **verifies** migrations
   (`src/lib/migrations.ts:104-122`) and never applies one. Without
   this, a plain `node` run with no `NODE_ENV` would auto-apply any
   pending migration to production.
3. `--live` is refused while `CREDIT_COSTS_ENABLED` is `false` in the
   checkout it runs from (runbook: converting before the flag flips
   would leak). Local test databases can override this with
   `SORTES_CONVERT_ALLOW_FLAG_OFF=1`. The override is refused on a
   production-looking URL.
4. The runner requires `POSTGRES_URL` or `DATABASE_URL`, so it never
   falls back to the local JSON store. It refuses when both are set to
   different values.

### How the .mjs loads the TypeScript db layer

The repo already runs TS from scripts with Node 24 type stripping
(`scripts/charts-check.mjs` imports `../src/lib/*.ts`). The db layer
uses extensionless relative imports (`"./client"`), which Node's ESM
resolver does not complete. So the runner registers a small
`module.registerHooks` resolve hook: for a relative, extensionless
import made from a `.ts` file, it tries `<spec>.ts`. No new dependency
(no tsx/jiti), no package.json change. Node prints a harmless
`MODULE_TYPELESS_PACKAGE_JSON` warning on stderr. `--no-warnings`
silences it.

### Census usage and output shape

```
POSTGRES_URL=postgres://... node scripts/census-oracles.mjs
```

Production needs `SORTES_CENSUS_PRODUCTION=1`. The output contains
emails, so treat it as personal data.

```json
{
  "database": "host:port/db",
  "takenAt": "ISO timestamp",
  "holders": 3,
  "unconvertedHolders": 3,
  "totalOracles": 24,
  "totalCreditsAfterConversion": 7200,
  "totalMonthlyCredits": 0,
  "usersWithMonthlyCredits": 0,
  "alreadyConverted": 0,
  "alreadyConvertedCredits": 0,
  "warnings": [],
  "users": [{ "id": "...", "email": "...", "purchased_credits": 7, "monthly_credits": 0, "converted": false }]
}
```

`holders` is every user with `purchased_credits > 0`. `totalOracles`
(and `totalCreditsAfterConversion = totalOracles x 300`) counts only
the `unconvertedHolders`. A holder that already has a `conversion`
grant is flagged `converted: true`, counted in `alreadyConverted`, and
its balance is summed into `alreadyConvertedCredits` (credits, not
Oracles), so a census taken after a partial conversion still gives the
remaining Oracle total.

Exit 0 means clean. Exit 1 means the census was taken but a
pre-cutover invariant is broken: `monthly_credits` total is not 0, or a
holder already has a `conversion` grant. Exit 2 means usage, safety, or
query failure. The census's `ORACLE_TO_CREDITS = 300` is pinned to the
app constant by a test.

## 2. Test evidence (precondition 8)

All of this ran on the local Postgres 16 on the agent VM. Nothing ran
against production.

**Automated suite** (`convert-oracles-runner.test.ts`, its own fresh
database `sortes_pgtest_convert`, 9/9 passed). It uses its own database
because the runner converts every holder in its target DB, and
`db-credit-ledgers.test.ts` seeds holders in the ledgers DB in
parallel. Seed and results:

| User | Seed | Expected | Result |
|---|---|---|---|
| A | 7 Oracles, no purchase row | converts 7 to 2,100 purchased, monthly 0, 1 `conversion` grant (2,100), 1 `oracle-conversion` tx (readings 2,100, amount 0) | pass |
| B | 5 Oracles + Spark monthly grant (1,000) | refused "monthly", stays 1,000 / 5 | pass |
| C | pack5 bought now (after flip `2026-01-01Z`) | refused "purchase after the flag flip", stays 5 | pass |
| D | pack12 backdated to 2025-06-01 (before flip) | converts 12 to 3,600 | pass |
| Z | 0 balance | not in population, untouched | pass |

Also covered:
- Census shape and totals: 3 holders, 24 Oracles, 7,200 credits.
  After B is added: exit 1 with the monthly warning.
- 10 bad invocations all exit 2 with empty stdout, and nothing is
  converted: no flip time, flag with no value, `yesterday`, date only,
  no zone, impossible date, a future flip, an unknown argument, no
  mode, both modes.
- The flag-OFF refusal without the override.
- The production-URL refusals for both scripts, plus the override being
  refused on a production URL. These exit before connecting; the host is
  a fake `example-ref` name.
- Dry run: lists 4 would-convert (29 Oracles, 8,700 credits) and
  changes nothing.
- Live run: 2 converted (19 Oracles, 5,700 credits), 2 refused, 0
  errors.
- Second live run: 0 converted, 2 already converted, 2 refused,
  balances and row counts unchanged.
- **Post-conversion purchase + refund nets to zero:** user A (2,100)
  buys `topup-1000` through `fulfillOrder` with `grantUnit: "credits"`
  (the webhook's top-up call shape), which brings A to 3,100. A full
  refund through `revokeOrder(orderId, email, 999)` returns
  `{revoked: true, readings: 1000}` and A is back to 2,100. A
  redelivered refund revokes nothing. A third runner run converts 0.
  This uses the real refund path (`revokeOrder`), not the
  subscription-refund path.

**Manual run on `sortes_pgtest_ledgers`** (`127.0.0.1:5432`). Seeded
users: `holder1` 3, `holder2` 10, `preflag` 12 (pack on 2026-11-10),
`postflag` 5 (pack on 2026-11-20T02:00Z), `monthly` 4 + monthly 1,000,
`zero` 0. Flip time `2026-11-20T01:00:00Z`.

| Step | Result |
|---|---|
| census | 5 holders, 34 Oracles (10,200 credits), monthly total 1,000, exit 1 with warning (expected, the seed includes a monthly grant) |
| `--dry-run` | 5 would convert, 34 Oracles to 10,200 credits, exit 0, nothing changed |
| `--live` (flag-OFF override) | 3 converted (holder1 900, holder2 3,000, preflag 3,600 = 25 Oracles, 7,500 credits); 2 refused (postflag: "purchase after the flag flip", monthly: "monthly (subscription) grant"); 0 errors; exit 0 |
| `--live` again | 0 converted, 3 already converted, 2 refused, totals 0, exit 0 |
| `--live` without the override | exit 2, "CREDIT_COSTS_ENABLED is false in this checkout" |
| no `--flag-flipped-at` | exit 2, usage |

## 3. Per-site audit: what the flag flip changes

| Site (file:line) | Today (flag OFF) | Flag ON | Edit needed at flip? |
|---|---|---|---|
| `src/app/pricing/page.tsx:61-62` subscription + top-up buttons | `subscriptionsConfigured() && CREDIT_COSTS_ENABLED` → disabled | enabled once LS variants are configured | No, flag-handled |
| `src/app/oracles/page.tsx:42` top-up buttons | `topUpsConfigured() && CREDIT_COSTS_ENABLED` → "Not yet open" | enabled once configured | No, flag-handled |
| `src/lib/credit-precheck.ts:29-32` 402 message unit | "1 Oracle" / "No Oracle was spent" | "N credits" / "No credits were spent" | No, flag-handled |
| `src/lib/db/orders.ts:92-95` `grantedCreditsForOrder` | pack readings as-is | pack readings x 300 when `grantUnit` is `"oracles"` | No, but see the next row |
| `src/app/api/webhooks/lemonsqueezy/route.ts:296,306` pack `grantUnit` | `"oracles"` → pack5 grants 5 Oracles | **`"credits"` → pack5 grants 5 credits for $3.99**, not 1,500 | **YES, defect** (see §5) |
| `src/app/api/webhooks/lemonsqueezy/route.ts:296` top-up `grantUnit` | `"credits"` | `"credits"` | No |
| `src/app/api/checkout/lemonsqueezy/route.ts:29` pack checkout | accepts pack5/12/30 (unlinked from UI) | still accepts packs | **YES** (precondition 4, see §5) |
| `src/app/api/reading/generate/route.ts:498` 402 in-transaction | "You need 1 Oracle for this reading. No Oracle was spent." | same hardcoded text even though the cost is 100/200 credits | YES, copy |
| `src/app/api/reading/generate/route.ts:322,426,489` 503/500/409 | "No Oracle was spent." | same | YES, copy |
| `src/app/api/reading/follow-up/route.ts:406` (+272, 348) | "You need 1 Oracle..." / "No Oracle was spent." | same | YES, copy |
| `src/app/api/chart/interpret/route.ts:383` (+297, 340, 377) | "You need 1 Oracle..." | same | YES, copy |
| `src/app/api/reports/generate/route.ts:246` (+156, 202, 240) | "You need 1 Oracle..." | same | YES, copy |
| `src/app/charts/ChartSections.tsx:64, 763, 817, 825` | "then 1 Oracle", "Get interpretation (1 Oracle)", "1 Oracle interpretation" | wrong: a chart costs 300 credits | YES, copy |
| `src/app/oracles/CreditsClient.tsx:65, 78, 94, 101-103, 124, 150` | "Oracles", "1 Oracle = 1 full reading.", "{readings} Oracles" | wrong unit | YES, copy |
| `src/components/PricingClient.tsx:385, 462, 502, 555, 569, 578` | "Oracles a month", "1,000 Oracles for $9.99", "Top up N Oracles" | these numbers are already credit amounts, labelled Oracles | YES, copy |
| `src/components/Header.tsx:357-360, 380-381, 471` | "Oracle balance: N Oracles", "Get Oracles" | wrong unit | YES, copy |
| `src/app/account/AccountPanels.tsx:63, 76, 109, 168, 175, 339` | "Oracle balance", "Get Oracles", "Monthly Oracles", "Purchased Oracles" | wrong unit | YES, copy |
| `src/app/account/AccountClient.tsx:341-342, 500` | "guest Oracles", "Bought Oracles with a different email?" | wrong unit | YES, copy |
| `src/app/faq/page.tsx:10, 12, 17-34, 55, 58-60, 68-80, 93-95` | "One Oracle opens one full reading...", the five Oracle rules, "1 Oracle" | wrong costs and wrong unit | YES, copy and content (the five rules become a cost table) |

## 4. Hardcoded "Oracle" copy catalogue and rename recommendation

### Catalogue (verified by `git grep -n -i oracle` on 8e56662)

The brief's list (finding 4) is accurate on every line it names. It is
not complete. Extra user-visible sites found:
`ChartSections.tsx:64, 825`; `CreditsClient.tsx:65, 78, 94, 102-103`;
`Header.tsx:357, 471`; `AccountPanels.tsx:339`; `faq/page.tsx:10, 12,
17, 22-23, 27-28, 55, 58-59, 68, 73-74, 78-80, 93-95`; and every
"No Oracle was spent" string in the four API routes (listed in §3).

62 files under `src/` (tests excluded) mention "oracle" in some form.
Many are comments, identifiers (`preCheckOracleBalance`), or the
`/oracles` route path. The flip PR must still triage each one for
user-visible strings:

```
src/app/account/{AccountClient.tsx,AccountPanels.tsx,page.tsx}
src/app/api/{account/export,auth/me,chart/interpret,checkout/lemonsqueezy,checkout/subscription,credits/balance,reading/follow-up,reading/generate,reports/generate,webhooks/lemonsqueezy}/route.ts
src/app/charts/{ChartSections.tsx,page.tsx,useChartsClient.ts}
src/app/{contact,faq,page,privacy,terms}/page.tsx (and src/app/page.tsx)
src/app/globals.css  src/app/sitemap.ts
src/app/guides/[slug]/page.tsx
src/app/intake/[slug]/{IntakeSteps.tsx,useIntakeFlow.ts}
src/app/journal/HistoryClient.tsx
src/app/oracles/{CreditsClient.tsx,page.tsx}
src/app/pricing/page.tsx
src/app/reading/[id]/{ReadingSections.tsx,useReadingDetail.ts}
src/app/reports/{ReportsClient.tsx,page.tsx}
src/app/spreads/SpreadsClient.tsx
src/components/{AccountDeletedNotice,Counter,FaqList,Footer,Header,InfoHint,PricingClient,PurchaseConfirmer,ReadingFlow,ReturningHome,SampleReading}.tsx
src/lib/{ai,chart-fallback,credit-precheck,db,generate-failure,guides,lemonsqueezy,migrations.generated,sample-report,sse-server,subscription-tiers}.ts
src/lib/db/{credits,ledgers,orders,readings,reports,types}.ts
```

### Decision to record: rename "Oracles" to "credits" in the UI?

**Recommendation: rename the unit to "credits" everywhere it is
displayed, in the flag-flip PR.** Keep the `/oracles` URL (inbound
links, sitemap, SEO). The page heading and copy become "Credits".
Optionally add a `/credits` alias later.

Why:
1. The runbook says "The Oracle unit is gone from the product" after
   the cutover.
2. "Oracle" has taught holders that 1 Oracle = 1 reading. After the
   cutover a reading costs 100-200 units. Keeping the word would make a
   converted holder see "2,100 Oracles" and a "100 Oracle" reading. That
   reads as a 100x price rise, not a unit change.
3. The holder email (precondition 3) has to say "1 Oracle became 300
   credits". The product then has to say "credits" to match.
4. The 402 path already switches to "credits" when the flag is ON
   (`credit-precheck.ts:29`). Keeping "Oracles" elsewhere would show
   both units on one screen.
5. The pricing numbers (1,000 / 2,500 / 6,000 a month; 1,000 / 3,000
   top-ups) are already credit amounts mislabelled as Oracles
   (`PricingClient.tsx:502, 555, 578`).

The other option, keeping "Oracles" as the brand name for a credit, is
coherent only if every number shown is a credit amount AND holders are
told that "Oracle" now means something 300x smaller. This is Velu's
product decision. Nothing is renamed in this PR.

## 5. Findings that need action before or at the flip (not fixed here)

1. **The pack grant under-grants once the flag is ON.**
   `webhooks/lemonsqueezy/route.ts:296` passes
   `grantUnit: CREDIT_COSTS_ENABLED ? "credits" : "oracles"` for packs,
   and `readings` for a pack is the Oracle count (5/12/30,
   `lemonsqueezy.ts:42-47`). With the flag ON, pack5 grants **5
   credits** for $3.99. The x300 branch in `grantedCreditsForOrder`
   (`orders.ts:94`) is never reached from the webhook. This is not a
   leak (it under-grants), and the conversion guard still refuses such
   a buyer. But it is wrong money behaviour for any pack checkout
   completed after the flip. Fix one of two ways in the flip PR: pass
   `"oracles"` for packs (x300), or refuse pack checkouts (next item)
   and treat any late pack webhook as a manual case. Verified by
   reading the code. Not run.
2. **Pack checkout route still live.**
   `src/app/api/checkout/lemonsqueezy/route.ts:29` still creates
   checkouts for pack5/12/30. The UI no longer links to it (packs were
   retired from the UI on 2026-11-16), but any direct POST works. The
   runbook's Verification 6 expects "a pack checkout attempt is
   refused". That is not true today. To do at the flip: return 410/400
   from the pack route when `CREDIT_COSTS_ENABLED`, and archive or
   disable the pack variants in Lemon Squeezy (dashboard, Velu).
3. **The runner does not reconcile against the census by itself.** The
   runbook's abort rule (converted total != census total) is a manual
   comparison: census `totalOracles` = runner `totalOracles` + refused
   Oracles + errored Oracles. A `--expect-oracles N` guard could be
   added later. It is not in this PR.

## 6. Precondition status (runbook §Preconditions)

| # | Precondition | Status | Evidence |
|---|---|---|---|
| 1 | Velu's go-ahead | **YES** | Given by Velu 2026-11-19, confirmed 2026-11-20 (per the task brief). |
| 2 | Production census | **NOT DONE**: script built, not run against production | `scripts/census-oracles.mjs`. Tested on local DBs only (§2). Needs `SORTES_CENSUS_PRODUCTION=1` and Velu's go. |
| 3 | Holders emailed | **NOT DONE** | No holder-email sending code exists in the repo. Needs a draft and Velu's review before any send. |
| 4 | Pack sales stopped | **PARTIAL** | Packs retired from the UI 2026-11-16. The pack checkout route still accepts pack5/12/30 (`checkout/lemonsqueezy/route.ts:29`), and a post-flip pack under-grants (§5.1). Still needed: refuse the pack route when the flag is ON, and disable the pack variants in Lemon Squeezy. |
| 5 | LS live subscription + top-up variants, ids in Vercel env | **UNKNOWN** | Needs a dashboard check. Per the brief, the Batch B brief (`~/workspace/sortes-verify/lemonsqueezy-dashboard-brief-batch-B.md`) was TEST MODE only, and its prices ($7.99/$14.99/$29.99) predate Velu's 2026-11-15 change to $9.99/$19.99/$39.99. Not re-read this session: that folder is outside this session's allowed directories. |
| 6 | Test-mode rehearsal done | **NOT VERIFIED** | Per the brief, no rehearsal report exists in `~/workspace/sortes-verify/`. The rehearsal the Batch B brief describes used the old prices, so it is also UNVERIFIED for the current prices. Not re-checked this session (same access limit). |
| 7 | Fresh production backup immediately before cutover | **OWED AT CUTOVER** | The daily `sortes-backup.yml` runs and succeeds (latest 2026-11-20 01:11 UTC, run 44651776433, per the brief; not re-checked this session). The runbook's immediate pre-cutover backup, plus the artifact download and decrypt check, is still owed at cutover time. |
| 8 | Runner built, reviewed, tested on staging/test DB | **BUILT + TESTED, NOT YET REVIEWED** | §1-2. Includes the post-flag-grant refusals and the post-conversion purchase + refund nets-to-zero case. Tested on local throwaway DBs (`sortes_pgtest_convert`, `sortes_pgtest_ledgers`), not on the Supabase staging project. Needs PR review. |

**Cutover is NOT ready:** preconditions 2, 3, 4, 5, 6, and 7 are open,
and 8 needs review. The findings in §5 belong in the flag-flip PR.
