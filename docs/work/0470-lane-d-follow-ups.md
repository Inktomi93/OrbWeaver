---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: onboarding
---

# Lane D follow-ups

## What

When the memory chain will add digests before the understanding pass, the estimate counts the themes stage at its ceiling: one naming call per cluster, at most the per-level cap. The confirm says the count is an upper bound when any stage is counted at its ceiling.

## Why

The confirm states a paid run's size before it starts, and an undercount states the wrong size.

## Done when

a server case through the estimate verb shows the ceiling count before backfill and the exact count after it, and a CT on the confirm shows the upper-bound sentence only for a bounded estimate.

## Evidence

Schedules: creating or editing a schedule whose job calls a model asks once with the per-run count (`create-schedule-dialog.tsx`, `modelRunCostSentence(..., recurring)`). CT: the schedules-section CT, a [restoration register](../plans/restoration-register/design.md) entry.

Retry estimate: `workloads.estimateRetryModelCalls` counts the row a retry clones, under that row's owner and retry's gates (`packages/server/src/domain/workloads/verbs/estimate-model-calls.ts`); the Jobs retry asks by id. Node: the estimate-model-calls int case, a restoration-register entry; the cross-tenant sweep probes the new id-taking read.

Themes before backfill: needs the owner. The themes stage is still counted over today's digests. Recommendation: when the chain will add digests, count that stage at its ceiling (one naming call per cluster, at most `k` per level) and say "up to" in the confirm.

Image analysis: the count is zero for an owner whose Utility model would make no vision call (the same gate the analysis uses), and an avatar whose stored hash differs from its analysed bytes counts again (`createImageAnalysisCounter`). Node: the embed-assets int case, a restoration-register entry, both cases red on the old counter.

Memory estimate: it walks the planner's block grid, witness narrowing and content hashes (`packages/server/src/domain/chat/substrate/backfill-estimate.ts`). Node: the backfill-estimate int case, a restoration-register entry.

Next-turn line: its doors read `CHAT_ROLE_DOOR` and `ADD_CONNECTION_DOOR` from `packages/client/src/lib/connection-roles.ts`, which the Connections nav reads too.

ADR 0036: superseded by `docs/adr/0293-memory-is-off-until-each-user-turns-it-on.md`, which records the off default and the turn-on confirm; the four `D36` code citations now cite D293.

Double failure surface: the first-model step states a failure in its inline alert, and the mutation's own toast also speaks it (item 1763: a failure may show both and never neither).

Em dashes: removed from the reachability lines, the add-connection form and its failure sentences, the interactive cards hint, the assumed-capability source line, the confirm dialog's failure line and the workload dialogs.
