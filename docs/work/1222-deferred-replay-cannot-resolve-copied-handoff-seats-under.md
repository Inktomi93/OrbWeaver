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

Implement D332 settlement before acceptance under D19 and D131. Preserve frozen funding and assembly authority, single-owned card access, accepted-copy custody and subsequent new-host turns. Qualify queued settlement, failed settlement, claim and admission races, owned continuation work and unchanged normal turn concurrency. Add no waiver, private test API or fabricated role change.

## Evidence

The public-copy replay fails in `reports/runs/test/codex-persona-cache-1193-3401863-2026-10-21T02-48-39-407Z/test-report.json` within the speaker/funding worktree. The unchanged logger reports `ChatOperationError`, code `speaker_off_roster`, for the persisted pending-turn id. The implementation and review records are `reports/review/1193-speaker-funding-implementation.md` and `reports/review/1193-speaker-funding-review.md`.

[D332](../adr/0332-host-handoff-settles-old-authority-work-before-transfer.md) selects settlement before transfer and retry refusal when settlement fails. Implementation remains open.
