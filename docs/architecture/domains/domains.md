# Orbweaver — domain index

> **This is the index.** Each domain follows the 8-slot template in `Core-0-Architecture-and-Structure.md`.
> For the full domain inventory table (origins, ownership, the neo→orbweaver map), see `AGENTS.md §7`.
> For per-domain architecture specs, read the individual files listed below.

## Core domains

| Domain                               | File                                                               | Phase                              |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------- |
| **chat**                             | [chat.md](chat.md)                                                 | 5 (built whole, last)              |
| **character**                        | [character.md](character.md)                                       | 4                                  |
| **persona**                          | `packages/server/src/domain/persona/` (gutted — code is the doc)                                           | 4                                  |
| **preset**                           | `packages/server/src/domain/preset/` (gutted — code is the doc)                                             | 4                                  |
| **world-info**                       | `packages/server/src/domain/world-info/` (gutted — code is the doc)                                     | 4                                  |
| **connection**                       | [connection.md](connection.md)                                     | 4 — NEW; absorbs `models`          |
| **credentials**                      | [credentials.md](credentials.md)                                   | 4                                  |
| **tag**                              | `packages/server/src/domain/tag/` (gutted — code is the doc)                                                   | 4                                  |
| **embeddings**                       | [embeddings.md](embeddings.md)                                     | 4 — NEW; the ONE vector write path |
| **search**                           | [search.md](search.md)                                             | 4                                  |
| **discovery**                        | [discovery.md](discovery.md)                                       | 4 — rename of `corpus`             |
| **memory**                           | [memory.md](memory.md)                                             | 5 (subsystem of chat)              |
| **stats**                            | BUILT — code is source: `packages/server/src/domain/stats/`; seam: [stats-discovery-seam.md](../proposed/stats-discovery-seam.md) | 4 — doc gutted 2026-07 (code truth) |
| **buddy**                            | [buddy.md](buddy.md)                                               | 5                                  |
| **settings**                         | [settings.md](settings.md)                                         | 3                                  |
| **sessions**                         | `packages/server/src/domain/sessions/` (gutted — code is the doc)                                         | 3                                  |
| **admin**                            | `packages/server/src/domain/admin/` (gutted — code is the doc)                                               | 3                                  |
| **import**                           | [import.md](import.md)                                             | 4                                  |
| **export**                           | [export.md](export.md)                                             | 4                                  |
| **assets**                           | [assets.md](assets.md)                                             | 4                                  |
| **workloads**                        | [workloads.md](workloads.md)                                       | 4                                  |
| **participants / agents / identity** | [participants-agents-identity.md](participants-agents-identity.md) | 5                                  |
| **notifications**                    | [notifications.md](notifications.md)                               | 5                                  |

## Phase 7 domains (post-chat additive grafts — D47/D48/D49)

| Domain          | File                             | Notes                                                                   |
| --------------- | -------------------------------- | ----------------------------------------------------------------------- |
| **imagery**     | [imagery.md](imagery.md)         | chat-facing image gen, prompt-template modes, `/imagine` via automation |
| **tool-use**    | [tool-use.md](../proposed/tool-use.md) _(→ proposed, unbuilt/reconcile)_       | ONE tool registry → two wire projections; structured output             |
| **databank**    | [databank.md](../proposed/databank.md) _(→ proposed, unbuilt/reconcile)_       | document-RAG; `@orb/kit/chunk`; `infra/extraction`                      |
| **expressions** | [expressions.md](../proposed/expressions.md) _(→ proposed, unbuilt/reconcile)_ | character sprites + classify-per-turn; background = D44 token           |
| **gallery**     | [gallery.md](../proposed/gallery.md) _(→ proposed, unbuilt/reconcile)_         | gallery v1+v2 on `domain/assets`; animated-detect; token-counter        |

## Phase 8 domains (scripting / automation / extensibility — D46)

| Domain         | File                           | Notes                                                                     |
| -------------- | ------------------------------ | ------------------------------------------------------------------------- |
| **automation** | [automation.md](../proposed/automation.md) _(→ proposed, unbuilt/reconcile)_ | Tier 1 declarative rules + Tier 2 QuickJS plugin host; variable substrate |

## Proposed (staging, not yet law)

See [`proposed/`](proposed/) for the source evidence base each promoted domain was built from.
