---
kind: bug
status: doing
updated: 2026-10-11
priority: P1
area: client
lane: wt/agent-a99f2fa53745aa239
---

# A generated reply in a room with no user turn gets the greeting pager and can be overwritten

## What

In a room with no user message yet, a generated assistant reply renders the greeting pager. Pressing Next greeting overwrites the generated text with greeting 1 and marks the message edited, with no confirmation. Bind the greeting strip only to seeded greeting rows (packages/client/src/features/chat/lib/greeting-window\.ts), and make the server setSeededGreeting verb refuse any row that is not a seeded greeting.

## Why

Side-eye on owner data found a generated reply silently replaced by a greeting; the user loses the reply.

## Done when

A generated reply in a no-user-turn room shows the normal swipe group, not the greeting pager; setSeededGreeting refuses a non-greeting row with a typed error; a CT and an int test cover both, and each fails on the current code.

## Evidence

Filled at landing: what ran and where its output is.
