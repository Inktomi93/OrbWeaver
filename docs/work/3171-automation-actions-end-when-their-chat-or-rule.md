---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: automation
---

# Automation actions end when their chat or rule goes away

## What

packages/server/src/domain/automation/verbs/runtime-ops.ts runs summarizeQuiet, generatePicture and executeToolCalls under the background signal (AutomationRuntimeDeps.backgroundSignal in packages/server/src/domain/automation/contract/runtime-ops.ts), which ends only at shutdown, because a rule dispatch carries no lifetime of its own.

## Why

A quiet generation or a picture a rule starts keeps running at the provider after its chat is deleted or its rule is disabled.

## Done when

Rule dispatch carries a signal tied to the triggering chat and rule as well as shutdown, and the runtime ops thread it.

## Evidence

Filled at landing: what ran and where its output is.
