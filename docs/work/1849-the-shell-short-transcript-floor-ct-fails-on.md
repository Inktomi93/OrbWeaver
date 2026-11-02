---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: client
plan: cross-surface-consistency
---

# The shell-short transcript floor CT fails on main at 844x190: the probe reads 0px where the floor is 160px

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

`tests/support/browser/platform-shell.suite.ct.tsx:126` fails 3 of 3 alone in Chromium on main e192df303e: `expect(probed).toBe("160px")` receives "0px" at line 146. The whole CT run on that tree: 2,282 passed, 2 failed. The other failure, `tests/ui/primitives/message-list/scrollport-lifecycle.ct.tsx:74`, passed 3 of 3 alone. Suspect the short-regime merge (3ba26115be) or 1815 (0a81a0ca06).

- Cause: the probe builds the room's old nesting, the transcript box straight under the surface. The short-regime change put the transcript under `chat-room-body` (`packages/client/src/features/chat/surfaces/chat-room-surface.tsx`), and the floor rule in `packages/client/src/styles/globals.css` keys on that slot. The probe matched no rule and read 0px. The real room keeps its floor; `tests/client/features/app-shell/surfaces/platform-short-room.suite.ct.tsx` asserts it.
- Fix: the probe takes the room's own nesting. Its cases follow the law: the short room is the cq-28 height step (`docs/law/UI-Architecture-and-Layout.md` §4b axis 4), so the landscape phone at 844x390 floors the transcript too, and the portrait phone at 390x844 is the tall case.
- Ran: the probe cases red 3 of 3 on main at 844x190 and green 9 of 9 after (`--repeat-each=3`); `tests/support/browser` with the short-room and text-scale suites, 200 passed.
