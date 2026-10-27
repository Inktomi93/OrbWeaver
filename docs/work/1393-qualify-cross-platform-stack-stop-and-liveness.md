---
kind: bug
status: doing
updated: 2026-10-27
priority: P2
area: tooling
lane: tooling_isolation
plan: cross-surface-consistency
---

# Qualify cross-platform stack stop and liveness

## What

Route stack process-group escalation and liveness through the owned platform-aware process boundary. Preserve descendant tracking and refusal when termination cannot be established.

## Why

POSIX negative-pid behavior does not establish Windows process-tree termination. Failed process observation or taskkill must not become a false stopped result.

## Done when

Use the existing process adapter, preserve ownership before signaling, retain state on failed termination, and prove supported platform branches with focused controls. Distinguish native platform execution from injected cases.

## Evidence

Filled at landing: what ran and where its output is.
