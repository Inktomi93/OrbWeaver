---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
---

# Centred room carriers jump on the pane doors

## What

In a real room the message row and the composer jump 12–16px on the first painted frame of three doors, then glide back, sitting outside their corridors for two frames: the CONTEXT door (437 to 449.5px at 1280), the LIST door with both panes docked (340 to 328px), and the 20rem dock (208 to 223.8px). The plain LIST door holds them. The centred counter in the shell motion CSS assumes carriers sit directly in the content slot.

## Why

A visible lurch on every pane toggle in a room.

## Done when

The row and composer hold within 2px on the first painted frame of all three doors, and `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` adds the carriers back to those doors.

## Evidence

- Cause: the counter used the content track's width, but the carriers centre in the room surface, which pads both inline sides by `--spacing-block`; and `.orb-composer-track` carried no counter at all. The two widths disagree where the track crosses the carrier's cap, which is the 12.5px, 12px and 15.8px jumps.
- Fix: `shell/grid.css` derives `--shell-room-track`; `shell/motion.css` computes each carrier's counter from its own cap (`--width-shell-content` for `.orb-chat-track`, `--composer-track` for `.orb-composer-track`) and plays it on both markers, in the settle too; `shell/mobile.css` cancels both.
- Red first: with the carriers added to the CONTEXT door, the both-docked LIST door and the 20rem dock, `app-shell-motion.ct.tsx` failed on the old CSS with the item's numbers (row 449.5 against rest 437, row 328 against 340, row 223.8 against 208, and the composer uncountered). Green after the fix: 13 of 14 pass.
- The case named `with motion off the swap to Home arms no FLIP…` times out in `waitForShellIdle` with and without this change and with and without the 1321 commit; it is not a carrier case.
- A room with a mounted flank column narrows the row's parent by the column; that case is not covered here.
