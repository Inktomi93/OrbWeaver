---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: client
---

# Design the Corpus rework: fold in Analytics and tag management, and give every artifact a destination

## What

Design the Corpus rework as one proposal, mockups first, for the owner to pick from. It covers:

- The merged layout. Analytics and tag management move into Corpus, placed across list, content and
  context. State whether Analytics leaves the rail. Tags stay labels, and the stats, discovery and tag
  domains stay separate underneath.
- A destination for every listed artifact. Clicking a scheme, memory, arc or distill often does nothing.
  State the detail view, drill-in or action for each artifact type.
- The moment view. A search, arc or memory hit opens readable context and jumps to that moment in the chat.
  `packages/client/src/features/discovery/components/corpus-hit-rows.tsx` opens only the chat.
- Label quality: archetype label collisions, the gem criterion and provenance.
- Search coverage. Discover ranks a capped pool, `DISCOVER_SEGMENT_POOL_CAP` in
  `packages/server/src/domain/search/substrate/constants.ts`. Tell the user what search covers.
- The phone landing. The one-shell rule in `packages/client/src/state/panel-resolve.ts` lands every section
  on its list. Decide whether the analytics dashboard lands on content instead, as one declared exception.

The browse view and the Visuals tab with image facets exist. Build on them.

## Why

Analytics and tags sit apart from Corpus, and several Corpus artifacts are dead ends. The parts depend on
each other, so they need one design.

## Done when

The proposal is in `docs/plans/`, with variants where real choices exist, one recommendation, a map per
pane, and a dead-end inventory taken from the live surfaces. The owner picked a variant, and its build
items are filed.

## Evidence

Filled at landing: what ran and where its output is.
