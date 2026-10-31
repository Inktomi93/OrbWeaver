---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: tests
plan: test-foundation
---

# Opening a room in the enlarged-text suite sometimes finds no Message field on WebKit

## What

In tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx on WebKit, about one full run in four fails when the Message textbox is not found right after the room opens (seen on the 300% phone Jump to latest case and once on the 200% desktop case); the same case passes 6 of 6 alone.

## Why

The room-open step waits on something other than the room's own readiness, so a slow mount fails the case.

## Done when

The room-open helper waits on the room's real ready signal; the suite passes 20 of 20 full WebKit runs.

## Evidence

Reproduced on the old helper: `pnpm test:ct:webkit platform-text-scale.suite.ct.tsx` at `--repeat-each=4` failed 2 of 104 (room at 200% text on the desktop, Jump to latest at 300% layout on the desktop); a room-only repeat failed 1 of 150. Both: the Message textbox never appeared and the content pane read "No chat selected" with the chat rows present.

Cause (test defect, not a missing ready signal): `openFirstRoom` pressed the Chats rail entry although the boot already lands in Chats. A rail press on the active section still raises a view transition (`setActiveSection` through `withContentSwap`), and the row press landed inside it. An init-script trace of the failing case read `click svg[]` on the rail, `vt-start`, `vt-update-begin` 16 ms later, then `pointerdown` on the row's title and `pointerup` and `click` on `HTML`: the pointer was released over the transition's overlay, so the click never reached the row and the room never opened. Adding any extra round trip before the press (an evaluate for diagnostics) hid it for 300 of 300 runs, which is the shape of a race against the transition.

Fix: the helper drops the redundant rail press and waits on the shell's own `data-section="chats"` before pressing the row. No delay, retry or raised timeout.

After: the whole suite on WebKit, `--repeat-each=20 --workers=3`, passed 520 of 520 (21.3 min).
