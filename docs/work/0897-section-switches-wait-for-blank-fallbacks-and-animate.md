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

- Built to the ruling, with one shape change: a surface declares `data-ready="false"` while its first read is out and `"true"` once it settles (data, empty or error), rather than adding the attribute only when ready, so the swap can tell a surface that has no skeleton from one that is waiting.
- `packages/client/src/lib/view-transition.ts` `destinationSettled` now also waits for `[data-ready="false"]` in the content pane and an open list pane, bounded by its existing deadline. `packages/client/src/features/app-shell/surfaces/shell/motion.css` makes a not-ready surface transparent and fades it in on `--motion-base` and `--ease-out-expo`; a surface that mounts ready never fades, and the reduced-motion floor removes the transition.
- Wired on the Presets welcome pane (`preset-library-welcome.tsx`), the blank fallback the item names.
- Test: `tests/client/features/app-shell/surfaces/section-swap-ready.ct.tsx` holds `preset.list` while swapping Home to Presets. Red on the old swap (it settled at 43, 83 and 70ms with the pane still `data-ready="false"`), green after (8 of 8 over four runs). A second case pins reduced motion: no view transition starts, the pane stays transparent until the read lands, then shows.
- Open: the Chats, Characters and Refinery first visits paint skeletons the swap already waited on, so none needed the marker; a surface with a blank fallback of its own wires `data-ready` the same way.
