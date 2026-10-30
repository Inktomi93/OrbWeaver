---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
---

# Characters bulk bar count overlaps the Tag button on desktop

## What

On desktop, the Characters bulk bar shows "2 selected" overlapping the Tag button.

## Why

Pre-existing; side-eye found it during the tone review (`reports/side-eye/tone-step1/`).

## Done when

The count and every bulk action are visible and hit-testable at desktop widths, pinned by a CT.

## Evidence

Cause: `SelectionBar` gave its action cluster `min-inline-0` and its root no wrap, so a nowrap group of verbs inside the cluster overflowed toward the start edge and painted over the `N selected` count, or, once the verbs were direct cluster items, wrapped and stranded Delete on its own line.

Fix: `packages/ui/src/primitives/selection-bar/variants.ts` wraps the root and drops `min-inline-0` from the cluster, so a cluster holding one nowrap group has that group as its minimum and the bar moves the whole group below the count, with the dismiss beside it. `packages/client/src/features/character/components/character-bulk-bar.tsx` keeps the three verbs in one `Row`.

Proof: `tests/client/features/character/components/bulk-bar-layout.ct.tsx` mounts the production `AppShell` on Characters, enters Select mode, checks two rows, and asserts the count, Tag, Archive, Delete and Clear are visible, hit-testable at their centre and pairwise non-overlapping, and that the three verbs share one line, at 1280, 1440 and 1920px and at 360 and 390px phone widths. Red on the previous tip at 1280, 1440 and 360px (Delete 38 to 50px below Tag); green after the fix. Chromium run. The regex bulk bar uses the same primitive and has no CT.
