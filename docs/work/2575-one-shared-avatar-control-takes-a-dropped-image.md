---
kind: work
status: open
updated: 2026-11-11
priority: P2
area: client
plan: cross-surface-consistency
---

# One shared avatar control takes a dropped image and shows progress and failure in place

## What

The persona editor and the character hero band each carry their own avatar upload: the avatar is a button that opens a file picker, uploads and saves at once (AvatarTrigger in packages/client/src/features/persona/components/persona-editor.tsx, and the upload in packages/client/src/features/character/components/character-hero-band.tsx). Neither accepts a dropped image, neither shows anything on the avatar while the upload runs, and a failure or an oversize file is a toast. The unrendered bound avatar field had a drop zone and inline loading, success and failure, but it binds to a form with a save step and fits neither surface.

## Why

The same action is built twice and both copies report failure away from the control, against the ruling that a failure shows in place. Dragging a picture onto an avatar is the gesture a person tries first.

## Done when

One avatar upload control in a shared home serves the persona editor and the character hero band. It opens the picker on click and accepts a dropped image, shows progress on the avatar while the upload runs, and shows an oversize or failed upload as an inline message linked to the control, with no toast. It keeps the character control's rule for both surfaces: the new picture and its confirmation appear when the write commits, not when the upload completes, and a refused write keeps the old picture. A component test per surface drops a file, holds the upload, fails the upload, refuses the write, and asserts each state through the production surface. A rendered review has read both at desktop and phone widths. The two per-feature copies are deleted in the same commit.

## Evidence

Filled at landing: what ran and where its output is.
