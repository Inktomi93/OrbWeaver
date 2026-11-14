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

After the bundled-regex import, the unrecognised-field report, the size-limit ruling and the styling ruling land, import the Sola V4 Flame Complete file (repository `pyrxpia/sola-hub`, under `presets/`) and drive a chat that emits `<scene_header>`, the HUD and the co-author note. Record each difference from SillyTavern. Check the scripts that set `minDepth` or `maxDepth`: the header of `packages/contracts/src/regex/schemas.ts` rules that the SillyTavern depth pair is deliberately not mapped, so they may run on every message. The file also sets `openai_max_context` 128000 and `openai_max_tokens` 29828: confirm both arrive.

## Why

It is a public, large, widely used HUD preset, so it stands in for the class.

## Done when

The scene banner, the HUD bar and the co-author card render in a rendered check, and every remaining difference is filed as an item.

## Evidence

Filled at landing: what ran and where its output is.
