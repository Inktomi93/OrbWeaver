---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# One function answers whether a room's host consents

## What

The check that a room's host is present and enabled is written by hand in the turn load (`loadRoom` in `packages/server/src/domain/chat/verbs/turn.ts`), in `packages/server/src/domain/chat/verbs/generate-image.ts` and in `packages/server/src/domain/chat/verbs/load-consenting-host.ts`. Each reads `presentAndEnabledHumanUserIdsOf` and then tests the host against it.

## Why

Hand-written copies of one rule can drift apart when the consent set changes.

## Done when

One function in the chat domain answers it, every site calls it, and the existing disabled-host and hostless tests pass unchanged.

## Evidence

Filled at landing: what ran and where its output is.
