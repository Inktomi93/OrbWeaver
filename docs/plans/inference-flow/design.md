---
kind: plan
status: active
updated: 2026-10-14
---

# Inference flow: owners, ports and callers

## Goal

Settle how inference flows through the server: which domain owns each table the runtime touches, which port carries it, who decides what, and how every caller reaches the runtime. The law and the code then say the same thing, and each rule has a check.

## Shape

### Reading priority

The main program uses [test-foundation](../test-foundation/design.md) and the [test-mirror inventory](../test-mirror/design.md). This is a coupled side plan, not a replacement for either main plan.

Read both main plans in full before program dispatch or status reports.

Read this plan for runtime dependencies and correctness work scheduled by test-foundation. Report its progress separately from the main program. A required runtime defect still blocks dependent foundation work.

### Execution dependencies

The [test-foundation plan](../test-foundation/design.md) owns the combined program order. Compose cleanup (964) moves runtime ports and reads to owning domains before the server harness (958) is built. Initial Drizzle facts (953) provide shared tenancy and query judgments.

After those batches, prioritize typed every-owner authority (984). Runtime funding, dispatched-material strike-out and identity enforcement are qualified on real composed callers. Settings ownership (967), connection capabilities (968) and law alignment (970) remain tracked production work. Route identity-sensitive changes to the security role.

Stored connection parsing follows ownership checks without losing owner-mismatch detection. The canonical owner-bearing read is integrated. Remaining runtime and wire qualification stays with its active work items. Preserve refusal and accounting semantics; legacy harness repair is not a prerequisite.

### Rulings

1. **The settings table has one writer.** `domain/settings` owns the `settings` table and exposes a prefix-scoped key-value port. Tenant prefixes are a registered tuple; a tenant reads and writes only its own prefix through the port. `domain/connection` builds the runtime's `SnapshotStore` on that port and imports no `settings` table. Tier-1 invariant 6 and Core-0 section 8 say so in one sentence each, and `own-tables-only` checks the write half inside `persistence/` too. The stale `openrouter-model-catalog` key name leaves the schema header and the tests.
2. **`domain/connection` owns its rows and the door.** It writes `user_connections`, `connection_bindings` and the provider rows; it decides write-time admission, servable tasks, the embed-space move check and the credential-free projection. Tier-3b section 3 lists exactly that. Rules the runtime already owns are called, never re-spelled: API coherence, the funding verdict, the task-by-kind table and the local-light wire check.
3. **No domain branches on a wire.** A domain asks the runtime for a capability; it never compares `wire` or `api`. The search fallback snapshot with an untyped `compat` wire is deleted, and the embedding snapshot types its `api` and `wire` from the contract tuples.
4. **Every call is funded and struck out the same way.** Every runtime call path runs the funding verdict and the auth-failure strike-out: the role clients, the pinned embedding snapshot, imagery and rpg. The check lives in one place the executor path cannot skip.
5. **Egress is stated as built.** Provider calls use the runtime's `sdkFetch` through the graph-owned configured-endpoint adapter. URL validation always runs. The firewall toggle controls scoped endpoint admission and physical connector checks. The compose comment states this guard, and security review confirms it.
6. **Compose reads no foreign table.** The runtime's ports and compose's ops read through their owning domains (item 964 moves them). The agent session table gets an owning domain and a persistence factory.
7. **Core-0 section 6 matches Tier-3b.** A connection is a user table; there is no `resolveRole`; roles resolve through the runtime and the role clients.
8. **Knowledge-Cluster states its own exceptions.** The vector-table set is named once, in one count with one definition; the hand-off restamp and the clear, space-state and image-analysis deletes are named exceptions or move into the persistence home.
9. **The owner-agnostic connection lookup is stated.** Tier-3b says the runtime's connection port reads by id and the runtime checks the owner, with the test that pins it.

### Left alone

- The executor's `runAgentTurn` has no server caller; by owner ruling it stays as it is.

## Rejected

Leave the settings table as a shared table any tenant writes directly: it gives up the one-writer rule every other table keeps, and nothing could check a tenant stays inside its prefix.

## Coupled sites

`docs/law/Tier-1-DB.md`, `docs/law/Tier-3b-Providers.md`, `docs/law/Core-0-Architecture-and-Structure.md` sections 6 and 8, `docs/law/Knowledge-Cluster.md`; `packages/inference/src/contract/runtime.ts`; `packages/server/src/domain/connection`, `domain/settings`, `domain/embeddings`, `entry/compose/services.ts`; item 964.

## Test plan

Each ruling lands with its gate or test: a cross-owner write in persistence fails `own-tables-only`; a tenant writing outside its prefix fails the settings port test; a domain comparing a wire fails a gate; a runtime call path that skips the funding verdict fails a test.
