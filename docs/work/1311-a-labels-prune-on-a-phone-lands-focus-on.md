---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
---

# A Labels prune on a phone lands focus on More tag actions, not the finder root

## What

After Prune unused tags and its confirm, focus lands on the overflow trigger instead of the labels finder root. `pruneFinalFocus` in `packages/client/src/features/tag/components/tag-collection-rows.tsx:149-156` calls `libraryOrFinder().focus()` while the confirm dialog still holds the background inert, so the focus does not stick; it returns `true` and Base UI falls back to the trigger. `deleteFinalFocus` beside it appears to have the same shape.

## Why

Keyboard and screen-reader users lose their place after a prune.

## Done when

Focus after a prune and after a delete lands on the finder root, proven by a CT on the focus handoff with a control that fails on the current early focus call.

## Evidence

- `tests/client/features/tag/surfaces/labels-final-focus.ct.tsx` drives the prune and the row delete on the production Labels finder at 390 coarse, by mouse and by touch. All four land on the finder root on the unmodified source, so the defect does not reproduce on the finder alone. The What section's inert mechanism is unconfirmed: Base UI 1.9 marks the background `aria-hidden` and `data-base-ui-inert`, not `inert`.
- Control: both confirms returning Base UI's default focus (`finalFocus` answering `true`) fail all four cases, so they catch the observed landing.
- Open: the e2e saw it in the phone shell over the corpus Labels mode, where the user-bus refetch of the tag list races the confirm's close. A CT reproduces it only with the shell and that refetch.
- The shell CT cannot time that refetch. `usePruneUnusedTags` and the row delete are `busDriven` (`packages/client/src/components/tag-mutations.ts`), so the list refreshes only on the user channel's tag event. The CT socket stub (`routeOrbSocket`) replays a fixed frame script on each connect, so it cannot deliver the event after the confirm's click, which is the race the e2e saw. The red-first repro belongs in the corpus e2e phone project, where the bus is live; the fix follows it there.
