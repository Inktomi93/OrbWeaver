---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: tooling
---

# Take the grouped runtime dependency update that carries the AI SDK

## What

The grouped Dependabot update of runtime packages fails CI. It moves the AI SDK core to a version whose provider packages resolve to a second copy of the provider interface, and the new version adds an `interrupted` finish reason the inference layer's exhaustive checks do not handle.

## Why

Until it is taken, every grouped runtime update stays blocked and security fixes in that group wait.

## Done when

The update is applied with one copy of the provider interface in the lockfile, the new finish reason is handled where finish reasons are switched on, and the inference tests pass.

## Evidence

Filled at landing: what ran and where its output is.
