---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: chat
lane: wt/agent-a05e04b95b7ac33b0
plan: unwired-code
---

# The open room's read carries only the fields its readers use

## What

ChatDetail (packages/contracts/src/chat/detail.ts) and chatSummarySchema (packages/contracts/src/chat/views.ts) each declare the chat row fields by hand. ChatDetail also carries starred, opening, compactSummary, compactedAtSeq and updatedAt, which no reader of chat.getChat reads, and forkedAt, which nothing shows. Characters keep star on the list row and archive in the open character's actions menu (the open slice of packages/client/src/features/character/lib/character-actions.ts); a room offers archive only from the chat list.

## Why

A read that carries fields nobody reads hides which read owns a fact, and the two entities place the same actions differently.

## Done when

The chat row fields are declared once and both the detail and the summary build on them; starred, opening, compactSummary, compactedAtSeq and updatedAt leave ChatDetail; the room's Chat options gain an open slice built like the character actions table, with Archive and Unarchive using the chat archive copy; the fork origin shows beside Back to parent chat as the parent's title and forkedAt; CTs cover archive from the room and the fork origin, and the room's CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
