---
kind: bug
status: doing
updated: 2026-10-21
priority: P1
area: security
lane: codex/legacy-speaker-funding-1193
plan: test-foundation
---

# Deferred replay cannot resolve copied handoff seats under its frozen host

## What

A real member send queues under host A. A public accepted character-copy handoff repoints the seats to host B. Deferred replay still assembles under A as D19 requires, so the copied cards do not resolve and the round raises speaker_off_roster. The row requeues instead of completing. The composed regression is the old turn2051 successor in deferred-reclaim.suite.int.test.ts; completed run3401863 captures the actual caught error through the unchanged logger.

## Why

The legacy role-swap fixture concealed the interaction between frozen replay authority and D131 copy custody. Changing the test to a raw role swap or lending B's authority to A would hide the ownership boundary.

## Done when

Resolve the queued-turn behavior under D19 and D131 from the actual public producers. Preserve frozen funding and assembly authority, single-owned card access, accepted-copy custody and subsequent new-host turns. Qualify the composed regression and relevant negative ownership controls without a waiver, private test API or fabricated role change. Record any required owner decision explicitly rather than weakening the assertion.

## Evidence

The public-copy replay fails in `reports/runs/test/codex-persona-cache-1193-3401863-2026-10-21T02-48-39-407Z/test-report.json` within the speaker/funding worktree. The unchanged logger reports `ChatOperationError`, code `speaker_off_roster`, for the persisted pending-turn id. The implementation and review records are `reports/review/1193-speaker-funding-implementation.md` and `reports/review/1193-speaker-funding-review.md`.
