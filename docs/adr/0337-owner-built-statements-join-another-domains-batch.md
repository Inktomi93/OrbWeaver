---
kind: adr
status: active
updated: 2026-10-30
---

# A domain joins another domain's batch only through an owner-built statement this row names

## Context

Some writes must commit atomically across two domains, and `db.transaction` is banned in product code, so one `db.batch` is the only atomic unit ([D259](0259-signup-invites-mint-account-and-persona-in-one-gated-batch.md)). Item 1446 found unexecuted statements, SQL guards and batch handles crossing domains with no ruling for most of them.

## Decision

A database handle crosses a domain boundary only as an owner-built statement, guard or batch op that this table names. The domain that owns the tables builds the statement; the other domain places it in its batch and never builds SQL against a foreign table. Each op's type lives in `packages/contracts` or the consumer's `contract/`, never imported from the owning domain, and the composition root wires it. Any other cross-domain need is an injected op that carries no handle and returns data.

| Op | Owner builds | Joins the batch of | Why the writes commit together |
| - | - | - | - |
| `localUserInsertStatement` | sessions | admin's audited create | [D257](0257-handles-compare-on-one-unicode-key.md): the user and its audit row land together |
| `revokeAllForUserStatement` | sessions | admin's audited password reset and disable | A new password or a disable never stands beside the old live sessions, and the audit row lands with it |
| `linkExternalIdStatement` | sessions | admin's audited SSO bind | The bind and its audit row land together or not at all |
| the stats batch ops (`StatsBatchWiring`) | stats | chat's committed turn | Rollups and the canon-version marker commit with the canon write they count, so a rebuild never double counts |
| `emptyMemoryScope` | chat (a `SQL` guard) | embeddings' space promotion and retire | The guard evaluates inside the batch, so no chat gains memory between the check and the delete |
| `planGameBirth` | rpg | chat's creation batch | [D264](0264-roster-preset-carries-a-game-template.md): a failed birth leaves no room |
| `handoffHealStatements`, `restampHandoffDigests`, `copyHandoffBooks`, `copyHandoffRegexScripts` | rpg, embeddings, world-info, regex | chat's handoff swap | [D131](0131-a-host-handoff-carries-an-opt-in-class.md) (D): the room moves in one atomic batch |
| `rpgRestoreStatement` | rpg | chat's restore | The game state restores with the message it belongs to |
| `NotificationsEmitOp` coStatements and `claimStatement` | chat | notifications' emit | A notification and the chat write it announces commit together, so no notice points at an unsaved row and none is lost |
| `reseatPersonaSeatsStatement` | chat | persona's delete | [D315](0315-persona-pointers-one-writer-pin-read-through-chat.md): the seats move off the persona in the batch that deletes it, so no seat switched onto it before the commit is left empty |

The signup statements stay under D259. A new joint batch needs a new row here before its op lands. `pnpm unwired ports` reads the ruled ops from one tuple in `tooling/src/unwired/`, and a test holds that tuple equal to this table, so an op absent from the table reports as `db-handle-review`.

## Consequences

Each listed op keeps its handle and its composed wiring; only its type home moves to contracts or the consumer's `contract/`. The census reaches zero unruled handle targets. A reviewer reads one table to know which cross-domain writes are atomic by design.

## Alternatives rejected

- An interactive `db.transaction` across domains: banned in product code, and on the local file it holds the one connection until it settles (`docs/law/Tier-1-DB.md`).
- Replacing every joint write with two front-door writes: it leaves a visible partial state in each listed case.
- One ledger row per op: the rule is one rule; the table is its registry.
