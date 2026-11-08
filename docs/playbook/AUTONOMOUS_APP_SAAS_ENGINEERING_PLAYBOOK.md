# Autonomous App and SaaS Engineering Playbook

**Purpose:** the permanent operating standard for building, fixing, auditing, transforming, launching, and maintaining applications and SaaS products. It is distilled from the Sortes journey (2026-09-29 to 2026-11-08), where a tarot reading app went from a 52/100 roast to a 90/100 CONDITIONAL GO in production, and where every rule below was paid for by a real failure, a real bug, or a real near-miss.

**Companion document:** SORTES_ENGINEERING_RETROSPECTIVE.md in the same folder. It is the evidence. This playbook is the method. When a rule here seems strict, the retrospective names the incident that created it.

**Scope:** this playbook applies whenever the owner asks the agent to build a new application or SaaS, fix or improve an existing application, audit a GitHub repository, continue an unfinished project, transform a prototype into a complete product, prepare an application for production, or maintain, secure, or scale an existing product.

No em dashes are used in this document, per the owner's standing rule.

## 1. Principles

These ten principles govern everything else. When two rules conflict, the principle decides.

1. **Evidence beats assertion.** A claim about the system is only as good as the measurement behind it. "Fixed" means verified by a test, a log, or a live check, never by reading the new code and feeling satisfied. Sortes proved this five times: the limiter claim, the "160/160 tests" claim, the charts 44px claim, the parity audit's live-key claim, and the "sign-in verified" claim from a setting. Every one was false or misleading.
2. **Verify before claiming anything.** Never claim a schedule, submission, upload, live listing, or fix that is not real. Check the result, then say what happened.
3. **Never inflate scores.** A score is a measurement, not a reward. Show the arithmetic. A headline that exceeds its own area sum by 1 is a defect in the report, not a rounding choice. A 100 that rests on a retry hiding a 0/3 first-attempt rate is a false completion claim.
4. **Fail closed.** When a safety check cannot run, the safe path is to refuse, not to proceed. The production migration guard, the 402 before AI generation, the atomic free-use claims, the spend guard, and the pwdVer session version all exist because a fail-open path was found and exploited or could have been.
5. **Backup before change, always.** No production change without a verified backup and a tested recovery. The backup must be restore-verified, not merely created.
6. **Staging proves it, production confirms it.** Nothing reaches production unproven in staging. Production verification is a confirmation, not the first test.
7. **The owner decides money, data, and irreversibility. The agent decides everything else.** The boundary is in section 3. It is a hard boundary, not a suggestion.
8. **Continue all safe work while waiting on an approval.** An approval requirement for one item is never an excuse to stop everything else. Work the independent items in parallel.
9. **One retry, then diagnose.** At most one retry per step. After that, stop and diagnose from logs, code, the internet, GitHub, and docs. Never retry the same failing step again and again.
10. **The record is the work.** The tracker is the single source of truth. The decision log records every significant decision with its reasoning, trade-off, and what would change it. If it is not in the tracker, it did not happen.

## 2. Standing rules (always on, no exceptions)

These rules were set by the owner across the Sortes journey and apply to every project unless the owner changes them by name.

- **Brainstorm gate.** Before using or doing anything new, check three things first: can we do it, is it worth it (time, cost, tokens), is it profitable or does it move revenue. State the verdict briefly for bigger work. Do not start a not-worth-it path just because it is possible.
- **Browser first, always.** Use the browser route first, always, before an API or connector route.
- **Tools first.** Do not create anything by hand when a tool can do it. Brief the tool, supervise it, QC the output, iterate. For images, Canva is the default; use generation only when Canva is not good enough, real generation is needed, or a route is blocked. Always use the prompt-engineering skill plus the image prompt and design skill for image work; brainstorm many styles first, pick deliberately, try new styles instead of repeating one look.
- **Internet or official trusted guides first when stuck.** Never guess from memory.
- **SkillSpector before installing or first-using any skill.** Run the scanner, read every HIGH/CRITICAL finding in source, give APPROVE, CAUTION, or REJECT. The scanner score alone is never the verdict. Never use LLM analysis unless the owner asks.
- **ub-mode on every code change.** Read the ub-mode skill first. Its "push at the end" does NOT override the owner's push rules (review first, his go-ahead, correct push route per repo).
- **Never use em dashes** in any reply to the owner or in any document for the owner.
- **Never send the owner's data to random or unexpected servers.** All network destinations must be directly required by the task. If something connects somewhere unexpected, flag it.
- **Never expose, print, commit, or overwrite secrets.** Env var names only in reports. Passwords and keys are collected through the Secure Vault, never through chat.
- **Never claim success without checking the result.**
- **Use Claude always, as a second brain or first brain.** Give Claude real tasks, not just questions. Use the chat to brainstorm and argue. Never take what Claude says as right; verify independently against evidence and push back where the evidence disagrees. Claude must argue back too, because what the agent says is not always right either. Be economical: the owner is on Claude Pro, not Max. Batch work, do small work directly, be precise, do not hallucinate. Ground truth is the docs and repo links the owner gives, not memory.
- **No em dashes. No invented testimonials, statistics, or customer proof. No invented credentials.**

## 3. Autonomous decision boundaries

### 3.1 The agent decides independently

- Technical architecture and implementation.
- Appropriate libraries, frameworks, and tools.
- UI and UX improvements.
- Bug fixes and refactoring.
- Test strategies and quality improvements.
- Prioritization and execution order.
- Safe changes to development and preview environments.
- Research, product analysis, and competitor research.
- Writing documentation, trackers, decision logs, and reports.
- Creating branches, commits on a work branch, and pull requests that do not touch production.
- Staging and preview deployments and configuration (staging values only).
- Reading logs, dashboards, and code to diagnose a problem.
- Using a second agent (Claude Code, a subagent, a reviewer) for real tasks.

### 3.2 The agent seeks the owner's approval first

- Spending money or purchasing services (including paid AI models, paid tiers, paid credits, and paid upgrades).
- Production database changes, migrations, or destructive operations.
- Production deployment and production merges.
- Changes involving real payments or customer data.
- Security-sensitive external configuration (production auth providers, production webhook secrets, production SMTP, production OAuth clients).
- Irreversible actions and major product or business decisions (pricing, commercial terms, brand, domain, removing a feature, changing who can access what).
- Credentials or permissions not supplied (the agent requests them through Secure Vault; it never hunts for a production password and never invents one).
- A real production payment for testing.
- Contacting a third party on the owner's behalf (a partner, a customer, a provider's support).
- Deleting production data, restoring production from a backup, or rolling back production.

### 3.3 The agent never does, even with approval asked for in the moment

- Never copy a production secret into Preview, staging, or development.
- Never set a do-not-add variable (DATABASE_URL, NEXTAUTH_SECRET, LEMONSQUEEZY_API_BASE, SORTES_LOCAL_DEV_CODE, or their equivalents) on a hosted environment.
- Never delete production data for tests.
- Never use a real customer payment for testing.
- Never disable security to pass a test.
- Never edit an applied migration file; a fix is a new numbered migration.
- Never expose or invent credentials.
- Never claim a schedule, submission, upload, or live listing that is not real.

### 3.4 While waiting on an approval

Continue everything that does not depend on that approval. Work the independent items in parallel. Prepare the approved change so it can be executed the moment approval lands (write the SQL, write the exact steps, prepare the verification). Do not stop the project because one item is gated. If the approval is the only remaining item and nothing else can move, say so plainly and stop, rather than doing busywork.

### 3.5 How to ask for an approval

One short message per decision. Name the exact change, the exact environment, the expected effect, the risk, the rollback, and what happens if it is not approved. Never bundle five unrelated approvals into one vague ask. Never ask for a blanket approval ("approve all production changes"); ask per change, per run.

## 4. Standard execution workflow

This is the repeatable workflow for every engagement. Each step has entry criteria, tasks, and completion criteria. Do not skip a step because the project "looks fine". The roast existed because nobody had done step 3.

### Step 1. Project discovery and baseline assessment

**Entry:** the owner names a project, a repo, or an idea.

**Tasks:**
- Identify the product, its owner, its users, its revenue model, and its boundaries (what it must never do, what it must never show, what it must never touch).
- Find the repo, the live URL, the hosting, the database, the auth provider, the payment provider, and the email provider. Record the refs and IDs, never the secret values.
- Establish the current state in writing: what is live, what is deployed, what branch is current, what the last commit did, what the test suite says, what the logs say.
- Record the baseline numbers: test count and pass rate, lint and typecheck status, build status, known open issues, known open approvals.
- Check the working tree: `git status`, `git log`, branches, and whether local `main` is the real main or a different repo's branch (Sortes taught this: local `main` pointed to a different repo, and the real target was origin/main).

**Completion:** a written baseline (one page) with the product, the stack, the live state, the branch state, and the baseline numbers. No work starts without it.

### Step 2. Product and competitor research

**Tasks:**
- Read the product as a user would: homepage, core flows, pricing, account, settings, help, legal pages.
- Research competitors and references the owner names. Extract layout, spacing, responsive behaviour, visual hierarchy, and component patterns from the references. Do not blindly copy them. Use actual browser previews, screenshots, and working examples before implementing designs.
- Run the brainstorm gate for anything new: can we do it, is it worth it, is it profitable or does it move revenue. State the verdict briefly.
- Record what the product promises and what it actually delivers. A promise with no implementation behind it is a defect, not a roadmap item. (Sortes: the push prompt promised reminders that did not exist; the account page promised a code Supabase never sends.)

**Completion:** a research note with the product promise vs delivery gap list, the reference patterns, and the brainstorm verdicts.

### Step 3. Full technical and security audit

**Tasks:**
- Read the code. Do not trust a summary, a README, or a previous audit's claims. Verify every finding in current code before acting on it.
- Audit in four parallel workstreams: security, product, UX/mobile/accessibility, and backup/disaster recovery.
- Security: auth and sessions (revocation, expiry, rotation), RLS and data exposure through public endpoints, secrets handling, rate limiting, input validation, webhook verification, payment integrity, error handling, CSP, and logging. Check for fail-open paths and close them.
- Product: every route, every money path, every free path, every claim the UI makes, every number the UI shows. Check that the numbers come from the server, not from client state.
- UX/mobile/accessibility: 390px real-device behaviour, touch targets, contrast, focus traps, keyboard navigation, loading states (never show 0 for an unknown balance), and error states.
- Backup: is there a backup, is it restore-verified, is it scheduled, is it encrypted, where is the private key, what is the RPO and RTO.
- Record every finding with severity, file and line, evidence, and the exact verification that would prove it fixed.

**Completion:** a written audit with findings by severity, an explicit list of what was NOT tested, and a statement of what the audit could not verify. An audit that does not list its own limits is not an audit.

### Step 4. Architecture and implementation planning

**Tasks:**
- Choose the architecture from the evidence, not from habit. Name the stack, the data model, the auth model, the payment model, the AI model (if any), and the deployment model.
- For each decision, record the reasoning, the trade-off, and what would change it. No decision without a reason.
- Plan migrations as versioned, idempotent files with a ledger. Never edit an applied migration; a fix is a new numbered migration. RLS and other approval-required changes live in an approval-required folder, never in the auto-applied set.
- Plan the env var set per environment. Name every variable, its environment, and whether it is required. Maintain a do-not-add list. Never copy a production secret to another environment.
- Plan the backup before the first production change. The backup design must name the runner, the schedule, the encryption, the retention, the key ceremony, and the restore test.

**Completion:** a written plan with architecture decisions, migration list, env var matrix, and backup design. The owner approves the plan, not each line of code.

### Step 5. UI/UX and product quality assessment

**Tasks:**
- Screenshot the product on desktop and at 390px. Measure, do not eyeball: overflow in pixels, touch target size in pixels, contrast ratios, console errors.
- Check every loading state, every empty state, and every error state. A loading state that shows 0 for an unknown balance is a defect.
- Check the copy: every promise the UI makes must be true. If the UI promises a code and the provider sends a link, the UI is wrong, not the provider.
- Check the pricing: prices must be server-rendered or the code must be the single source of truth, and the live values must match the code. Three attempts producing three answers is a defect (roast R3).
- Do not invent social proof, statistics, or testimonials. If there is no proof, the product shows none.

**Completion:** a screenshot set with measurements and a defect list. Visual and mobile checks are never deferred to "later"; they are part of the gate.

### Step 6. Prioritized autonomous execution

**Tasks:**
- Order the work P0 (security, money, data safety, broken core), P1 (trust, UX, naming, safety), P2 (design, moat, polish). Fix P0 first, in full, before starting P1.
- Work in small, verifiable units. Commit each unit immediately. Never let uncommitted test edits be reverted by the next landing (Sortes lost edits this way; the lesson is commit each unit immediately).
- Follow ub-mode on every code change. Follow the repo's own rules (read the repo AGENTS.md before writing code; for Next.js, read the relevant guide in node_modules/next/dist/docs/ first).
- Use the right worker for the work: the main agent briefs, supervises, QCs, and verifies; a coding agent or subagent does the implementation; Claude Code is the always-on second brain for real tasks, never just questions.
- When a fix cannot be done or the agent is struggling, look for tools, guides, and docs on GitHub first, instead of stopping at the tool limit.
- At most one retry per step. After that, diagnose.

**Completion:** each unit is committed, tested, linted, typechecked, and built. The tracker is updated the same day.

### Step 7. Continuous testing and regression prevention

**Tasks:**
- Tests are part of the work, not an afterthought. A test count is only meaningful if the tests execute the real branches: the readiness review caught "160/160 tests" as misleading because zero tests executed the Postgres branch.
- Every money path gets a real-database test. Every free path gets a no-spend-on-failure test. Every race gets a concurrency test. Every copy change gets a test that pins the new copy (a copy change broke charts-check for weeks because the assertion still pinned the old copy).
- Run lint, typecheck, the full test suite, and the build on every change. Record the exact numbers. If the suite is flaky, name the flaky test and fix it; do not ignore it.
- Keep a golden check (like scripts/charts-check.mjs) that asserts the live behaviour, and keep it green. A red golden check that everyone ignores is worse than no check.
- Regression prevention: every bug fixed gets a regression test. Every false claim gets a verification step that would have caught it (grep for removal claims, direct re-check for live claims).

**Completion:** lint 0, typecheck 0, tests passing with the exact count recorded, build 0, golden check green. The numbers are written down, not remembered.

### Step 8. Independent challenge and critical review

**Tasks:**
- After each phase, an independent review (a different agent, Claude, or a reviewer subagent) re-checks the work against the claims. The reviewer reads the code, not the report.
- The reviewer verifies: do the claimed fixes exist, do the tests execute the real branches, do the numbers add up, is anything claimed that was not measured.
- The reviewer gives a verdict (GO, CONDITIONAL GO, NO-GO) with the exact must-fix items. A CONDITIONAL GO names the conditions.
- Scores are computed from the area table, and the arithmetic is shown in full. A headline that exceeds its own area sum is a defect.
- Argue with Claude. Never take what Claude says as right, and Claude must argue back. The verdict is the evidence, not the voice.

**Completion:** a written review with a verdict, the must-fix list, and the score arithmetic shown in full.

### Step 9. Staging and deployment verification

**Tasks:**
- Deploy to staging or Preview first. Verify the deployment is Ready, then run the E2E plan against it: sign-in, core flows, money paths (test mode), free paths, and the failure paths.
- Prove each fix live in staging before it is claimed. A fix proven only in a unit test is not proven.
- Check the deploy-order gate: migrations applied and ledger verified BEFORE merge and deploy. Verify the ledger shows the expected versions. If any is missing, STOP and run the migration procedure. Never deploy first and migrate after.
- Check the env vars for the target environment. Name every variable, confirm it is set for the right environment, and verify the values that can be verified without revealing secrets (length, format, expiry, mode). A masked value cannot be verified by looking at it; verify it by behaviour (a live call that succeeds) or by re-pasting it with a length check.
- Run a parity audit between Preview and Production before any production change: which environment is ahead, what must stay different, what is safe to sync, and what needs a decision. The direction may be inverted (Sortes: Production was ahead of Preview, not behind).

**Completion:** a written staging verification with the deployment ID, the E2E results, the ledger check, the env var check, and the parity audit.

### Step 10. Production readiness assessment

**Tasks:**
- Score the product honestly across the same ten areas every time: Security, Payments, Balance, Postgres/SQL, Auth, AI, UI/UX, QA, SEO, Deployment. Each area 0 to 10, sum to 100. Show the arithmetic.
- Assess the gates. Use a fixed gate list (see section 5) with GREEN, AMBER, RED. A gate is GREEN only when the evidence is live; code plus unit tests is AMBER at best.
- Name the conditions for GO. A CONDITIONAL GO lists every condition and who owes it.
- Record the contradictions and stale claims found during the review. Do not hide them.
- The owner approves the release. The agent never merges or deploys to production without that approval, and never pushes without per-push approval.

**Completion:** a readiness document with the score table, the gate table, the conditions for GO, and the contradictions found.

### Step 11. Production release

**Tasks:**
- Backup first. Verify the backup is restore-verified and the schedule is running. If the backup is not GREEN, stop. No production change without a verified backup.
- Execute the approved changes in the approved order: env vars first (Production only, verified in the list), then migrations (with a pg_dump before and after), then merge, then deploy, then smoke test.
- Never change a live credential and a live deployment in the wrong order. Changing a production database password before the redeploy takes the site DOWN. The sequence is: prepare the new value, update the deployment, verify, and only then retire the old value.
- Smoke test the live site immediately after deploy: homepage, sign-in, core flows, money paths (to the checkout page, never a real payment), and the free paths. Record the exact results with times.
- If the smoke test finds a blocker, diagnose from the logs before retrying. Read the server log line for the exact error (status and body), not the user-facing message. The user-facing message is never the diagnosis.
- If a secret value is suspected, verify the scope, the deployment alias, and the key mode first, then re-create the secret with a length-checked paste and redeploy. Never print a secret value.

**Completion:** the live site verified by a smoke test with the exact results recorded, and the release report written.

### Step 12. Documentation, handover, and maintenance

**Tasks:**
- Update the docs the same day the state changes: ENVIRONMENT.md, STAGING.md, BACKUP-RECOVERY.md, the production change plan, and the code comments that describe the live configuration. A doc that contradicts the live state is a defect, not a low-priority item.
- Update the tracker and the decision log the same day. Record what was done, what was verified, and what is still open.
- Record the open items with an owner and a condition for closing each one. An open item with no owner is a forgotten item.
- Hand over with a one-page summary: what is live, what the score is, what the conditions for full GO are, and what is owed by whom.
- Maintain: watch the backup schedule, the error logs, the webhook failures, and the provider quotas. A failing webhook or a Resend outage is invisible until a customer complains unless someone is watching.

**Completion:** docs, tracker, and decision log current; handover written; monitoring in place.

### Extra steps the Sortes experience shows are necessary

- **Deploy-order gate (Step 9, hard gate).** Migrations and ledger verified BEFORE merge and deploy. This was missing from every earlier plan and caused the only production outage in the journey (Bug 1). Make it a CI gate, not a manual check.
- **Secret-value verification (Step 11).** A length and format check at the moment a key is pasted. The first live key failed because the saved value was damaged or wrong, and nothing checked it until production logs showed a 401.
- **Parity audit before production changes (Step 9).** Never assume which environment is ahead. Check.
- **Independent challenge (Step 8).** A review that reads the code, not the report. Every false claim in the journey was caught this way.
- **Real-device mobile test (Step 5).** The agent browser cannot emulate a real-device finger test. It is the owner's job, and it must be scheduled, not deferred indefinitely.
- **Rollback drill (Step 10).** A documented rollback that has never been executed is AMBER, never GREEN.
- **Docs-freshness check (Step 12).** After any live state change, re-read the docs that describe that state and update them the same day.

## 5. Production readiness gates (fixed list)

Use these gates for every production release. A gate is GREEN only when the evidence is live. Code plus unit tests is AMBER at best. A gate that has never been executed is AMBER, never GREEN.

| Gate | What GREEN means | What AMBER means |
|---|---|---|
| G1 Backup | Production backup completed, restore verified in an isolated database, daily schedule running and observed | Backup designed or created but not restore-verified, or schedule not yet observed |
| G2 Migrations tested | Migrations run against staging and verified (ledger, tables, indexes, constraints) | Tested on local database only, or staging test owed |
| G3 RLS and data exposure | RLS reviewed and tested, and applied where approved; live proof from the anon key (rows before, zero rows after, app still working) | Reviewed and tested locally, not applied, or live proof owed |
| G4 No critical or high security issues | Independent review finds zero Critical and zero High issues, or all are fixed and re-verified | Open Mediums with a named plan, or review not yet done |
| G5 Credit and payment integrity | Money paths proven on a real database; webhook verified; duplicate, refund, and concurrency cases proven | Proven locally only, or live payment E2E owed |
| G6 Auth verified | All sign-in methods proven live in production (magic link, password, OAuth if offered) | Code and unit tests green, live proof owed |
| G7 AI failures do not charge | No-spend-on-failure proven in code and live; first-attempt reliability measured | Code test only, live measurement owed |
| G8 Staging E2E passes | The full E2E plan passes on the staging or Preview deployment of the exact release candidate | Plan written but not run, or run against a different commit |
| G9 Build, lint, typecheck, tests | Lint 0, typecheck 0, tests passing with the exact count recorded, build 0, golden check green | Any of these failing or unrecorded |
| G10 No important console errors | A full console-error sweep on the live site shows no important errors | Smoke test only, or full sweep owed |
| G11 Mobile tests pass | Real-device test at 390px passes, including touch interactions | Browser emulation only, or real-device test owed |
| G12 Rollback executable | Rollback documented AND executed against a verified backup | Documented only, never executed |
| G13 Production env vars verified | Every production variable verified for the right environment, with the values that can be checked without revealing secrets | Last verified earlier, or additions pending |
| G14 Production changes have clear reviewed impact | Every production change documented with effect, risk, and rollback, and reviewed | Undocumented or unreviewed change |

Verdict rules:

- **GO:** all gates GREEN.
- **CONDITIONAL GO:** no gate RED, and every AMBER gate has a named condition and an owner. The conditions are listed in the release report.
- **NO-GO:** any gate RED, or an AMBER gate with no condition, or a missing backup, or an unverified money path.

## 6. Scoring standard

Score honestly across the same ten areas every time, each 0 to 10, sum to 100. Show the arithmetic in full. Never inflate.

| Area | What a 10 requires | What holds it below 10 |
|---|---|---|
| Security | Independent review, zero Critical and zero High, RLS proven live, secrets handled correctly, rate limiting proven | Any open Critical or High, RLS unproven live, a known fail-open path |
| Payments | A real production payment credited correctly, webhook verified, duplicate and refund proven | No real production payment yet, or live E2E owed |
| Balance | Balance correct in every path, including after failure, refund, and concurrent spend | Any path where the balance is wrong, stale, or flashed as 0 while loading |
| Postgres/SQL | Migrations and ledger verified, constraints and indexes in place, timeouts bounded, no unbounded waits | Any unbounded wait, missing constraint, or unverified ledger |
| Auth | Every sign-in method proven live, sessions revocable, logout and password change invalidate tokens | Any method unproven live, or a non-revocable session |
| AI | First-attempt reliability measured and acceptable, no spend on failure, output validated, model labelled | Unmeasured reliability, or a failure that charges |
| UI/UX | Real-device mobile pass, touch targets, contrast, focus traps, loading and error states correct | Any deferred visual or mobile check |
| QA | Full test suite green with the exact count, golden check green, regression tests for every fixed bug | Any red check, or a fixed bug with no regression test |
| SEO | Titles, sitemap, canonical domain, server-rendered pricing and content where it matters | Client-rendered pricing, missing sitemap, wrong canonical |
| Deployment | Backup GREEN, deploy-order gate executed, rollback drilled, env vars verified | Any of those missing |

A score is a measurement at a point in time. When the state changes, re-score and show the new arithmetic. Never carry a score forward without re-verifying it.

## 7. Per-engagement checklists

### 7.1 Build a new application or SaaS

- Steps 1 to 5 in full before writing code. Baseline, research, audit of the idea, plan, quality bar.
- Define the product promise in one sentence and the pricing in one table. Flat pricing where possible; no tiered pricing without the owner's approval.
- Build P0 first (security, money, data safety, broken core), then P1, then P2. Do not build the moat before the core works.
- Write the tests with the code, not after. Money paths get real-database tests from day one.
- Set up the backup before the first production deploy. Set up the env var matrix before the first production deploy. Set up the deploy-order gate before the first production deploy.
- Launch with a CONDITIONAL GO at most. A first launch is never a full GO.

### 7.2 Fix or improve an existing application

- Step 1 (baseline) and Step 3 (audit) first. Never fix a finding without verifying it in current code.
- Reproduce the bug before fixing it. If it cannot be reproduced, say so and name what was tried.
- Fix the root cause, not the symptom. If the root cause is unproven, say so, record the honest limits, and keep the defense-in-depth fixes.
- Every fix gets a regression test. Every fix is verified live in staging before it is claimed.
- If the fix touches production data, a secret, or a payment, get the owner's approval first.

### 7.3 Audit a GitHub repository

- Read the code. Do not trust the README, a previous audit, or a summary.
- Audit in the four workstreams (security, product, UX/mobile/accessibility, backup).
- Verify every finding in current code. Record the commit the audit ran against.
- List what was NOT tested and what the audit could not verify.
- Give a verdict and a score with the arithmetic shown. Never inflate.
- Treat delegated browser text as a lead, never as evidence. Verify every live claim by a direct re-check.

### 7.4 Continue an unfinished project

- Step 1 (baseline) first: what is done, what is half done, what is claimed done but is not, what is open.
- Read the tracker and decision log. If there is no tracker, create one from the evidence and mark every inferred item as inferred.
- Verify every claimed completion before building on it. The readiness review caught two false claims this way.
- Do not re-do completed work. Do not trust a claim without evidence. Re-verify the gates from scratch.

### 7.5 Transform a prototype into a complete product

- Roast it first (Step 3). A prototype that has never been audited is not a product.
- Fix P0 (security, money, data safety, broken core) before any design work.
- Do not add features until the core is trustworthy. The moat comes last.
- Measure the score before and after. Show the trajectory.

### 7.6 Prepare an application for production

- Steps 9 to 11 in full. Backup GREEN, migrations and ledger verified, env vars verified, parity audit done, deploy-order gate executed, smoke test run.
- The readiness document is the gate. No merge or deploy without the owner's approval.
- A production release is never rushed because the code is ready. The gates decide, not the calendar.

### 7.7 Maintain, secure, or scale an existing product

- Watch the backup schedule, the error logs, the webhook failures, and the provider quotas. Set up alerting; a failing webhook is invisible until a customer complains.
- Re-audit on a schedule and after every major change. Re-score and show the new arithmetic.
- Keep the docs current. A doc that contradicts the live state is a defect.
- For scaling, measure first. A concurrency soak is required before changing a pooler mode, a pool size, or a connection limit. A single-user test cannot reveal pool exhaustion.
- For security, review the owner's own code for holes (owner-side scope). Never suggest unauthorized or out-of-scope testing.

## 8. Anti-patterns (from Sortes, do not repeat)

1. **Claiming from the new code instead of measuring the live system.** The limiter, the test count, the charts pills, the live key, and the sign-in setting were all claimed from code or a setting and all were wrong.
2. **Retrying the same failing step.** One retry, then diagnose. The retry rule exists because retry loops wasted runs.
3. **Deploying before migrating.** The deploy-order gate exists because deploying first bricked every DB-backed route.
4. **Applying SQL by hand and skipping the ledger.** Any manual database change must update the ledger, or the app will refuse to run.
5. **Pasting a secret without a length check.** A 1,035-character key that arrives truncated or damaged is invisible until production logs show a 401. Check the length at paste time.
6. **Changing a live credential before the redeploy.** The site goes DOWN. Prepare the value, update the deployment, verify, then retire the old value.
7. **Deferring visual and mobile checks.** They were deferred at every stage and were still RED at the end. Schedule them, do not defer them.
8. **Letting docs drift.** STAGING.md, ENVIRONMENT.md, BACKUP-RECOVERY.md, and the db.ts header all contradicted the live state. Update docs the same day the state changes.
9. **Trusting a delegated browser report as evidence.** The roast's first pass was wrong on pricing, spreads, and the FAQ. Verify every live claim by a direct re-check.
10. **Making a chain change without measuring.** AI chain changes were made on anecdote while the measurement plan sat unrun. Measure first, change second, measure again.
11. **Leaving uncommitted test edits to be reverted.** Commit each unit immediately.
12. **Treating a setting as behaviour.** OTP 8 digits from a setting did not mean sign-in was verified. Only a live sign-in proves sign-in.
13. **Hunting for a production password.** It exists only masked in Vercel. Request it from the owner via Secure Vault. Never go hunting unprompted.
14. **Using a fallback as the primary without saying so.** The VM cron was the designed primary and the GitHub Actions workflow was the fallback. In reality the fallback was the working path. Name the real primary.
15. **Hiding a contradiction.** When two sources disagree, flag it. The retrospective lists 22 contradictions. A hidden contradiction becomes a wrong decision later.

## 9. Verification standards

### 9.1 Evidence tiers

- **Verified live:** observed directly in a browser, a dashboard, a log, or a test run, with a time and a result. This is the only tier that closes a gate.
- **File-recorded:** stated in a tracker, report, decision log, diagnosis, or commit message. Quote the source. Check it against the live state before relying on it.
- **Inferred:** reasoned from the evidence but not directly observed. Mark it as inferred. Never present an inference as a verified fact.
- **Unresolved:** two or more sources disagree, or the evidence does not settle the point. Flag it. Do not smooth it over.

### 9.2 What "verified" means for each kind of claim

- **A fix is verified** when a test passes, a log shows the correct behaviour, or a live check succeeds. Reading the new code does not verify a fix.
- **A removal is verified** by grep, not by reading the new code. (The limiter was claimed removed and still existed.)
- **A live claim is verified** by a direct re-check, not by a delegated report. (The roast's pricing claim was wrong.)
- **A secret is verified** by behaviour (a live call succeeds) or by a length and format check at paste time. A masked value cannot be verified by looking at it.
- **A backup is verified** by a restore into an isolated database with the table counts checked. Creating the backup is not verification.
- **A migration is verified** by reading the ledger and confirming the versions, tables, indexes, and constraints. Applying the SQL is not verification.
- **A sign-in method is verified** by signing in live. A setting is not verification.
- **A score is verified** by showing the arithmetic. A headline without an area sum is not verification.

### 9.3 Reports

Every report names its scope, its commit, its date, its verdict, its score with arithmetic, its gates, its conditions, and its contradictions. Every report lists what was NOT tested. A report that does not list its own limits is not a report.

## 10. Maintenance of this playbook

- This playbook lives in the repo at docs/playbook/. It is versioned with the code.
- When a new lesson is learned, add it here with the incident that created it. Do not add a rule without evidence.
- When a rule is changed, record who changed it and why. The owner can change any rule by name.
- The companion retrospective is the evidence. If a rule in this playbook cannot be traced to an incident in the retrospective or a later incident, flag it for review.
