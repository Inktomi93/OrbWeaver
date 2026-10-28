---
kind: bug
status: doing
updated: 2026-10-28
priority: P2
area: tooling
lane: platform_stop_recovery
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

The recovered implementation is in `/home/inktomi/.codex/worktrees/stack-test-isolation/orbweaver`. Qualification and independent security review remain required before integration.

Read `reports/stickler/platform-stop-handoff.md` and `reports/surface-consistency-private/full-verification/status.md` for the current native controls and remaining checks.

Preserve recovery snapshots `f73b0c13033147862eb3afe46ab23adb8d310bb0` and `5bd9363134f3f360e0077b8d5257d7964038b241` until qualification and integration.

Use a security executor. Retain exact process identity and descendants across parent exit. Failed observation or termination must remain a refusal.

Qualify timeout-callback error propagation and descendant retention with discriminating controls. Distinguish native Linux execution, injected Windows cases and unexecuted native platform behavior.
