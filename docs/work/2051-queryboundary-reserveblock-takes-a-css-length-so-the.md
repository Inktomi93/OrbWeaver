---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-afb5bff2b14113d1d
plan: cross-surface-consistency
---

# QueryBoundary reserveBlock takes a CSS length so the picker box needs no render probe

## What

pickerWindowBox resolves its size by probing the DOM in a render initialiser, like the useFirstBootBox sites. A render-free version needs QueryBoundary.reserveBlock to accept a CSS length, which changes the data-tile-reserved vocabulary.

## Why

A DOM probe in render is fragile, and a reserved box should come from a token.

## Done when

reserveBlock accepts a length, and the picker and boot boxes read no DOM in render.

## Evidence

Every boot-box site passes its row count: useFirstBootRows returns the count and QueryBoundary reserveRows builds the length from tokens (skeletonLengthFor) and refills the skeleton to the count, so no render reads the document at the 17 client sites. New chat reserves PICKER_FIRST_OPEN_BOX, a token length. Held by tests/client/components/skeleton-reservation.ct.tsx (declared length equals the painted skeleton at scales 0.8 and 1.25, fine and coarse pointer, with owner CSS) and tests/client/features/config/surfaces/first-boot-boxes.ct.tsx (each group settles within half a row of the box it declared). The measured-box path still resolves the row pitch through the document once a device has a remembered pixel box.
