---
kind: bug
status: open
updated: 2026-10-13
priority: P3
area: rpg
---

# Bound member dice notation modifiers before execution

## What

Bound modifier parsing in packages/server/src/domain/rpg/verbs/roll-dice.ts before random draws. Unlimited decimal runs can produce non-finite direct service results. Preserve member checks, ability rules and minimum faces.

## Why

The direct service can produce invalid results; router output validation rejects them only after execution. The tool dice producer already bounds notation and modifiers.

## Done when

Real-service and routed controls reject overflowing and out-of-range modifiers before random draws. Valid finite rolls and ability behavior remain unchanged. Reuse the existing numeric policy without copied parsers.

## Evidence

Filled at landing: what ran and where its output is.
