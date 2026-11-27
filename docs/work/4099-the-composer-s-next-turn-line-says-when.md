---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: chat
---

# The composer's next-turn line says when model availability is unknown

## What

The next-turn line has no case for a failed availability query: availabilityFailed is written in packages/client/src/features/chat/components/composer-next-turn-line.tsx and never read, so the line can name a model while its availability is unknown.

## Why

The line claims a fact the app does not have.

## Done when

A failed availability query renders its own state on the line, checked in a CT that fails the query.

## Evidence

Filled at landing: what ran and where its output is.
