---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: testing
plan: cross-surface-consistency
---

# The ui-facts feedback scanner follows a failure through a local callback

## What

Make the ui-facts feedback scanner follow a failure signal that passes through a local callback.

## Why

tooling/src/ui-facts/feedback.ts looks for error reads at the mutation consumer. When the failure is handled in a local callback, the scanner misses it. The known misses are the rule editor and add-connection-form-body.

## Done when

A fixture with a failure handled in a local callback is recognized, and pnpm ui-facts no longer lists the rule editor or add-connection-form-body as missing failure feedback.

## Evidence

Filled at landing: what ran and where its output is.

Known misses: the rule editor and `add-connection-form-body`.
