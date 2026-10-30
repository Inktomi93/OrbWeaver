---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: architecture
---

# Rule or remove the cross-domain database handle passing the port census found

## What

One domain passes a database handle (`StatementToken`, `SQL`, `BatchHandle`, `DatabaseHandle`, `DbAssemblyInput`) into another with no ledger row ruling the joint write or read. For each case, either write a ledger row that rules the joint batch and move its assembly to the composition root, or redesign it into an injected op that carries no handle.

- Admin commits `SessionsService.revokeAllForUserStatement` (resetPassword, setEnabled) and `linkExternalIdStatement` (SSO bind) in its own audited batches. D257 rules only `localUserInsertStatement`.
- Chat imports stats' `StatsBatchWiring` (`packages/server/src/domain/chat/contract/generation-observation.ts:10`, `contract/wiring.ts:2`).
- Chat imports `AssetsContext` (`verbs/load-chat-asset-refs.ts:7`, `verbs/load-co-participant-owner.ts:7`) and `RegexContext` (`verbs/resolve-room-display-policy.ts:8`).
- `emptyMemoryScope` passes `SQL` between chat (`contract/bound-backfill.ts:7`) and embeddings (`contract/reindex.ts:36`).
- Databank (`contract/service.ts:37`) and discovery (`contract/service.ts:30`) import `EmbeddingsService` with `SQL`.
- Discovery (`verbs/resolve-owned-distillates.ts:3`) and persona (`verbs/resolve-connected-persona.ts:7`, `verbs/resolve-user-publics.ts:9`) import `ChatContext`.
- Rpg chat-ops (`packages/server/src/domain/rpg/chat-ops/index.ts:19`) take `ChatRpgOps`/`RpgTurn` with `StatementToken`. D264 rules only the game birth.

Ruled already, so out of scope: D259 (signup statements), D264 (rpg game birth), and D257's `localUserInsertStatement`.

## Why

A handle across domains means one domain writes or reads another's tables, which `docs/law/Core-0-Architecture-and-Structure.md` §4 forbids without an injected op. Item 1439's census lists each case as `db-handle-review`, and the derived-port rule cannot reach zero until each is ruled or removed.

## Done when

Every listed case is either covered by a ledger row with its batch assembled at the composition root, or rewritten as an injected op with no handle. `pnpm unwired ports` reports zero unruled `db-handle-review` targets, and each change keeps its domain tests green.

## Evidence

Filled at landing: what ran and where its output is.
