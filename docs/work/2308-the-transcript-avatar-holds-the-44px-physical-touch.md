---
kind: work
status: open
updated: 2026-11-09
priority: P3
area: ui
plan: cross-surface-consistency
---

# The transcript avatar holds the 44px physical touch floor below cq-16

## What

Ruling (claude-b under delegation): below cq-16 the avatar keeps the house 44px floor instead of yielding to the 30px chip. A new non-scaling 44px touch token sizes the picture button's pseudo there, and the scroller inset becomes the larger of the tight inset and half the physical floor minus the small avatar size. The lane prototype of 3d8047688a held the reach in all seven chat styles at 320 and 125% text, with no bubble point covered and the 300% word-break case green. This replaces the yield branch landed for 2274.

## Why

An enlarged-text reader keeps the same touch floor as the rest of the room, and the prototype shows the text loses no room for it.

## Done when

Below cq-16 the avatar reach measures at least 44px in every chat style at 320 and 125% text, no bubble point is covered, the platform-text-scale word-break case passes, and the avatar-reach header states the physical floor.

## Evidence

Filled at landing: what ran and where its output is.
