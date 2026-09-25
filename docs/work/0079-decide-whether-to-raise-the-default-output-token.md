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

Ruled: no change. DEFAULT_MAX_OUTPUT_TOKENS stays 2048 and DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS stays 1024. No length-cut empty turn is recorded (packages/contracts/src/preset/index.ts header), and the cap is also the history-fit reserve on small-context models. Thinking that spends the cap is handled by the reasoning_budget_clamped degrade and by 0153. Reopen only on a recorded length-cut specimen, and then build the derived reserve rather than a bigger constant.
