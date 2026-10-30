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

Points 1, 2 and 3 are done. Point 4 stays open: a side-eye pass needs the side-eye role and a copy of the owner's data, and a lane cannot spawn one.

- Point 1, done. The art-failure state moves out of the row into an external store keyed by art URL (`packages/client/src/features/chat/lib/failed-art.ts`; the transcript is windowed, so a row's own state was lost on every remount). `useSlotImage` in `packages/client/src/features/chat/components/art-slot.tsx` reads it with `useSyncExternalStore`, so a remounted row renders the fallback from its first frame and does not request the broken image again. The store clears and each mounted slot asks again when the window gets an `online` event or the document returns to `visible`, when the art asks for a different URL (another slot width), and on reload; there is no timer. Tests: `tests/client/features/chat/components/platform-failed-art-memory.suite.ct.tsx` (component test; production room through `ChatRoomShellStory`; the portrait route answers 404). One case remounts the room and samples every animation frame for the speaker's chip and the broken URL's requests. Two cases fail a URL, let the route succeed, dispatch `online` or `visibilitychange`, and wait for the portrait to load and its fallback letter to go. Red on the old source (the chip frame; both recovery cases), green after, in Chromium and WebKit. The remount is a story `update()` to another room and back, which unmounts the rows as windowing does. The failed report stays a layout effect: as a plain `useEffect` the frame case fails in WebKit (one painted frame with the chip), so a case does see the effect kind.
- Point 2, done. `tests/client/features/chat/components/platform-art-fallback-initial.suite.ct.tsx` gives both speakers no avatar image and asserts the initial's font size over the slot's shorter side is between 0.4 and 0.8 in echo, whisper and ripple at 1440 and 390 px. A tightened bound fails it (control): whisper's band reads 0.70.
- Point 3, done. A custom primary of `#808080` put the second speaker's initial at 3.53:1 in echo, whisper and ripple. `packages/ui/src/primitives/avatar/hue.ts` now mixes each bucket toward the lightness extreme opposite `--color-primary-foreground`, so a fill can only gain contrast against its ink. Hearth's buckets lighten slightly, as ruled. The same suite measures the initial against its slot's fill for `#f5e663`, `#1a1a40`, `#808080`, `#ff00ff`, `#00ffff`, `#ffffff` and `#000000` in all three styles: 21 cases, red on the old hue steps (3 failed), green after.
