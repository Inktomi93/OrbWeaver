---
kind: decision
status: open
updated: 2026-11-20
priority: P2
area: chat
---

# Decide whether the chat composer shares the transcript's text column or spans the whole track

## What

The transcript track caps at the chat-width setting while the composer caps at the smaller of that and the reading measure (packages/client/src/styles/globals.css), and the bubble style starts its text column at the left of the track (packages/client/src/features/chat/lib/message-row-variants.ts), so at 1920 the user bubble, the composer and the track end at three different x positions. Option A, recommended: centre the bubble text column under the composer so both ride one column, which keeps the ruling that the composer is never wider than the content column. Option B: widen the composer to the full track, the SillyTavern layout, which amends that ruling.

## Why

The composer sits off the transcript column, which reads as misaligned on every wide screen.

## Done when

The owner picks A or B, the ruling is recorded, and a work item to build it is minted.

## Evidence

Filled at landing: what ran and where its output is.
