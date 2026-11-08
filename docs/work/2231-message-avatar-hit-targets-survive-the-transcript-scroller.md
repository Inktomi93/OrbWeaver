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

Not fixed. The CT edge probe is written and red: inside the real transcript, the avatar's start-edge point at the reach's edge hits the scroller, not the avatar. The cause is geometric. The avatar's centre sits 16px from the scroller's clip edge and the reach is 44px, so 6px of it is outside the clip; even with the room island's 4px inset moved into the scroller the centre is still 2px short of the 22px the reach needs from the viewport edge. Every fix moves something the owner has pinned: shifting the chip inward 6px breaks the shared edge with the composer, and shifting the reach inward lets its extra 16px overlap the bubble that starts about 6px after the chip. This needs an owner call between those two. Default: shift the chip and the composer's start edge together by the clipped amount; not done here. The red CT is kept in the lane report folder, not committed.
