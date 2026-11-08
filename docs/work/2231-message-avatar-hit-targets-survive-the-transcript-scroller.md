---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# Message avatar hit targets survive the transcript scroller's clip

## What

The avatar reach is a centred 44x44 pseudo-element, but the transcript scroller clips it at its left edge, so the rendered hit area is 38px wide, and the design audit still flags the avatar. The CT checks only the pseudo-element size.

## Why

2174's done line is the rendered target meeting the coarse floor, and the clipped reach misses it.

## Done when

At a coarse pointer the avatar's hit-testable area inside the real transcript meets the floor, proved by a CT that hit-tests points at the reach edges inside the scroller, and the design audit no longer flags it. Source: acceptance part 3 report, 2174.

## Evidence

Ruling (owner direction, 2026-11-08): shift the chip and the composer's start edge inward together so they keep sharing an edge, and the reach clears the clip without overlapping the bubble; keep the shift as small as the floor needs, and note the chat styles' Moonlit Echoes parity.

Cause: a 44px reach centred on a 24px chip needs 10px of room each side. The chip sat 4px inside the transcript scroller's clip, so 6px of its reach was cut. The room's flank row and its wrapper also clip at the same edge (`overflow-x: clip`), so extending the scroller outward does not help; the rows have to move in.

Insets measured at 390px (320 and desktop assert the same relations), before and after:

| Edge | Before | After |
| - | - | - |
| scroller | 4 to 386 | 4 to 386 |
| rows | 8 to 382 | 16 to 374 |
| chip | 8 to 32 | 16 to 40 |
| bubble column start | 38 | 52 |
| composer track | 8 to 382 | 16 to 374 |

The shift is one `block` step (8px each side beyond the old 8px), the smallest the spacing tokens allow: the exact need is 6px for the clip and 10px of gap, and no token sits between `row` and `block`. The chip to bubble gap at a narrow width goes from `field` (6px) to `block` (12px) so the reach does not cover the bubble; `block` joins the narrow gap steps in `packages/ui/src/layout/variants.ts`. That moves the narrow chat styles 8px off the Moonlit Echoes phone inset and the bubble 14px in from the chip; this needs a visual look from the ux-reviewer.

Fix: `packages/ui/src/primitives/message-list/variants.ts` (`chipReach`), `message-list-surface.tsx`, `message-row-layout.tsx` (`gapNarrow="block"`), `room-composer-anchor.tsx` (`paddingInlineNarrow="block"`).

CT: `tests/client/features/chat/components/message-avatar-reach.ct.tsx`. At 320 and 390 it hit-tests the four edges of each avatar's reach inside the real transcript and samples the bubble's start and end edge points for coverage; it also asserts the composer track and the transcript rows share their start and end edges at 320 and 390 and nest at desktop. Red before the fix (the user avatar's start edge hit the scroller at 320 and 390; the edge-sharing cases pass before and after), green after, with `message-avatar-touch-floor.ct.tsx` passing.
