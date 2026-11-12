---
kind: bug
status: doing
updated: 2026-11-12
priority: P1
area: security
lane: wt/agent-a7c2b9c28c863cca8
plan: authorization-and-visibility
---

# An admin cannot cancel the owner's workloads or change the owner's schedules

## What

`isVisibleToCaller` in the workloads domain admits an admin to every owner's rows, so cancel, update schedule, set schedule enabled and delete schedule act on the owner's workloads. D17 makes admin a delegated authority that does not reach owner-only resources; the workloads header rules the opposite and cites no decision. Owner ruling: an admin may not act on the owner's workloads, the same as sessions. Evidence: the security review of the lane's sixteenth leg under reports/review.

## Why

A delegated admin can stop or delete work the owner scheduled, and nothing but the workloads header says that is meant.

## Done when

Each workload and schedule verb refuses an owner-owned target unless the caller is the owner, deciding through the kernel, with a test per verb through the real router as an admin, an owner caller still succeeding, and an admin still acting on another member's rows where that was allowed. The workloads header states the rule and cites D17. The client offers those controls on an owner's row only to the owner.

## Evidence

Filled at landing: what ran and where its output is.
