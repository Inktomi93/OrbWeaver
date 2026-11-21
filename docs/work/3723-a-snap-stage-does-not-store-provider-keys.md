---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
---

# A snap stage does not store provider keys inherited from the caller's shell

## What

Every snap stage boot inherits the caller's whole shell env, so a shell that exports OPENROUTER_API_KEY makes the stage server store it as a credential without --stage-connection.

## Why

A stage should hold a key only when the run asked for one.

## Done when

Stage boots pass provider key names only when --stage-connection names one, with a tooling test.

## Evidence

Filled at landing: what ran and where its output is.
