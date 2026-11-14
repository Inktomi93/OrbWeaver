---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# Show players what the story remembers and let them strike a memory

## What

A per-chat memory view lists what the room's memory holds in plain parts: each summary's anchor, text, keywords, the characters it contains, and whether every speaker or one character recalls it. The room's injections show as the notes the room keeps. The host can strike a remembered scene so no later prompt carries it, in any speaker's memory, and restore it. A member sees what is struck but gets no strike or restore control. Standing facts and typed places are not shown: no structured producer exists for them (D55).

## Why

The recall readout shows mode, tier, block and match scores, which a player cannot act on. A player who sees a wrong memory has no way to drop it.

## Done when

the host strikes a summary and the next turn's prompt leaves the scene out while another scene stays, for every speaker of a group room, including each character's own summary of it and its own longer summaries over it; restoring brings it back for every speaker; a member is refused strike and restore with its reason and their view carries no strike id; a restore under another room leaves this room's strike; a strike holds across a re-summary, a host handoff and a solo room gaining a second character (a strike made before or after the second seat); an empty view says whether memory is off for the app, off by the host, too short, pending, or holds only summaries before the caller's history; a member with a join floor sees only summaries wholly above it; a whole-library backup carries the strikes to a same-library and an empty-library restore, and an ex-host's re-import writes none into the room they handed off; the client view is a follow-up.

## Evidence

Filled at landing: what ran and where its output is.
