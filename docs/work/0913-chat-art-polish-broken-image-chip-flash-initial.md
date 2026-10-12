---
kind: work
status: open
updated: 2026-10-11
priority: P3
area: client
---

# Chat art polish: broken-image chip flash, initial scaling proof, chat art side-eye

## What

From the verifier pass on the chat-art lane (items 856, 850, 844, 876, 883). (1) artFailed is per-row useState (message-row\.tsx, ghost-message-row\.tsx), set only after the probe image errors (art-slot.tsx useFailedReport), so a broken image shows the chip then drops it and reflows on every mount, twice at commit; consider caching failed art by url. (2) The fallback-initial size checks in tests/legacy/client/features/chat/surfaces/message-list-surface.ct.tsx (fontSize greater than 12) pass on a fixed glyph; assert the 0.4 to 0.8 slot-ratio rule for every style. (3) A card palette with a custom primary can drop the whisper initial below 4.5:1, since contrast was only proven on default palettes. (4) No rendered review was taken: side-eye the streaming and settled rows in echo, whisper and ripple, broken and missing art, the ripple portrait sharpness on a phone, the short-landscape lightbox and the gallery at 360, on a copy of the owner's container data.

## Why

Small visual regressions and a test that cannot fail; the lane ran only component tests.

## Done when

Each point is fixed or has recorded evidence it does not occur, and a side-eye report is filed.

## Evidence

Filled at landing: what ran and where its output is.
