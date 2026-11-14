---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: chat
plan: import-robustness
---

# Make Sola V4 Flame Complete render end to end

## What

After the bundled-regex import, the unrecognised-field report, the size limits and the regex-panel rendering land, import the Sola V4 Flame Complete file (repository `pyrxpia/sola-hub`, under `presets/`) and drive a chat that emits `<scene_header>`, the HUD and the co-author note. Record each difference from SillyTavern. Prompt-only scripts, measured on the file: every script that sets `minDepth` or `maxDepth` is prompt-only and acts on AI output. In SillyTavern that means: change the copy of an older reply that goes into the prompt, and leave the saved chat alone. Here the AI-output placement runs when a reply is saved, and the depth scope (`historyDepth`) exists only on the prompt-history placement; the lift in `packages/contracts/src/regex/schemas.ts` keeps the placement and drops the depth pair by a recorded ruling. Test what these scripts do after import: whether they rewrite saved replies, and whether they run on every message. If either, the lift should put a prompt-only script on the prompt-history placement with its depth, and that is a ruling to amend, filed as its own item before this one closes. The file also sets `openai_max_context` 128000 and `openai_max_tokens` 29828: confirm both arrive.

## Why

It is a public, large, widely used HUD preset, so it stands in for the class.

## Done when

The scene banner, the HUD bar and the co-author card render in a rendered check, and every remaining difference is filed as an item.

## Evidence

Filled at landing: what ran and where its output is.
