---
kind: plan
status: active
updated: 2026-09-23
---

# Spatial maps: a place the story moves through

## Goal

A chat can carry a map of places (regions down to rooms, linked by paths) that the story moves through, with the model told where the party is and where it can go.

## Shape

Nothing is built beyond the seams it would consume: the rpg fog-of-war map table, scenes over `forkChat`, world info, the per-variant snapshot pattern, the assembly pipeline and the tool loop.

The core concepts:

- **A flat location list linked by `parentId`**, not a nested tree: region, settlement, place, building, floor, room, with graph links whose state is available, hidden or blocked. A definition carries a monotonic revision.
- **History-safe position.** Every visit is an immutable snapshot keyed to the message variant and tagged with the definition revision, the same per-variant delta pattern as rpg snapshots. Expansion only appends locations under a bumped revision; it never rewrites visited history. A fork copies the spatial state.
- **Never-throw movement.** A move returns a result with issue codes, guarded by an optimistic revision check.
- **Projection.** A bounded injection tells the model the current place, the reachable destinations and place memory, with a redacted player view distinct from the owner view.
- **Lore grounding.** Places can activate world-info entries by presence, a new scope over the existing entries.
- **Generation.** A workload drafts a map from lore and expands it, recording whether each place was lore-backed, inferred or invented.

Cost is high: schema, a drafting workload, movement verbs, a projection, location-scoped activation and a map editor.

## Open questions

- Whether to build it at all, and whether it is its own domain or an rpg chunk: `docs/work/0051-spatial-world-maps-program.md`.

## Rejected

- A nested location tree: a flat `parentId` list is reorder-safe and cycle-checkable.
- Mutating visited history when a map is expanded: expansion appends under a new revision.

## Coupled sites

- a new spatial domain or rpg chunk and its contracts
- `packages/db/src/schema/` (forward migrations)
- `packages/server/src/domain/world-info/` (presence activation)
- `packages/server/src/domain/chat/` (the projection injection)
- a map editor and render surface in the client

## Test plan

- Movement tests: blocked and hidden links refuse with issue codes; a stale revision refuses.
- Swipe and fork tests: position follows the selected variant; expansion never changes a visited snapshot.
- A projection test for the owner and player views.
