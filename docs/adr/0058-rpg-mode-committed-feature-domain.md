---
kind: adr
status: active
updated: 2026-09-23
---

# RPG mode is a committed feature domain

## Context

Not recorded in the ledger row.

## Decision

RPG mode is a committed Phase-7+ `domain/rpg` feature (the unbuilt remainder is the plan `../plans/rpg/design.md`). Shape: ONE chat turn (RPG context via optional injected gather ops; structured side-effects = D48 tool calls resolved server-side in the same recurse loop; async GM work = WorkloadKinds on the sealed `agentTurn`); typed swipe-safe state (snapshots FK'd to `message_variants`; campaign canon in real tables); the roster IS the party; the GM voice is a cloned preset carried as **`rpg_games.gmPresetId`** consumed via `RpgGatherResult.presetOverride` — NOTHING is ever bound to chats (the owning feature carries the association; neo's chat-binding sin is banned). Rulings: HUD on the content-thread flanks; elemental reactions last + optional; `deathRule: brutal` kills only via per-death host confirm (`rpg.confirmCharacterDeath`, a host verb, never a model tool); the client polish pass is a committed chunk. Game chats require a tool-capable model until the textual-tool-call polyfill ships. `reconcile-world-state` WorkloadKind is claimed by this feature.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
