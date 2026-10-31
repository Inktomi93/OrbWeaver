---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: chat
plan: cross-surface-consistency
---

# Show the message position number for the Show message ID setting

## What

Owner ruling: the Show message ID toggle shows the message's position in the room as #n, as SillyTavern and Moonlit do, not the stable internal TypeID, which wraps to two lines under the Ripple portrait. Derive n from the message's sequence in the room the way the transcript orders rows.

## Why

The internal id reads as noise and breaks the Ripple portrait layout; the owner chose parity.

## Done when

Every chat style shows #n when the toggle is on; the number matches the row's position after edits, deletes and swipes; a CT pins it under the Ripple portrait and in the metadata row of one other style.

## Evidence

Filled at landing: what ran and where its output is.
