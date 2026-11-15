---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# snap --theme works on a local-auth stage

## What

On a --stage-auth local stage, the --theme shim's settings.listThemes call answers 403 and the run renders the account's own theme.

## Why

Theme cases on a clone with owner and member need the UI path, which writes to the stage.

## Done when

\--theme <name> renders that theme on a --stage-auth local stage without writing settings.

## Evidence

Filled at landing: what ran and where its output is.
