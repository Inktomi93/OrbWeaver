---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: chat
---

# Wire or delete the unused prompt preview verbs

## What

ChatService.peekPrompt and previewSection have no router procedure and no caller; they now render in UTC.

## Why

Unwired code is a question about intent.

## Done when

Each is wired to a caller or deleted with a reason.

## Evidence

Filled at landing: what ran and where its output is.
