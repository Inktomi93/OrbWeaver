---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# undoContinue and revertContinue hooks have one home instead of copies in use-composer-utilities.ts and message-actions-row\.tsx

## What

Define the undoContinue and revertContinue mutation hooks once and import them in use-composer-utilities.ts and message-actions-row\.tsx.

## Why

packages/client/src/features/chat/hooks/use-composer-utilities.ts and use-message-mutations.ts each define the same two createEntityMutation hooks. Two copies can drift in invalidation or error handling.

## Done when

Only one definition of each hook remains under packages/client/src, and both the composer menu and the message actions row call it. Their component tests pass.

## Evidence

Filled at landing: what ran and where its output is.
