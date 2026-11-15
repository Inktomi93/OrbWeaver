---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: import-robustness
---

# Stale regex comments after the two-axis move

## What

Comments still describe the old placement model: `packages/server/src/primitives/serde/card/index.ts` above `parseRegexScripts`, `packages/server/src/domain/chat/substrate/regex-tier.ts` (its header and the tier filter), and the `setScriptsBehaviorBulk` doc in `packages/server/src/domain/regex/persistence/queries.ts`.

## Why

A wrong comment misleads the next edit.

## Done when

Each comment states what the code does now, or is deleted.

## Evidence

Filled at landing: what ran and where its output is.
