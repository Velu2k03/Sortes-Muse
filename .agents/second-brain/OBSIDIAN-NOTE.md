# Obsidian and second brain note

## Obsidian itself is NOT installed here, and that is expected

Obsidian is a desktop GUI app. This VM has no GUI session for it,
so installing Obsidian here would not give Velu a usable app.
Do not try to install it on this VM, and do not claim it is
installed.

## This folder IS the Obsidian-compatible vault

This folder, `~/workspace/sortes/.agents/second-brain/`, is plain
Markdown, one note per topic, with wikilink-style links like
[[MEMORY]] and [[VERIFIED-FACTS]]. That is exactly the format
Obsidian reads natively. No conversion is needed.

Files in this vault:

- [[README]]: how agy must use this folder on every Sortes task.
- [[MEMORY]]: Sortes facts, architecture, pricing, PR history.
- [[VERIFIED-FACTS]]: only live-verified facts, plus DO-NOT-CLAIM.
- [[DECISIONS]]: decisions already made, decisions still owed.
- [[OBSIDIAN-NOTE]]: this note.

## How Velu opens it in Obsidian on his own PC

1. Copy or sync this folder to his PC. The folder to copy is
   `.agents/second-brain` inside the Sortes workspace.
   Sync options that already exist in his setup: the workspace
   is a git repo, and a Google Drive folder "Sortes - All Files
   2026-11-01" exists for Sortes files. Either route works; do
   not put secrets in either.
2. In Obsidian on his PC: Open folder as vault, choose the
   copied `second-brain` folder.
3. Start at README, then MEMORY, then VERIFIED-FACTS. Graph view
   will show the wikilinks between notes. Backlinks work the
   same way.
4. Edits he makes in Obsidian are edits to these Markdown files.
   If he edits a copy, the copy and this folder will drift, so
   keep one canonical copy and sync from it.

## How this stops losing track and hallucinating

- One canonical note per topic, not a new summary each session.
- VERIFIED-FACTS separates "verified live" from "merged" from
  "never tested". Agy must check that file before claiming
  anything works.
- MEMORY is updated after every verified change, with file and
  method, so the next session starts from the last verified
  state instead of reconstructing it from chat history.
- DECISIONS stops re-deciding what Velu already decided, and
  lists what is still owed so agy does not invent an answer.
- If a note and live code disagree, live code wins and the note
  is updated. Notes are a cache, not a source of truth.
