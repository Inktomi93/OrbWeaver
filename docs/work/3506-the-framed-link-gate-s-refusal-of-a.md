---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# The framed link gate's refusal of a stale focus holder depends on blur ordering measured only in one browser

## What

`packages/ui/src/content/sandbox-frame/` counts a link only from a frame the focus gate admitted. Refusing a frame that held focus earlier assumes the app's blur fires in the same task that moves the active element. That is measured for in-process frames in Chromium. Frames in another process and Gecko are not measured. If the order differs, a stale holder's link raises the confirm, which still shows the true host with Cancel focused.

## Why

The law and headers should claim the gate only where it is measured.

## Done when

The refusal does not depend on blur ordering, or the order is measured in Gecko and for a frame in another process, and D354 states where the gate holds.

## Evidence

Filled at landing: what ran and where its output is.
