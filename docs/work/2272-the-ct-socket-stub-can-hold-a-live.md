---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: testing
plan: test-foundation
---

# The CT socket stub can hold a live stream

## What

routeOrbSocket ends every stream body, so a CT cannot hold a live server identity, and RestartServerControl or any control gated on the live identity cannot be mounted enabled.

## Why

The restart refusal surface has no rendered test, so the inline-only feedback ruling there is held by the type alone.

## Done when

A CT mounts the restart control enabled through the stub, confirms, and sees the refusal in the dialog and no toast.

## Evidence

Filled at landing: what ran and where its output is.
