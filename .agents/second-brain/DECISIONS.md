# Decisions already made (do not re-decide without Velu)

- Follow-up Q&A pricing (Velu, 2026-11-02, tapped then restated):
  first follow-up per reading FREE, then 1 credit each. Free flag
  stored per reading. Applies to tarot v1 only in issue #32.
- Redesign issue #32 (NOT started, per sequencing 2026-11-02):
  "Resonant Atlas redesign: personal AI experience, structured
  results, contextual follow-up Q&A".
  Phase 1 trust/readability: structured result template, personal
  vs generic lanes, fix fallback mislabel, fix fake follow-up
  link, fix About three-vs-six spreads, locked spreads lead with
  free Quick Insight, progressive disclosure.
  Phase 2 guided entry + charts chooser/sample + navigation rename.
  Phase 3 contextual AI Q&A, tarot v1 only (new POST
  /api/reading/follow-up, own rate bucket, health + finances
  guardrail, 300-char cap, followUps stored on Reading; charts
  follow-up excluded from v1; horoscope "Make it personal" CTA;
  post-reading footer).
  Trust bugs for Phase 1: IntakeFlow never reads data.fallback,
  so a static fallback is shown as "Personalized interpretation";
  ReadingDetailClient "Ask a follow-up" link carries no
  params/prefill/story despite copy claiming it does. Generic
  tarot (ReadingFlow) is NOT AI (aiGenerated:false, static card
  meanings); personalized tarot (IntakeFlow) is real OpenRouter
  synthesis rendered as ONE TypewriterText block suppressing
  per-card meanings. AI routes: 25s timeout, 20 generations/IP/hour,
  free model chain. Credits are client-side only, neither AI route
  checks a server balance.
- Audit cycle 2026-11-02 is COMPLETE. Do NOT start the larger
  redesign (issue #32) or a React Bits overhaul yet. After the
  audit cycle: concise report, then AI simulated-user testing,
  GitHub tool discovery, and visual/product redesign, in that order.
- No score chasing: do not manipulate scores, do not add
  unnecessary SEO content or schema markup, do not treat validator
  bugs as website failures. No new schema for interactive tool
  pages. No invented ai.txt/security.txt/humans.txt/llms-full.txt.
- Logo (issue #33): golden moon as Sortes logo everywhere, but
  ONLY the original Flow moon, background removed by a tool,
  sample approval before rollout. Bold simplified version REJECTED.
  Flow background removal was blocked on Velu's phone approval
  (Google 2-Step, tap Yes then 15), not confirmed as of 2026-11-02.
- HoloCard preset: gold is current, bursts vs gold question is
  UNANSWERED. Do not change it without Velu.
- Decisions still owed from Velu, do not preempt: HoloCard preset,
  Yes/No spread, subscription membership, I Ching, numerology,
  Blind Draw hero flow, same logo on Velu HQ/showcase sites,
  his cut-off "And" message, Fablefolk display name/handle
  (separate project, not Sortes), Sortes sign-in live test result.
- Monetization: NO client hunting. Build-and-leave products only.
- Job hunt rules are NOT Sortes rules, but they explain Velu's
  style: batches of 10, tracker first, seniority/pay/remote
  rechecked on the live posting before every submit, anything once
  excluded stays excluded. Do not apply job rules to Sortes code.
- Sample-first design rule: no bulk design set ships on an
  unapproved sample. Canva first for images in the main agent's
  work; for agy, do not generate images unless asked.
- Sign-in preference: Google as velu2k03@gmail.com for
  registrations/logins generally. For Sortes itself, Google
  provider is DISABLED in Supabase; do not enable it as a Sortes
  auth provider without Velu.
- Antigravity scope: Sortes fixing/coding ONLY, Google Pro quota.
  NOT ReelDirector. ReelDirector rule unchanged (Muse Code codes).
- Health guardrail closing sentence, exact: "This reflection is
  not medical advice. Please speak with a licensed professional
  about any health concern."
