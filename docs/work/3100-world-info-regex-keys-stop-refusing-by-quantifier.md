---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: world-info
plan: import-robustness
---

# World-info regex keys stop refusing by quantifier shape

## What

`keyPatternTooComplex` in `packages/kit/src/world-info/index.ts` still refuses a `use_regex` key with stacked quantifiers, the filter the regex-script executor has dropped. Measure real lorebook keys through the per-key watchdog (`createRegexTest` in `packages/server/src/primitives/regex/index.ts`) and drop the shape filter if, as for scripts, it refuses lazy keys that finish in milliseconds.

## Why

The same filter refused a large share of a real preset's scripts while admitting `(a+)+$`; a key with several lazy groups is refused today and treated as a non-match without a reason.

## Done when

A key with several lazy groups matches on the turn, and a catastrophic key is still cut off by the per-key watchdog and reported.

## Evidence

Filled at landing: what ran and where its output is.
