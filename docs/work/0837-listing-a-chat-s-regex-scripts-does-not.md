---
kind: bug
status: open
updated: 2026-10-10
priority: P2
area: chat
---

# Listing a chat's regex scripts does not need a connection

## What

chat.listEffectiveRegex errors 'no connection is bound for chat' when no chat connection is set (packages/server/src/transport/trpc/routers/chat.ts:747-750). Source: the side-eye phone-pass review in docs/reviews/side-eye P2 item 3.

## Why

Opening the This chat tab logs an error and reading regex scripts needs no model.

## Done when

The regex read drops the connection precondition; an integration test lists regex scripts with no chat connection bound.

## Evidence

Filled at landing: what ran and where its output is.
