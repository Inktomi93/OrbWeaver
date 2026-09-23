---
kind: adr
status: active
updated: 2026-09-23
---

# HOME tiles keep a static order; no conditional promotion

## Context

A review asked that the Databank tile float above the section-jump grid while the bank has documents needing attention. The signal is query data, so it is not known at first paint, and the home surface sorts a door-frozen tile list.

## Decision

HOME tiles keep the pure `(order ?? 0, id)` sort in `packages/client/src/features/home/lib/order-home-tiles.ts`; no tile is promoted by data. The attention signal stays where the tile already shows it: danger-toned chips that deep-link to the wedged documents.

## Consequences

The home surface has no ordering concept beyond `order`, and no tile moves after its read lands, so the first-paint layout-shift fix on this surface holds. A future tile that needs attention says so inside its own body.

## Alternatives rejected

- A `useOrder` hook with a sort stage in the parent: the parent needs every order before it renders, which forces hooks in a map or an effect that lifts state and reflows.
- CSS `order` on the grid item: the painted order diverges from DOM and tab order (WCAG 2.4.3, Focus Order).
- A synchronous per-device promotion store read at first commit: an effect publication, an asymmetric demote shift after a fix, and a new ordering concept on a shared surface for one tile.
- Any data-driven promotion: it moves a full-span tile after the read lands, the same layout-shift defect the surface box reservation already fixed.
