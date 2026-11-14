---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: import
plan: import-robustness
---

# An imported SillyTavern regex script runs where its author meant it to

## What

SillyTavern says when a script runs with two flags beside its placement, and the lift in `packages/contracts/src/regex/schemas.ts` (`normalizeStScriptWire`, `regexScriptCardSchema`) keeps the numeric placement and copies the flags without translating them. Measured by running three shapes through the real schema and `executeRegexScripts` in `packages/kit/src/regex/index.ts` on every placement. A display-only script on AI output (`markdownOnly`) is stored with the AI-output placement, and then runs nowhere: the display placement is not in its set, and the flag skips it on every other. A prompt-only script on AI output (`promptOnly`) runs when a reply is saved, so it rewrites the stored reply on every message, where SillyTavern changes only the copy sent in the prompt and honours `minDepth` and `maxDepth`. A script with neither flag runs when the reply is saved, which matches SillyTavern. Ruling, under delegation, amending the accept-and-drop clause in that file's header: the lift translates by flag. Display-only lands on the display placement. Prompt-only lands on the prompt-history placement with `historyDepth` taken from `minDepth` and `maxDepth`. Neither flag keeps its placement. SillyTavern's placement also says which messages a script applies to (user input or AI output): find whether the display and prompt-history placements can keep that, and report it if they cannot. The character card import, the profile-folder import and the global script import share this lift, so scripts already imported through them are stored the old way: say what a repair of stored rows would take, and do not write one without a ruling.

## Why

A SillyTavern preset's panels are display-only scripts and its context trimmers are prompt-only scripts. Imported today, the first kind does nothing and the second kind edits saved replies.

## Done when

A display-only script imported through each door draws on the reply it targets and changes no stored row; a prompt-only script with a depth pair changes only the prompt copy within its depth and no stored row; a script with neither flag still rewrites the saved reply. A composed-root case pins each through the real import door and a real turn, and the header ruling is amended.

## Evidence

Filled at landing: what ran and where its output is.
