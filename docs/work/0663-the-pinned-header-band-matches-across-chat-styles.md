---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: ui
---

# The pinned header band matches across chat styles on touch

## What

On a coarse pointer the sticky band shows 16 px of fill under the name against tide's 8 px, and the action rail ends flush with the body (message-row-header.tsx comment near the frame is stale). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

The pinned band height matches across styles on touch and the comment is current.

## Evidence

Not reproduced on the current tree. At 390x844 with a coarse pointer, every speaker-naming style pins a band whose fill under the action rail is one `--spacing-row` step, never flush with the body, and a single-line band holds the same fill under the name in tide as in the other styles. The frame comments in `packages/client/src/features/chat/components/message-name-row-frame.tsx` match the code.

A band whose rail wraps under the identity is taller (bubble, echo and ripple at 390px). That follows the card's width and is the documented wrap of the rail, not a style difference.

Pinned by `tests/client/features/chat/components/platform-pinned-band-height.suite.ct.tsx` (component test; mounts the production room through `ChatRoomShellStory`): 7 passed in Chromium and 7 in WebKit.
