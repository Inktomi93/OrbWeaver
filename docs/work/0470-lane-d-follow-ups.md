---
kind: work
status: doing
updated: 2026-10-03
priority: P3
area: onboarding
lane: wt/agent-adde4b4e6702c9cf6
---

# Lane D follow-ups

## What

Bundle: schedules do not confirm a per-run call count; a Retry estimate counts the caller scope, not the row owner; the understanding-pass themes count is understated before backfill; the image-analysis count ignores the vision short-circuit and re-uploaded bytes; the memory estimate runs high (no witness narrowing or hash drift); next-turn-line spells model-roles and chat-model literals instead of MODEL_ROLES_ADDRESS; ADR 0036 Consequences should record the off default and the turn-on confirm; a first-model-setup failure shows inline and in the setBinding toast; app strings still carry em dashes (connection reachability, add-connection form, the interactive cards hint, the assumed source line).

## Why

Found by lane D and the wiki sweep outside their done criteria.

## Done when

Each point fixed with a test where behavior changes, or ruled.

## Evidence

Schedules: creating or editing a schedule whose job calls a model asks once with the per-run count (`create-schedule-dialog.tsx`, `modelRunCostSentence(..., recurring)`). CT: `tests/client/features/workloads/components/schedules-section.ct.tsx`.

Retry estimate: `workloads.estimateRetryModelCalls` counts the row a retry clones, under that row's owner and retry's gates (`packages/server/src/domain/workloads/verbs/estimate-model-calls.ts`); the Jobs retry asks by id. Node: `tests/server/domain/workloads/verbs/estimate-model-calls.int.test.ts`; the cross-tenant sweep probes the new id-taking read.

Themes before backfill: needs the owner. The themes stage is still counted over today's digests. Recommendation: when the chain will add digests, count that stage at its ceiling (one naming call per cluster, at most `k` per level) and say "up to" in the confirm.

Image analysis: the count is zero for an owner whose Utility model would make no vision call (the same gate the analysis uses), and an avatar whose stored hash differs from its analysed bytes counts again (`createImageAnalysisCounter`). Node: `tests/server/domain/embeddings/verbs/embed-assets.int.test.ts`, both cases red on the old counter.

Memory estimate: it walks the planner's block grid, witness narrowing and content hashes (`packages/server/src/domain/chat/substrate/backfill-estimate.ts`). Node: `tests/server/domain/chat/substrate/backfill-estimate.int.test.ts`.

Next-turn line: its doors read `CHAT_ROLE_DOOR` and `ADD_CONNECTION_DOOR` from `packages/client/src/lib/connection-roles.ts`, which the Connections nav reads too.

ADR 0036: superseded by `docs/adr/0293-memory-is-off-until-each-user-turns-it-on.md`, which records the off default and the turn-on confirm; the four `D36` code citations now cite D293.

Double failure surface: the first-model step's writes pass `failureShownInline`, so its inline alert is the one surface (`createEntityMutation`). The add dialog's toast-less create twin folded onto the same flag. CT: `tests/client/data/create-entity-mutation.ct.tsx` "failureShownInline".

Em dashes: removed from the reachability lines, the add-connection form and its failure sentences, the interactive cards hint, the assumed-capability source line, the confirm dialog's failure line and the workload dialogs.
