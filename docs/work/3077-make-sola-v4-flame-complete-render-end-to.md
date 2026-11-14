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

After the bundled-regex import, the unrecognised-field report, the size limits and the regex-panel rendering land, import the Sola V4 Flame Complete file (repository `pyrxpia/sola-hub`, under `presets/`) and drive a chat that emits `<scene_header>`, the HUD and the co-author note. Record each difference from SillyTavern. Depth: the app has the depth scope as `historyDepth`, on the prompt-history placement only, with its own editor field. The import does not lift SillyTavern's flat `minDepth` and `maxDepth` onto it; the header of `packages/contracts/src/regex/schemas.ts` rules that out because SillyTavern scopes depth on placements that run at a different time here. Some of the file's scripts set the pair. For each, say which placement it lands on after import, whether it now runs on every message, and whether a prompt-only SillyTavern script with a depth pair should lift onto the prompt-history placement with that depth. If so, file that as a ruling to amend. The file also sets `openai_max_context` 128000 and `openai_max_tokens` 29828: confirm both arrive.

## Why

It is a public, large, widely used HUD preset, so it stands in for the class.

## Done when

The scene banner, the HUD bar and the co-author card render in a rendered check, and every remaining difference is filed as an item.

## Evidence

Filled at landing: what ran and where its output is.
