---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: unwired-code
---

# The open room's read carries only the fields its readers use

## What

ChatDetail (packages/contracts/src/chat/detail.ts) carries starred, forkedAt, opening, compactSummary, compactedAtSeq and updatedAt, which no reader of chat.getChat reads; the client reads starred from the chat summary and the compaction summary from another read. ChatDetail and chatSummarySchema (packages/contracts/src/chat/views.ts) may restate shared fields.

## Why

A read that carries fields nobody reads hides which read is the home of a fact.

## Done when

Shared fields between ChatDetail and the chat summary are declared once, each unread ChatDetail field is removed or given a named reader, and the room's CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
