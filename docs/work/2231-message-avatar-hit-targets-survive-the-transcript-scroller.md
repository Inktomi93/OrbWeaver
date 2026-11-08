---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-acaf86636920912a1
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

Insets measured at 390px (320 and desktop assert the same relations), comfortable and compact density alike, before and after:

| Edge | Before | After |
| - | - | - |
| scroller | 4 to 386 | 4 to 386 |
| rows | 8 to 382 | 14 to 376 |
| chip | 8 to 32 | 14 to 38 |
| bubble column start | 38 | 48 |
| composer track | 8 to 382 | 14 to 376 |

The shift is the reach itself, a new token `--spacing-avatar-reach` (`(touch-target - avatar-sm) / 2`, floored at the field step for a fine pointer): 10px each side, not a density step, so compact density (where `block` is 8px) gets the same 10px. The earlier `block` step (12px comfortable, 8px compact) overshot comfortable by 2px and fell short in compact. The chip to bubble gap at a narrow width goes from `field` (6px) to the same reach, so the reach does not cover the bubble. Below the `cq-16` container step (a pane enlarged by text scale until a line holds a few words) the rows, the gap and the composer keep their old `tight` and `field` steps: at 200% text and 300% layout on the phone the extra inset split words and pushed Generate off its row (`platform-text-scale.suite.ct.tsx`, 120 passed, no threshold or measured table changed). The phone chat styles sit 6px further in than Moonlit Echoes' 8px; this needs a visual look from the ux-reviewer.

Fix: token in `packages/ui/src/tokens/tokens.json`; `packages/ui/src/lib/avatar-reach.ts` (`AVATAR_REACH_PADDING`, `AVATAR_REACH_GAP`); `packages/ui/src/layout/variants.ts` and `message-list/variants.ts` (`avatarReach`); `message-list-surface.tsx`, `message-row-layout.tsx`, `room-composer-anchor.tsx` take it. `picture-button/variants.ts` raises the floor-reach chip (`z-raised`) so Echo's header chip keeps its reach above the card's art overlay.

CT: `tests/client/features/chat/components/message-avatar-reach.ct.tsx`. At 320 and 390, in comfortable and compact density, for every chat style that paints an avatar (the stock document paints none), it hit-tests the four edges of each avatar's reach inside the real transcript and samples the bubble's start and end edge points for coverage when the chip stands outside the card (an avatar seated in its card, as in Whisper, Hush, Echo's header and Ripple's welded portrait, belongs to the card). It also asserts the composer track and the transcript rows share their start and end edges at 320, 390 and desktop in both densities. Red before the fix: with the reach token set to `block` the compact cells fail (compact flat start edge, 8px against the 10px need); Echo failed its bottom edge on main (a card overlay above the chip's reach) and is green after the raise. `message-avatar-touch-floor.ct.tsx` passes.
