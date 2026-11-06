---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: connection
---

# Apply the first-model step's background-work choice when it is dismissed

## What

In `packages/client/src/features/credentials/components/first-model-setup.tsx`, closing the step with its close control leaves Utility unset and Allow background work off, while the step states that background work is turned on. Make dismissal and Finish agree, or reword the step.

## Why

The step says one thing and the saved state is another.

## Done when

Dismissing the step leaves state that matches its text, and a CT pins dismissal and Finish.

## Evidence

Filled at landing: what ran and where its output is.
