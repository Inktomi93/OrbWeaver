---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tests
plan: unwired-code
---

# Test turn fields that hold a message id say so in their name

## What

Test support types such as SentTurn in tests/e2e/support/chat-room.ts name the user turn MessageId userId, which reads as a UserId; pnpm brand-flow reports them as a MessageId under a user-id name.

## Why

A field named userId that holds a message id invites passing it where a user id goes.

## Done when

The fields are renamed userMessageId and pnpm brand-flow lists no MessageId-named-UserId row.

## Evidence

Filled at landing: what ran and where its output is.
