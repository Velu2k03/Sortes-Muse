# Velu instructions — Sortes autonomous finish run (2026-11-08)

Read before every batch. These are Velu's own orders and outrank the run brief.

## 1. Pricing is Velu's alone

Velu chooses and edits ALL pricing decisions himself, on his own machine. He pushes to GitHub and merges himself. Agents must NOT touch any pricing or monetisation wording anywhere in this run. It stays PARKED with owner Velu. No agent push, merge, or deploy, ever.

## 2. Opus for complex tasks

Default model stays Sonnet. For COMPLEX tasks, run Claude Code with `--model opus` added to the Option A invocation (example: `claude --model opus --permission-mode acceptEdits --allowedTools "Edit,Write,Read,Glob,Grep,Bash" --permission-prompts none`). Complex means: the re-audit, nonce CSP, multi-file refactors, architecture decisions, hard debugging, deep planning, long autonomous runs. Routine edits stay on Sonnet. Do NOT change the global default in settings.json. Opus is verified working on his Pro account (one-word probe 2026-11-08, exit 0). Record in the final report which steps ran on Opus vs Sonnet.

## 3. The goal, unchanged

Fix everything per the 3 audits (Claude live UX 62/100, brutal roast 43/100, Argon forensic 46/100) and make the branch production-ready / publishable. Deliverable is the local branch only. Velu does the push and merge.
