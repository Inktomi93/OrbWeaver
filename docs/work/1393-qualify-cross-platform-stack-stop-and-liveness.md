---
kind: bug
status: open
updated: 2026-10-27
priority: P2
area: tooling
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

Implementation remains open. The retained test draft is unqualified and has lint findings; no runtime proof exists for the proposed controller.

Checkout: `/home/inktomi/.codex/worktrees/stack-test-isolation/orbweaver`. Recovery snapshot: `5bd9363134f3f360e0077b8d5257d7964038b241`. The working copy is restored; keep the snapshot until qualification.

Read `reports/stickler/platform-stop-handoff.md` before editing. Preserve exact process identity and descendant ownership across parent exit. A failed Windows process observation or termination must remain a refusal.

Use a security executor. Prove old-source failure using only owned disposable children. Run focused Linux controls and distinguish injected Windows cases from native platform execution.
