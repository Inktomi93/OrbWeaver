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

Ruling ([D337](../adr/0337-owner-built-statements-join-another-domains-batch.md)): the atomic cases (admin and sessions, chat and stats, `emptyMemoryScope`, the rpg and handoff statements) are ruled by name in D337's table. Chat's `AssetsContext`, `RegexContext` and `ChatContext` uses by chat, discovery and persona carry no handle; their op types move to contracts or the consumer's `contract/`. Databank and discovery no longer import `EmbeddingsService`. Remaining work: the census tuple and its equality test, each ruled op's type moved out of the owning domain's import, and the handle-free type moves.

## Why

A handle across domains means one domain writes or reads another's tables, which `docs/law/Core-0-Architecture-and-Structure.md` §4 forbids without an injected op. Item 1439's census lists each case as `db-handle-review`, and the derived-port rule cannot reach zero until each is ruled or removed.

## Done when

Every listed case is either covered by a ledger row with its batch assembled at the composition root, or rewritten as an injected op with no handle. `pnpm unwired ports` reports zero unruled `db-handle-review` targets, and each change keeps its domain tests green.

## Evidence

- `tooling/src/unwired/ruled-ops.ts` holds the D337 table's ops and the D259 signup statements, each group with its citation. `tests/tooling/unwired/ruled-ops.test.ts` holds the D337 group equal to the table and the D259 group to D337's citation.
- The census resolves each handle-carrying type and each server alias to the op members it types, and the cross-domain classifier looks through op aliases. `pnpm unwired ports` reports every listed case as `ruled` and no `db-handle-review` target; the output is `reports/unwired/port-targets.json`.
- Chat's `AssetsContext`, `RegexContext` and `ChatContext` uses carry no handle, and no domain imports another: whole-tree `pnpm depcruise` passes with the narrowed `domain-no-cross-feature`.
- Rpg's chat ops no longer import `ChatRpgOps`. Each op, including the ruled `planGameBirth` and `handoffHealStatements`, is typed by an `@orb/contracts/chat` op type with the statement handle as a type parameter.
