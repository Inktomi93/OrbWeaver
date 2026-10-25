---
kind: bug
status: open
updated: 2026-10-25
priority: P3
area: client
---

# Home resume titles fit long unbroken room names at phone width

## What

The HomeHearthRoom focal title in `packages/client/src/features/chat/components/home-hearth-room.tsx` uses line-clamp-2 without a long-word breaking treatment. A synthetic phone capture shows an unbroken room-name fragment clipped at the title's right edge. The component header promises clamping rather than truncation. This is a current rendered observation; attribution to the CSS closeout is unproven.

## Why

The title identifies the room being resumed. A long supported name must stay within its reading box without hiding the meaningful subject.

## Done when

Preserve the ruled two-line budget and complete accessible Resume name. Make long supported words fit through appropriate wrapping or another ruled treatment. Verify ordinary and long room names at phone and desktop widths through the real Home surface. Assert title geometry and accessible identity; do not replace the name with invented copy or introduce a global Row wrapping rule.

## Evidence

Filled at landing: what ran and where its output is.
