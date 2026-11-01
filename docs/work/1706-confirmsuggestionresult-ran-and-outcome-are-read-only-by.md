---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: server
plan: unwired-code
---

# ConfirmSuggestionResult.ran and .outcome are read only by tests: wire a reader or delete them

## What

Delete `ConfirmSuggestionResult` and its schema; `confirmSuggestion` returns `void`, like `dismissSuggestion`. A confirmed act that fails refuses with the typed `automation_suggestion_act_failed` on every path, so a failure never reads as success.

## Why

The client never reads the confirm result (`packages/client/src/features/automation/components/suggestion-card-mount.tsx` only retires the card). Only tests read `ran` and `outcome`, and a test alone is not a consumer. Wiring a reader needs the rule name for the notice copy, which the ask does not carry.

## Done when

A rule-path failure keeps its `action_error` fire row; a plugin-path failure is logged (it has no fire row). The ask is spent once confirmed, so a retry meets suggestion-not-found; the host re-triggers the rule or plugin to get a new ask. No `ConfirmSuggestionResult` or `confirmSuggestionResultSchema` in `packages/`, `tests/`, `tooling/` or `scripts/`. The confirm effects (fires, variables, world entries) stay asserted by the dispatch and execution-outputs suites.

## Evidence

Targeted tests, typecheck, lint, depcruise and knip results are in the landing commit message.
