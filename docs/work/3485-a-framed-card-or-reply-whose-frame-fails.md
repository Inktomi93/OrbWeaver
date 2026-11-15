---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# A framed card or reply whose frame fails to load stays behind its forming chip

## What

`packages/ui/src/content/sandbox-frame/sandbox-frame.tsx` lifts the forming chip only when the frame reports a height. When the frame's document request answers with an error status, no height ever arrives, there is no timeout or error exit, and the card never shows. A styled reply's placeholder is held the same way. The card half is on the card parity branch only.

## Why

A reader sees a chip that never resolves where a card or reply should be.

## Done when

A frame that does not report within a stated bound, or whose document fails to load, leaves the chip and shows the card's fallback render or the reply's plain path. A component test serves an error status for the frame document and sees the fallback.

## Evidence

Filled at landing: what ran and where its output is.
