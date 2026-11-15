---
kind: decision
status: open
updated: 2026-11-15
priority: P2
area: rpg
---

# The owner rules whether a dice result in a shared room must prove a server roll

## What

A dice stamp in a player message is authored text; the comment in `packages/server/src/domain/rpg/chat-ops/gather.ts` says it is not proof of a server roll, so a member can type one. Record a ruling on whether a roll must be verifiable in a shared room. If it must, store the roll on the server, have the message refer to it, and render a typed stamp as plain text.

## Why

In a shared room a typed result is indistinguishable from a rolled one, which matters once the model treats the stamp as the outcome.

## Done when

A decision record states whether a roll is verifiable and, if so, a test shows a typed stamp rendering as plain text and a server-rolled one rendering as a roll.

## Evidence

Filled at landing: what ran and where its output is.
