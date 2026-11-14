---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# A floored fork whose floor is off a memory block edge carries strikes that match no block

## What

A fork counts its memory blocks from its first copied message. When a member's fork starts at a floor that is not on a block edge, every block shifts, so a strike carried from the parent room matches no summary in the fork and stays on the unmatched list. Ruling: a carried strike is re-keyed onto every fork block its span overlaps, so the host's strike keeps holding in the fork even where the fork's blocks cut the scene differently. A strike whose span lies wholly before the fork's floor is not carried.

## Why

A host's strike is a promise that the scene stays out of prompts; a fork must keep it or say plainly that it did not.

## Done when

A fork re-keys each carried strike onto every fork block its span overlaps, inside the fork's own batch and without a collision on the span-unique index. A case forks at a floor off a block edge, builds the fork's memory and asserts the struck scene is absent from a forced-turn prompt and that no carried strike is listed unmatched.

## Evidence

Filled at landing: what ran and where its output is.
