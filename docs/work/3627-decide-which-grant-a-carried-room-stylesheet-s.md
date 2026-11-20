---
kind: decision
status: doing
updated: 2026-11-20
priority: P2
area: security
lane: wt/agent-a9c37ddad85685d6d
plan: chat-html-and-presets
---

# Decide which grant a carried room stylesheet's external media loads under

## What

The room stylesheet cascade carries an earlier character's sheet into a later reply, and that sheet's external media loads under the receiving reply's grant (packages/client/src/features/chat/lib/room-sheets.ts and the reply parts' frame posture). In a group room one character's sheet can load media under another character's media setting. D354 and UI-Theming-and-Content §12.2 record no rule for it.

## Why

A media consent given for one character should not admit another character's media without a ruling.

## Done when

A security-builder rules whether a carried sheet's media loads under its author's grant, the receiver's, or never, records it in §12.2, and a work item is minted for the code.

## Evidence

Filled at landing: what ran and where its output is.
