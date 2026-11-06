# Sortes Phase 7 fix pass — agy brief

You are working in the repo at /home/hatch/workspace/sortes, git branch
`sortes-transformation-2026-11-05`, HEAD b637fd1. Work on this branch ONLY.
Do NOT push, merge, or deploy anything. Do NOT touch main. Do NOT touch
anything in Lemon Squeezy live mode, the production Supabase project, or
the production site (sortes.resonantatlas.com). Do NOT print, commit, or
report any secret value (API keys, passwords, tokens); refer to env var
names only. No em dashes in user-facing copy. Apply ub-mode on every
change: Make it Work, then Make it Right, then Practice.

## Context

Phase 7 end-to-end tests on the Vercel preview deployment (commit b637fd1)
found two launch blockers. The owner approved fixing both with FREE models
only. No paid AI models. No price or monetisation changes. Flat 1 Oracle
per reading stays.

House rule (repo AGENTS.md): this Next.js version has breaking changes
vs training data — before writing any code, read the relevant guide in
node_modules/next/dist/docs/ and heed deprecation notices.

## Task A — Fix the AI model chain (src/lib/ai.ts)

The default chain at src/lib/ai.ts line 22 is:
`google/gemini-2.5-flash-preview:free,xiaomi/mimo-v2-flash:free,meta-llama/llama-3.3-70b-instruct:free`

Verified live 2026-11-06 ~23:00 UTC against the official OpenRouter models
list (curl https://openrouter.ai/api/v1/models): ALL THREE are retired and
no longer listed. Only 11 free models remain. Verified LISTED at that time:
- google/gemma-4-26b-a4b-it:free
- google/gemma-4-31b-it:free
- nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
- nvidia/nemotron-3.5-lightning:free

E2E symptom: free Quick Insight generation hung the full 300 s Vercel
function timeout on attempt 1, then 503 "all-models-failed" on attempt 2
(OpenRouter 400 on the Gemini slug, 404 on the other two). The page showed
an honest error and spent no Oracle.

Do:
1. Re-verify each candidate model against
   `curl -s https://openrouter.ai/api/v1/models` BEFORE committing. Do not
   trust memory or this brief's list; the free list changes often. Pick a
   chain of 2-3 free models that are actually listed at commit time,
   preferring instruction-tuned, non-reasoning models suited to long-form
   structured tarot readings (350-550 words, must name drawn cards). A
   sensible starting point is the two Gemma 4 free models plus one more
   listed free model as the third fallback; justify your pick in the
   commit message.
2. Keep the free-chain design from the src/lib/ai.ts header comment: free
   models only, a failing model is skipped and the next is tried with a
   small backoff, failures are logged as structured JSON so a dead model
   is visible in server logs, null is returned when no model produces
   acceptable text.
3. Fix the timeout behaviour. The per-model timeout is AI_TIMEOUT_MS =
   25000, so three models cap at ~76 s including backoff — yet the E2E
   first attempt hung the full 300 s Vercel timeout. A dead model must
   never be able to eat the whole function budget. Make sure the timeout
   bounds the WHOLE per-model attempt including response-body parsing,
   and add a total budget for the whole chain (well inside 300 s) so
   generateChat always returns within it. Log per-model elapsed time in
   the structured failure log so the next failure shows where time went.
   Investigate the 300 s hang: check the reading/generate route's
   pre-generation path (getSession, getUserById, hasUsedFreeReading via
   postgres.js with max:1 against the Supabase pooler) and anything else
   in the route that could block beyond generateChat. Fix a code cause if
   you find one; if no code cause is found, say so explicitly in your
   final summary instead of inventing one.
4. Update every test that asserts the old model slugs
   (src/lib/__tests__/ai.test.ts asserts getModelList()[0] contains
   ":free"; src/app/api/reading/generate/route.test.ts,
   follow-up/route.test.ts, chart/interpret/route.test.ts mock a response
   model of "google/gemini-2.5-flash-preview:free"). Update stale mocked
   model names to the new chain where the test is about the chain; leave
   unrelated mocks alone.

## Task B — Fix the Lemon Squeezy checkout 500

E2E symptom: POST /api/checkout/lemonsqueezy returns 500 three times
("Could not start checkout. Please try again.") for First Light ($3.99,
5 Oracles) and Constellation ($7.99). No order created, no payment
attempted, no webhook fired. The Lemon Squeezy TEST-mode store DOES
contain the three published products (First Light 5 Oracles, Constellation
12, Celestial Treasury 30).

Code: src/app/api/checkout/lemonsqueezy/route.ts calls createCheckout in
src/lib/lemonsqueezy.ts, which POSTs to
https://api.lemonsqueezy.com/v1/checkouts; any throw becomes the generic
500. The route's catch does NOT log anything, and createCheckout throws
only `Lemon Squeezy checkout failed (<status>)` without the response
body — so the exact Lemon Squeezy error is invisible in server logs.

Do:
1. Read createCheckout fully and verify the checkout payload against the
   OFFICIAL Lemon Squeezy API docs for creating a checkout
   (developer.lemonsqueezy.com — fetch the docs, do not guess from
   memory). Fix any payload-shape bug you find (wrong field, wrong
   type, missing required field, wrong relationship shape).
2. Add structured server-side logging of the Lemon Squeezy error: in
   createCheckout, when the API responds non-OK, log the HTTP status
   AND the response body (truncated, server-side only, never returned
   to the client); in the route's catch, log the thrown error the same
   structured-JSON way the AI failures are logged. The client-facing
   message stays the generic one.
3. Check the code for any other config-handling bug: variantIdForPack /
   lemonConfigured env handling, the store id, the redirect URL (uses
   NEXT_PUBLIC_SITE_URL with a production fallback). Do NOT change any
   Vercel env var value — you cannot see them (masked) and paste is
   unreliable there. If the root cause is a wrong env value (e.g. wrong
   variant IDs, wrong store ID, wrong/test key), do NOT guess a value:
   report the exact var name and what it must be, and stop there for
   that item.
4. Read src/app/api/checkout/lemonsqueezy/route.test.ts and update tests
   for any behaviour you change; keep the existing coverage passing.

Note for the final summary (do not fix silently, just record): the
Lemon Squeezy test webhook 149521 still points at an OLD preview URL
(sortes-muse-am6ljrljk-...) and NEXT_PUBLIC_SITE_URL in Preview still
points at that old deployment. Both must be repointed to the current
deployment (sortes-muse-9wn6foxl7-...) or the branch alias before the
E2E re-run. That is a dashboard change for the owner, not a code change.

## Verification (run all of these; all must pass)

Local Postgres is running on this VM with role sortes_test and test DBs
already created. Run:

- Lint: `npm run lint` (must exit 0)
- Full vitest with both PG URLs:
  `SORTES_TEST_DATABASE_URL=postgresql://sortes_test:sortes_test_local@localhost:5432/sortes_pgtest_money SORTES_TEST_DATABASE_URL_MIGRATIONS=postgresql://sortes_test:sortes_test_local@localhost:5432/sortes_pgtest_migrations npm test`
  (expect 210/210; report the exact count and any failure)
- Build: `npm run build` (must exit 0)
- Re-run the OpenRouter models curl at commit time and confirm every
  model in the new chain is listed; paste the check output in your
  final summary.

## Commit

Commit on branch sortes-transformation-2026-11-05 only, with clear
messages (one commit per task, or one per logical change). Do NOT push.
I will QC and push after you.

## Final summary to me

Report: each commit hash and what it changed; the Task A model list
with the OpenRouter verification output; the Task B root cause with the
exact evidence (or the exact env var + what it must be if it is a
config fix); lint/test/build results; and anything that still needs the
preview redeploy or a dashboard change to prove.
