---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Section switches wait for blank fallbacks and animate the skeleton reveal

## What

packages/client/src/lib/view-transition.ts destinationSettled waits for data-slot=skeleton to clear, but a blank fallback with no skeleton (the Presets welcome-to-Default pane) is not waited for, and the skeleton-to-content reveal after a crossfade is a hard pop. Wait on a destination-ready signal that covers blank fallbacks, and fade the reveal with the section motion tokens, honouring reduced motion.

Ruling: a destination surface declares readiness by rendering `data-ready` on its root once its first query settles (data, empty or error). The section swap waits for `[data-ready]` on the incoming root, holding the outgoing view, with the existing navigation timeout as the bound. A surface that already renders a skeleton keeps it, and the readiness marker replaces the blank fallback only. The reveal fade lives in `packages/client/src/features/app-shell/surfaces/shell/motion.css` on the section motion tokens.

## Why

Side-eye on 866 found first visits fade onto an empty or skeleton pane and then pop; the 866 lane fixed the readiness gate but not these two cases.

## Done when

First visits to Presets, Chats, Characters and Refinery on owner data crossfade straight to content or fade the reveal; a CT pins the blank-fallback wait; reduced motion stays instant.

## Evidence

- Shape: a surface declares `data-ready="false"` while its first read is out and `"true"` once it settles (data, empty or error), on a root that persists across the read.
- `packages/client/src/lib/view-transition.ts` `destinationSettled` also waits for `[data-ready="false"]` in the content pane and an open list pane, inside its existing deadline. `packages/client/src/features/app-shell/surfaces/shell/motion.css` makes a not-ready surface transparent and fades it in on `--motion-base` and `--ease-out-expo`; a surface that mounts ready never fades, and the reduced-motion floor removes the transition.
- Census: `useQuery(` in `packages/client/src/features` is 151 matches in 106 `.tsx` files (ast-grep `-l tsx`; none in `.ts` that render a surface). Most section content and list surfaces suspend behind a `QueryBoundary` with a skeleton the swap already waited on: Chats, Characters and Refinery first visits, Corpus home and the analytics surfaces. Three families render blank or return `null` before a first read and now declare the marker: the Presets welcome pane (`preset-library-welcome.tsx`), the Databank welcome pane (`databank-detail-surface.tsx`, which returned `null` while the census read was out) and the Plugin pages empty pane (`extensions-page-surface.tsx` through `useExtensionsEmpty`, whose view gained `settled`).
- Tests, `tests/client/features/app-shell/surfaces/section-swap-ready.ct.tsx`, one case pair per family holding its first read (`preset.list`, `databank.bankHealth`, `plugin.list`): the swap does not settle on the unsettled pane inside its deadline, and the pane shows once the read lands; with reduced motion no transition starts and the pane waits transparent for its read. The Presets pair was red on the old swap (it settled at 43, 83 and 70ms with the pane still `data-ready="false"`). The other pairs are red by absence of the marker on the old source.
- The swap has no injection seam: `destinationSettled` reads `setTimeout`, `performance.now` and its 150ms deadline as module globals, and a paused page clock stalled the read's own timers. The test keeps the read pending through a promise it resolves only after the swap has given up, so the deadline is what ends the swap; the bound it asserts (held past 100ms) is the one exposed value.
- The test no longer reads the wall clock. The swap's deadline is the frame's `--shell-swap-deadline` (`shell/grid.css`), so a case states it: with 600000ms the swap can end only on the pane's readiness. Each case holds the first read, waits a count of painted frames (far past the few polls a swap that ignores `data-ready` needs), asserts the swap has not settled, releases the read, then asserts it settles on `data-ready="true"` and the pane is opaque. Reverting the selector clause that names `data-ready` fails all three families (the swap settles with the pane still `false`).
- Each destination's list is collapsed and the swap starts from Chats, so a list skeleton or Home's own tile reads cannot hold the swap to its deadline: the content pane's readiness is the only thing it waits for. That is what lets the Databank case tell the new wait from the skeleton wait.
- Offline: readiness is `isLoading` (a read in flight), so a read paused offline counts as settled and the pane paints its own copy. `platform-overflow-room.suite.ct.tsx` holds each family offline (Presets and Plugin pages failed on the previous tip).
