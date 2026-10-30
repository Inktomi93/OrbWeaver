---
kind: work
status: open
updated: 2026-10-11
priority: P3
area: client
---

# Chat art polish: broken-image chip flash, initial scaling proof, chat art side-eye

## What

From the verifier pass on the chat-art lane (items 856, 850, 844, 876, 883). (1) artFailed is per-row useState (message-row\.tsx, ghost-message-row\.tsx), set only after the probe image errors (art-slot.tsx useFailedReport), so a broken image shows the chip then drops it and reflows on every mount, twice at commit; consider caching failed art by url. (2) The fallback-initial size checks in the message-list-surface CT, a [restoration register](../plans/restoration-register/design.md) entry (fontSize greater than 12) pass on a fixed glyph; assert the 0.4 to 0.8 slot-ratio rule for every style. (3) A card palette with a custom primary can drop the whisper initial below 4.5:1, since contrast was only proven on default palettes. (4) No rendered review was taken: side-eye the streaming and settled rows in echo, whisper and ripple, broken and missing art, the ripple portrait sharpness on a phone, the short-landscape lightbox and the gallery at 360, on a copy of the owner's container data.

## Why

Small visual regressions and a test that cannot fail; the lane ran only component tests.

## Done when

Each point is fixed or has recorded evidence it does not occur, and a side-eye report is filed.

## Evidence

Open points 1, 3 and 4; point 2 is done.

- Point 2, done. The fixed-glyph test is gone with the legacy suite. `tests/client/features/chat/components/platform-art-fallback-initial.suite.ct.tsx` (component test; production room through `ChatRoomShellStory`; art styles derived from `MESSAGE_ROW_SKINS`) gives both speakers no avatar image and asserts the initial's font size over the slot's shorter side is between 0.4 and 0.8 in echo, whisper and ripple at 1440 and 390 px. A tightened bound fails it (control): whisper's band reads 0.70. Green: 6 passed in Chromium and 6 in WebKit.

- Point 3, reproduced; fix is a ruling fork. With a custom primary of `#808080`, the second speaker's fallback initial measures 3.53:1 (ink rgb 21,21,21 on fill rgb 109,109,109) in echo, whisper and ripple; the other 18 primary and style cases (`#f5e663`, `#1a1a40`, `#ff00ff`, `#00ffff`, `#ffffff`, `#000000`) clear 4.5:1. Cause: `packages/ui/src/primitives/avatar/hue.ts` darkens every bucket by up to 0.085 lightness (an owner-ruled darken-only window), which lowers contrast when the ink is dark on a mid primary. A fill that moves away from the ink (mix toward the lightness opposite of `--color-primary-foreground`) cannot lower the pair's contrast, but it lightens Hearth's buckets, so it needs the owner's ruling. The measuring test is not committed because it would fail.

- Point 1, not changed. A failed-art cache keyed by avatar hash removes the chip flash on remount, but a transient network failure would then hide a good image for the session. The cache lifetime is a design call.

- Point 4, not done. A side-eye pass needs the side-eye role and a copy of the owner's data; a lane cannot spawn one.
