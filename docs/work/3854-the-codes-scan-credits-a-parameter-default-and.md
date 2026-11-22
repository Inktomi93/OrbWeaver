---
kind: tooling
status: doing
updated: 2026-11-22
priority: P3
area: tooling
lane: wt/agent-aa12694c3a59bb6aa
plan: unwired-code
---

# The codes scan credits a parameter default and a cross-file membership Set

## What

A member built as a constructor parameter default reads unthrown, and a Set tested with has in another file names no branch.

## Why

False findings hide the real ones.

## Done when

Red-first planted cases from reports/unwired/codes-judge.md pass through tooling/src/unwired/index.ts, and the orchestrator reruns pnpm unwired codes.

## Evidence

Filled at landing: what ran and where its output is.
