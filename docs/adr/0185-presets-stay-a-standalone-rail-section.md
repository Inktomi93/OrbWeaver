---
kind: adr
status: active
updated: 2026-09-23
---

# Presets stay a standalone rail section

## Context

Presets is a `SectionDefinition` in `packages/client/src/features/preset/lib/presets-section.tsx`, a peer of `config` in `SECTION_IDS` (`packages/client/src/state/section-ids.ts`). The Configuration workspace takes libraries through `CollectionContribution` (`packages/client/src/lib/collection-contracts.ts`). Moving presets there looks like one array member. It is not.

## Decision

Presets stay a standalone rail section. The collection seam cannot carry three things the presets section needs: a context readout that projects by the active editor view, with a real state with no preset selected (the active preset's effective profile) — `CollectionContext` renders only for a selected member; a live context header component — `CollectionContext` has only a static title; and its own panel defaults, with both panels docked — a collection has no panel defaults, and the config section owns them for every collection. To move presets into the config rail, first add these three fields to `CollectionContribution`. Then convert `presetsSection` and delete the standalone section in the same change.

## Consequences

Presets keep their view-projected readout and docked posture. Configuration stays a member-keyed host. A request to add presets as one array member is a seam change and needs its own design.

## Alternatives rejected

Register presets as a `CollectionContribution` as the seam stands. The readout becomes a member-keyed body with a static title, and the docked readout default is lost. Extend the seam now for a later move. The new fields have no committed consumer.
