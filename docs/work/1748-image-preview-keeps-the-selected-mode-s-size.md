---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Image preview keeps the selected mode's size, and a backend that ignores the count tells the user why one image came back

## What

Show a note after a generate with a count above one returns one image because the connection ignores the count. Size and count are already sent: `ImagineOptions` in `packages/client/src/features/imagery/components/imagine-options.tsx` feeds `chat.generateImage`, which maps size and n.

## Why

A single image from a connection that ignores the count reads as a failure unless the screen says why. Today only the pre-spend copy says that some connections make one image. `imagery.extractPrompt` previews a prompt only, takes no size or count and produces no image, and `imagery.editImage` no longer takes size.

## Done when

A component test generates with a count above one against a connection that returns one image and sees a line that says the connection ignored the count. A count the connection honours shows no such line.

## Evidence

Filled at landing: what ran and where its output is.
