---
kind: plan
status: active
updated: 2026-09-23
---

# World state: clips, trackers and a reconciled story snapshot

## Goal

Beside the digest memory that remembers what was said, a layer knows what is true: durable clips, in-place trackers and a reconciled story snapshot in a `{{world_state}}` macro.

## Shape

**Already built:** the reserved seams only: the `CLIP_KINDS`, `CLIP_SOURCE_KINDS` and `CLIP_SCOPES` tuples in `packages/contracts/src/memory/index.ts`, and the reserved `reconcile-world-state` workload contribution. Nothing else exists.

The design (D55, D94):

| Layer | Answers | Store |
| - | - | - |
| Clips | what is durably true (typed statements, user-authored or synthesized) | `memory_clips` plus clip embeddings |
| Trackers | what is true right now (named slots that update in place, host-lockable) | `memory_trackers` |
| World-state snapshot | the current story situation (derived prose) | `chat_world_states` |

- Clips and trackers share one kind axis and one provenance axis; never a second tuple.
- **The reconciler derives.** A host-funded, fire-and-forget workload reads settled canon prose, updates synthesized trackers and clips, and rewrites the snapshot. It is watermarked and incremental, with a whole rebuild when a canon hash below the watermark changes (edit, swipe, re-attribution, delete, fork). Synthesized rows are always rebuildable; user-authored and promoted rows and locks are never touched by a rebuild.
- **The RPG line.** RPG trackers are game state written by tools inside the turn; these memory trackers are observed narrative state. No tool writes these tables, and the reconciler never reads rpg tables.
- A fork copies the user stratum and no synthesized rows.
- `{{world_state}}` renders in the dynamic prompt half beside `{{memory}}`, and renders nothing until the first reconcile.

## Open questions

- Build or drop, and how the word tracker divides between this layer and the RPG Tracker: `docs/work/0052-world-state-clips-and-trackers-program.md`.
- The normal-chat Trackers tab in the context pane, which depends on this layer or the steering wave.
- Defaults: `world_state` on in the default prompt config; reconcile once per settled digest block; the facts and snapshot token budgets.

## Rejected

- Separate tracker kind and source tuples: a second spelling of the same axes.
- Incremental-only reconciliation with per-edit patches: a mid-history edit cannot be reconciled against an evolved tracker; a rebuild is the honest answer.
- Re-deriving eagerly on every edit: the watermark check at the next run gives the same correctness with no hot-path work.

## Coupled sites

- `packages/contracts/src/memory/index.ts`
- `packages/db/src/schema/` (the three tables, as forward migrations)
- `packages/server/src/domain/chat/memory/`
- `packages/server/src/domain/workloads/` (the reconciler)
- the assembly macro registry and the default prompt config

## Test plan

- Rebuild-on-hash-mismatch tests for edit, swipe, re-attribution, delete and fork.
- A test that no tool path writes the three tables.
- An assembly test that `{{world_state}}` is empty before the first reconcile.
