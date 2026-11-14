---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# A card seated in a fork after the copy never summarizes the copied story

## What

A fork keeps only the seats of cards the forker owns, and a card seated afterwards joins at the fork's head. Its witness horizon starts there, so the build skips every copied block for its bucket. A member who forks a room seating only the host's cards gets a solo fork whose memory never covers the copied story; only a group fork's shared bucket summarizes it.

## Why

The fork copies the story to continue it, and memory of that story is what keeps the continuation coherent. A solo member fork silently starts with no memory of anything it copied.

## Done when

A ruling says whether a seat added to a fork witnesses the copied canon, and the fork or the build follows it with a case that builds a solo member fork's memory over its copied blocks.

## Evidence

Filled at landing: what ran and where its output is.
