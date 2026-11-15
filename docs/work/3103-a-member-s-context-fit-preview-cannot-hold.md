---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: import-robustness
---

# A member's context-fit preview cannot hold the event loop

## What

`previewContextFit` (`packages/server/src/domain/chat/verbs/read.ts`) is member-gated and sits only under the general request bucket. Each call runs the history regex pass, up to a pass budget that scales with the row count, and every member's client refetches it after each turn.

## Why

One member can keep the loop busy with a hostile host preset, or with an honest one on a long chat. Predates the regex guard work.

## Done when

Concurrent fits for one room share one run (single flight), or the read moves to a smaller bucket, with a case that fires many fits and sees one pass.

## Evidence

Filled at landing: what ran and where its output is.
