---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: automation
---

# The spend flag on a rule preset covers every action that calls a model

## What

The spend flag on a rule preset is derived from the tuple of spending action types in `packages/contracts/src/automation/index.ts`, which omits the background action even though its executor makes a quiet model pick (`packages/server/src/domain/automation/engine/`). Derive the flag from each action's own declaration so a new model-calling action cannot be forgotten.

## Why

The picker labels a recurring charge from this flag; a rule that calls a model on every matching message shows as free.

## Done when

A test mints each preset and finds the spend flag set exactly when an action it mints declares a model call, including the background action.

## Evidence

Filled at landing: what ran and where its output is.
