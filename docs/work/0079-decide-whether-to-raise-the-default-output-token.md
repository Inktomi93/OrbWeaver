---
kind: decision
status: open
updated: 2026-09-23
priority: P2
area: preset
---

# Decide whether to raise the default output token caps

## What

The owner decides whether replies and summaries get longer default output caps. `DEFAULT_MAX_OUTPUT_TOKENS` in `packages/contracts/src/preset/index.ts` is 2048 and is both the wire max_tokens and the history-fit reserve. `DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS` in `packages/contracts/src/settings/index.ts` is 1024. Rpg extraction is uncapped.

## Why

The retro workboard carried this as an open lever and nothing else tracks it. Raising either cap changes values that tests assert, so it owes the behavioral battery.

## Done when

The owner rules the values, and a change, if any, lands with the suites that assert them.

## Evidence

Filled at landing: what ran and where its output is.
