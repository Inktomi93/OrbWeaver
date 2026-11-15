---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: chat
plan: import-robustness
---

# A send whose macro pass trips its byte budget is refused, never stored empty

## What

`processMacros` in `packages/kit/src/macro/engine.ts` returns an empty string when its output budget trips or its input is over its input bound. The persisting send path rendered the composer draft through it, so a long send or commit stored a message with empty visible content and only the host-plane raw text kept what was typed.

## Why

Silent loss of what the user typed: the room showed an empty message and nothing said why.

## Done when

On the persisting send path a draft whose macro render trips the budget is refused with `message_macro_budget` and stores nothing, the commit-time greeting and alternate bakes keep their body, and a case through the composed root proves an over-budget send and commit are refused while one under the budget lands whole.

## Evidence

Filled at landing: what ran and where its output is.
