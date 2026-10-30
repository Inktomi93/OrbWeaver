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

Cause: `CharacterBulkBar` wrapped its three verbs in a `Row`, which does not wrap, inside the `SelectionBar` action cluster (`flex-1 flex-wrap justify-end min-inline-0`). The row's min-content is the three buttons side by side, so in the docked list pane it overflowed the cluster toward the start edge and painted over the `N selected` count.

Fix: `packages/client/src/features/character/components/character-bulk-bar.tsx` renders the buttons as direct items of the cluster, so the cluster's own wrap stacks them when the pane is narrow. No primitive or CSS change.

Proof: `tests/client/features/character/components/bulk-bar-layout.ct.tsx` mounts the production `AppShell` on the Characters section with the list docked, enters Select mode, checks two rows, and asserts the count, Tag, Archive, Delete and Clear are visible, hit-testable at their centre and pairwise non-overlapping at 1280, 1440 and 1920px wide. Red on the old bar at 1280px (the count and Tag boxes intersect); green after the fix. The wider widths were already clear on the old bar, since the docked pane is wide enough there. Chromium run.
